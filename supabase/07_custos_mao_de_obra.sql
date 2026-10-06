-- =====================================================================
-- EQL Group — atualização 07: custo por funcionário e custo de mão de obra por obra
-- Cada funcionário tem um custo por dia (com histórico: um aumento vale a partir
-- da data informada; dias anteriores continuam com o valor antigo).
-- O custo da obra = dias de cada funcionário na agenda × custo do dia.
-- Só administradores veem e editam valores.
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

create table if not exists public.custos_funcionarios (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  custo_diario    numeric(10, 2) not null check (custo_diario >= 0),
  vigente_desde   date not null default current_date,
  criado_em       timestamptz not null default now(),
  unique (funcionario_id, vigente_desde)
);

alter table public.custos_funcionarios enable row level security;
drop policy if exists "custos admin" on public.custos_funcionarios;
create policy "custos admin" on public.custos_funcionarios for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

-- Custo de mão de obra por demanda e funcionário (devolve vazio para quem não é admin)
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

-- Registro de atividades também passa a anotar mudanças de custo
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
    else r ->> 'nome'
  end;

  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas)
  values (uid, tg_table_name, v_acao, r ->> 'id', rot, case when v_acao = 'alterou' then mud end);

  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;


drop trigger if exists registrar_atividade on public.custos_funcionarios;
create trigger registrar_atividade after insert or update or delete on public.custos_funcionarios
for each row execute function public.registrar_atividade();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custos_funcionarios') then
    alter publication supabase_realtime add table public.custos_funcionarios;
  end if;
end $$;
