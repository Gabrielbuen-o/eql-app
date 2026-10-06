-- =====================================================================
-- EQL Group — atualização 07: custos e resultado das obras
--  * custo por dia de cada funcionário (com histórico de valores)
--  * valor vendido e imposto de cada demanda
--  * lançamentos de custo por dia: material, combustível e despesas extras
--  * mão de obra calculada pela agenda (dias × custo do dia)
-- Tudo isso só administradores veem e editam.
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

-- Custo por dia de cada funcionário. Um aumento vale a partir da data informada.
create table if not exists public.custos_funcionarios (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  custo_diario    numeric(10, 2) not null check (custo_diario >= 0),
  vigente_desde   date not null default current_date,
  criado_em       timestamptz not null default now(),
  unique (funcionario_id, vigente_desde)
);

-- Valor vendido e imposto de cada demanda (separado da demanda para só admin ver)
create table if not exists public.financeiro_demandas (
  demanda_id     uuid primary key references public.demandas(id) on delete cascade,
  valor_vendido  numeric(12, 2) check (valor_vendido >= 0),
  imposto_pct    numeric(5, 2) check (imposto_pct >= 0 and imposto_pct <= 100),
  atualizado_em  timestamptz not null default now()
);

-- Custos lançados por dia em cada demanda
create table if not exists public.custos_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references public.demandas(id) on delete cascade,
  dia         date not null default current_date,
  tipo        text not null check (tipo in ('material', 'combustivel', 'despesa')),
  valor       numeric(12, 2) not null check (valor >= 0),
  descricao   text,
  criado_por  uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists custos_lancamentos_demanda_idx on public.custos_lancamentos (demanda_id, dia);

-- Só administradores
do $$
declare t text;
begin
  foreach t in array array['custos_funcionarios', 'financeiro_demandas', 'custos_lancamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "so admin" on public.%I', t);
    execute format('create policy "so admin" on public.%I for all to authenticated
                    using (public.meu_papel() = ''admin'') with check (public.meu_papel() = ''admin'')', t);
  end loop;
end $$;
drop policy if exists "custos admin" on public.custos_funcionarios;

-- Mão de obra por demanda e funcionário (devolve vazio para quem não é admin)
create or replace function public.custo_demandas()
returns table (demanda_id uuid, funcionario_id uuid, dias int, custo numeric, dias_sem_custo int)
language sql stable security definer set search_path = public as $$
  select a.demanda_id, a.funcionario_id,
         count(*)::int,
         coalesce(sum(c.custo_diario), 0),
         (count(*) filter (where c.custo_diario is null))::int
  from public.alocacoes a
  left join lateral (
    -- valor vigente no dia; se o dia for anterior ao primeiro valor cadastrado, usa o primeiro
    select cf.custo_diario from public.custos_funcionarios cf
    where cf.funcionario_id = a.funcionario_id
    order by (cf.vigente_desde <= a.dia) desc,
             case when cf.vigente_desde <= a.dia then cf.vigente_desde end desc nulls last,
             cf.vigente_desde asc
    limit 1
  ) c on true
  where public.meu_papel() = 'admin'
  group by a.demanda_id, a.funcionario_id
$$;

-- Registro de atividades passa a anotar também custos e valores
create or replace function public.registrar_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r jsonb; o jsonb; n jsonb;
  mud jsonb := '{}'::jsonb;
  k text;
  ignorar text[] := array['id', 'criado_em', 'atualizado_em', 'atualizado_por', 'ultimo_acesso', 'ultima_modificacao', 'preferencias'];
  v_acao text; rot text;
  nome_func text; nome_dem text; nome_veic text; dia text;
begin
  if uid is null then return null; end if; -- mudanças feitas direto no painel do Supabase não entram

  if tg_op = 'INSERT' then
    n := to_jsonb(new); r := n; v_acao := 'criou';
  elsif tg_op = 'DELETE' then
    o := to_jsonb(old); r := o; v_acao := 'apagou';
  else
    o := to_jsonb(old); n := to_jsonb(new); r := n; v_acao := 'alterou';
    for k in select jsonb_object_keys(n) loop
      if not (k = any(ignorar)) and (o -> k) is distinct from (n -> k) then
        mud := mud || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if mud = '{}'::jsonb then return null; end if; -- ex.: só o "último acesso" mudou
  end if;

  if r ? 'funcionario_id' then select nome into nome_func from funcionarios where id = (r ->> 'funcionario_id')::uuid; end if;
  if r ? 'veiculo_id' then select nome into nome_veic from veiculos where id = (r ->> 'veiculo_id')::uuid; end if;
  if r ? 'demanda_id' then select nome into nome_dem from demandas where id = (r ->> 'demanda_id')::uuid; end if;
  if r ? 'dia' then dia := to_char((r ->> 'dia')::date, 'DD/MM'); end if;

  rot := case tg_table_name
    when 'alocacoes' then coalesce(nome_func, '?') || ' em ' || coalesce(nome_dem, '(demanda apagada)') || ' · ' || coalesce(dia, '')
    when 'veiculo_alocacoes' then coalesce(nome_veic, '?') || ' em ' || coalesce(nome_dem, '(demanda apagada)') || ' · ' || coalesce(dia, '')
    when 'ausencias' then coalesce(nome_func, '?') || ' · ' || case r ->> 'tipo' when 'ferias' then 'férias' else 'folga' end || ' · ' || coalesce(dia, '')
    when 'perfis' then coalesce(r ->> 'nome', r ->> 'email')
    when 'custos_funcionarios' then coalesce(nome_func, '?') || ' · R$ ' || replace(r ->> 'custo_diario', '.', ',') || '/dia a partir de ' || to_char((r ->> 'vigente_desde')::date, 'DD/MM/YY')
    when 'financeiro_demandas' then coalesce(nome_dem, '(demanda apagada)')
    when 'custos_lancamentos' then coalesce(nome_dem, '(demanda apagada)') || ' · '
      || case r ->> 'tipo' when 'material' then 'material' when 'combustivel' then 'combustível' else 'despesa extra' end
      || ' · R$ ' || replace(r ->> 'valor', '.', ',') || ' · ' || coalesce(dia, '')
    else r ->> 'nome'
  end;

  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas)
  values (uid, tg_table_name, v_acao, r ->> 'id', rot, case when v_acao = 'alterou' then mud end);

  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;


do $$
declare t text;
begin
  foreach t in array array['custos_funcionarios', 'financeiro_demandas', 'custos_lancamentos'] loop
    execute format('drop trigger if exists registrar_atividade on public.%I', t);
    execute format('create trigger registrar_atividade after insert or update or delete on public.%I
                    for each row execute function public.registrar_atividade()', t);
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
