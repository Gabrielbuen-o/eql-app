-- =====================================================================
-- EQL Group — atualização 05: registro de atividades (log)
-- Guarda cada criação, alteração e exclusão feita pelo app: quem, quando,
-- o quê e o que mudou. Só administradores enxergam.
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

create table if not exists public.atividades (
  id           bigint generated always as identity primary key,
  quando       timestamptz not null default now(),
  usuario_id   uuid references public.perfis(id) on delete set null,
  tabela       text not null,
  acao         text not null check (acao in ('criou', 'alterou', 'apagou')),
  registro_id  text,
  rotulo       text,          -- nome legível do item (ex.: "Riviera", "Rodrigo em Scala · 08/10")
  mudancas     jsonb          -- nas alterações: { campo: [antes, depois] }
);
create index if not exists atividades_quando_idx on public.atividades (quando desc);
create index if not exists atividades_usuario_idx on public.atividades (usuario_id, quando desc);

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
    else r ->> 'nome'
  end;

  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas)
  values (uid, tg_table_name, v_acao, r ->> 'id', rot, case when v_acao = 'alterou' then mud end);

  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;

-- troca o registro antigo (só "última modificação") por este, completo
do $$
declare t text;
begin
  foreach t in array array['demandas', 'funcionarios', 'alocacoes', 'ausencias', 'veiculos', 'veiculo_alocacoes', 'perfis'] loop
    execute format('drop trigger if exists registrar_modificacao on public.%I', t);
    execute format('drop trigger if exists registrar_atividade on public.%I', t);
    execute format('create trigger registrar_atividade after insert or update or delete on public.%I
                    for each row execute function public.registrar_atividade()', t);
  end loop;
end $$;

-- Só administradores leem o registro; ninguém edita nem apaga pelo app
alter table public.atividades enable row level security;
drop policy if exists "atividades ler" on public.atividades;
create policy "atividades ler" on public.atividades for select to authenticated
  using (public.meu_papel() = 'admin');

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atividades') then
    alter publication supabase_realtime add table public.atividades;
  end if;
end $$;
