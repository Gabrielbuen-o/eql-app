-- =====================================================================
-- EQL Group — atualização 20
--  * recebimentos de cada obra (data de entrada, NF, valor) → saldo a receber
--  * adicionais da obra: o gerente inclui o item (sem valor) e o administrador põe o valor
--  * Falta, junto de Folga e Férias
--  * veículo fora de obra na agenda (manutenção ou outro motivo)
--  * relatório de ancoragem: guarda os mastros/skids e as bases de cada um (também no portal do cliente)
-- Precisa das atualizações anteriores (até a 19) já rodadas.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- ---------- Recebimentos (só administradores) ----------
create table if not exists public.demanda_recebimentos (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references public.demandas(id) on delete cascade,
  dia         date not null default current_date,           -- data de entrada do dinheiro
  nf          text,                                         -- número da nota fiscal
  valor       numeric(12, 2) not null check (valor > 0),
  observacao  text,
  criado_por  uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists demanda_recebimentos_demanda_idx on public.demanda_recebimentos (demanda_id, dia);

alter table public.demanda_recebimentos enable row level security;
drop policy if exists "so admin" on public.demanda_recebimentos;
create policy "so admin" on public.demanda_recebimentos for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

-- ---------- Adicionais da obra ----------
-- valor vazio = item incluído pelo gerente, esperando o administrador colocar o valor
create table if not exists public.demanda_adicionais (
  id          uuid primary key default gen_random_uuid(),
  demanda_id  uuid not null references public.demandas(id) on delete cascade,
  descricao   text not null check (length(trim(descricao)) > 0),
  valor       numeric(12, 2) check (valor >= 0),
  dia         date not null default current_date,
  criado_por  uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists demanda_adicionais_demanda_idx on public.demanda_adicionais (demanda_id);

alter table public.demanda_adicionais enable row level security;
drop policy if exists "adicionais admin" on public.demanda_adicionais;
drop policy if exists "adicionais gerente inclui" on public.demanda_adicionais;
drop policy if exists "adicionais gerente apaga" on public.demanda_adicionais;
create policy "adicionais admin" on public.demanda_adicionais for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');
-- gerente inclui só a descrição (nunca valor)
create policy "adicionais gerente inclui" on public.demanda_adicionais for insert to authenticated
  with check (public.meu_papel() = 'gerente' and valor is null);
-- gerente pode tirar um item que ele mesmo incluiu enquanto ainda está sem valor
create policy "adicionais gerente apaga" on public.demanda_adicionais for delete to authenticated
  using (public.meu_papel() = 'gerente' and criado_por = auth.uid() and valor is null);

-- o gerente vê os itens sem o valor
create or replace view public.adicionais_publicos as
  select a.id, a.demanda_id, a.descricao, a.dia, a.criado_por, a.criado_em, (a.valor is not null) as com_valor
    from public.demanda_adicionais a
   where public.meu_papel() in ('admin', 'gerente');
revoke all on public.adicionais_publicos from public, anon;
grant select on public.adicionais_publicos to authenticated;

-- ---------- Falta ----------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.ausencias'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.ausencias drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.ausencias add constraint ausencias_tipo_check check (tipo in ('folga', 'ferias', 'falta'));

-- ---------- Veículo fora de obra ----------
create table if not exists public.veiculo_fora (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references public.veiculos(id) on delete cascade,
  dia         date not null,
  motivo      text not null default 'manutencao' check (motivo in ('manutencao', 'outro')),
  observacao  text,                                        -- ex.: "emprestado para a fábrica", "documentação"
  criado_em   timestamptz not null default now(),
  unique (veiculo_id, dia)
);
create index if not exists veiculo_fora_dia_idx on public.veiculo_fora (dia);

alter table public.veiculo_fora enable row level security;
drop policy if exists "veiculo fora ler" on public.veiculo_fora;
drop policy if exists "veiculo fora editar" on public.veiculo_fora;
create policy "veiculo fora ler" on public.veiculo_fora for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "veiculo fora editar" on public.veiculo_fora for all to authenticated
  using (public.meu_papel() in ('admin', 'gerente')) with check (public.meu_papel() in ('admin', 'gerente'));

-- ---------- Relatório de ancoragem ----------
-- mastros e skids do relatório: [{ id, tipo: 'mastro'|'skid', n, estaios?, bases? }]
alter table public.relatorios add column if not exists estrutura jsonb;
-- ancoragem com vários mastros passa fácil de 300 fotos
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.relatorios'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%jsonb_array_length%'
  loop
    execute format('alter table public.relatorios drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.relatorios add constraint relatorios_arquivos_limite
  check (jsonb_typeof(arquivos) = 'array' and jsonb_array_length(arquivos) <= 1000);

-- portal do cliente: relatório de ancoragem vai com os mastros/skids (para agrupar as fotos por base)
create or replace function public.portal_cliente_dados(g text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  obras uuid[];
begin
  if g is null then
    return jsonb_build_object('grupo', null, 'obras', '[]'::jsonb, 'equipe', '[]'::jsonb, 'relatorios', '[]'::jsonb);
  end if;

  select coalesce(array_agg(d.id), '{}') into obras
    from public.demandas d
   where lower(trim(d.grupo)) = lower(g) and d.empresa <> 'eko';

  return jsonb_build_object(
    'grupo', g,
    'obras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'nome', d.nome, 'empresa', d.empresa, 'fase', d.fase, 'percentual', d.percentual,
               'inicio', d.inicio, 'entrega', d.entrega, 'arquivada', d.arquivada, 'atualizado_em', d.atualizado_em)
             order by d.arquivada, d.entrega nulls last, d.nome)
        from public.demandas d where d.id = any(obras)), '[]'::jsonb),
    -- equipe: últimos 60 dias e próximos 30
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object('demanda_id', a.demanda_id, 'dia', a.dia, 'funcionario_id', f.id, 'nome', f.nome, 'funcao', f.funcao)
             order by a.dia, f.nome)
        from public.alocacoes a join public.funcionarios f on f.id = a.funcionario_id
       where a.demanda_id = any(obras) and a.dia between current_date - 60 and current_date + 30), '[]'::jsonb),
    -- relatórios concluídos (o que ainda está sendo feito no campo não aparece)
    'relatorios', coalesce((
      select jsonb_agg(x order by x->>'dia' desc, x->>'criado_em' desc) from (
        select jsonb_build_object(
                 'id', r.id, 'demanda_id', r.demanda_id, 'dia', r.dia, 'tipo', r.tipo, 'observacao', r.observacao,
                 'arquivos', r.arquivos, 'campos', coalesce(r.campos, '{}'::jsonb), 'estrutura', r.estrutura, 'criado_em', r.criado_em, 'status', r.status,
                 'funcionario_id', r.funcionario_id, 'funcionario', f.nome) as x
          from public.relatorios r left join public.funcionarios f on f.id = r.funcionario_id
         where r.demanda_id = any(obras) and r.status = 'enviado'
         order by r.dia desc, r.criado_em desc
         limit 600) t), '[]'::jsonb)
  );
end $$;
revoke all on function public.portal_cliente_dados(text) from public, anon, authenticated;

-- ---------- Registro de atividades: nomes das novas tabelas ----------
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
    when 'veiculo_fora' then coalesce(nome_veic, '?') || ' · ' || case r ->> 'motivo' when 'manutencao' then 'manutenção' else coalesce(nullif(r ->> 'observacao', ''), 'fora de obra') end || ' · ' || coalesce(dia, '')
    when 'ausencias' then coalesce(nome_func, '?') || ' · ' || case r ->> 'tipo' when 'ferias' then 'férias' when 'falta' then 'falta' else 'folga' end || ' · ' || coalesce(dia, '')
    when 'perfis' then coalesce(r ->> 'nome', r ->> 'email')
    when 'custos_funcionarios' then coalesce(nome_func, '?') || ' · R$ ' || replace(r ->> 'custo_diario', '.', ',') || '/dia a partir de ' || to_char((r ->> 'vigente_desde')::date, 'DD/MM/YY')
    when 'financeiro_demandas' then coalesce(nome_dem, '(demanda apagada)')
    when 'custos_lancamentos' then coalesce(nome_dem, '(demanda apagada)') || ' · '
      || case r ->> 'tipo' when 'material' then 'material' when 'combustivel' then 'combustível' else 'despesa extra' end
      || ' · R$ ' || replace(r ->> 'valor', '.', ',') || ' · ' || coalesce(dia, '')
    when 'demanda_recebimentos' then coalesce(nome_dem, '(demanda apagada)') || ' · recebido R$ ' || replace(r ->> 'valor', '.', ',')
      || coalesce(' · NF ' || nullif(r ->> 'nf', ''), '') || ' · ' || coalesce(dia, '')
    when 'demanda_adicionais' then coalesce(nome_dem, '(demanda apagada)') || ' · adicional: ' || coalesce(r ->> 'descricao', '?')
      || coalesce(' · R$ ' || replace(r ->> 'valor', '.', ','), '')
    else r ->> 'nome'
  end;

  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas, dados, transacao, desfaz_id)
  values (uid, tg_table_name, v_acao, r ->> 'id', rot, case when v_acao = 'alterou' then mud end,
          case when v_acao = 'apagou' then o end,               -- cópia completa para poder restaurar
          txid_current(),                                       -- agrupa o que foi feito no mesmo clique
          nullif(current_setting('eql.desfazendo', true), '')::bigint);

  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['demanda_recebimentos', 'demanda_adicionais', 'veiculo_fora'] loop
    execute format('drop trigger if exists registrar_atividade on public.%I', t);
    execute format('create trigger registrar_atividade after insert or update or delete on public.%I
                    for each row execute function public.registrar_atividade()', t);
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
