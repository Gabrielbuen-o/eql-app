-- =====================================================================
-- EQL Group — atualização 10: DESFAZER pelo registro de atividades
--  * cada exclusão passa a guardar uma cópia completa do item (para restaurar)
--  * ações feitas no mesmo clique ficam agrupadas (ex.: apagar uma obra e a agenda dela)
--  * função desfazer_atividade(): só administradores; o próprio desfazer também fica registrado
-- Precisa do registro de atividades (05) já rodado.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

alter table public.atividades add column if not exists dados jsonb;          -- cópia do item apagado
alter table public.atividades add column if not exists transacao bigint;     -- mesmo clique = mesmo número
alter table public.atividades add column if not exists desfeita_em timestamptz;
alter table public.atividades add column if not exists desfeita_por uuid references public.perfis(id) on delete set null;
alter table public.atividades add column if not exists desfaz_id bigint;     -- esta linha foi um "desfazer" de qual atividade
create index if not exists atividades_transacao_idx on public.atividades (transacao);

-- Registro de atividades (mesmo de antes + cópia, agrupamento e marca de "desfazer")
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

  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas, dados, transacao, desfaz_id)
  values (uid, tg_table_name, v_acao, r ->> 'id', rot, case when v_acao = 'alterou' then mud end,
          case when v_acao = 'apagou' then o end,               -- cópia completa para poder restaurar
          txid_current(),                                       -- agrupa o que foi feito no mesmo clique
          nullif(current_setting('eql.desfazendo', true), '')::bigint);

  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;

-- ---------- Desfazer ----------
-- Desfaz a atividade e tudo o que foi feito no mesmo clique.
-- Se o item foi alterado de novo depois, recusa (a menos que p_forcar = true).
create or replace function public.desfazer_atividade(p_id bigint, p_forcar boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  a record; g record;
  n int := 0;
  atual jsonb; antigos jsonb; k text; cols text;
begin
  if coalesce(public.meu_papel(), '') <> 'admin' then
    raise exception 'Só administradores podem desfazer.';
  end if;
  select * into a from atividades where id = p_id;
  if not found then raise exception 'Atividade não encontrada.'; end if;
  if a.desfeita_em is not null then raise exception 'Isso já foi desfeito.'; end if;

  perform set_config('eql.desfazendo', p_id::text, true);

  for g in
    select * from atividades
     where id = a.id or (a.transacao is not null and transacao = a.transacao and desfeita_em is null)
     order by
       -- restaurar: primeiro obras/funcionários/veículos, depois a agenda que depende deles
       case when acao = 'apagou' and tabela in ('demandas', 'funcionarios', 'veiculos') then 0
            when acao = 'apagou' then 1 else 2 end,
       case when acao = 'apagou' then id else -id end
  loop
    if g.tabela = 'perfis' and g.acao <> 'alterou' then
      raise exception 'Criação ou exclusão de usuários não pode ser desfeita por aqui.';
    end if;

    if g.acao = 'criou' then
      execute format('delete from public.%I where id::text = $1', g.tabela) using g.registro_id;

    elsif g.acao = 'apagou' then
      if g.dados is null then
        raise exception 'SEM_COPIA: "%" foi apagado antes do recurso de desfazer existir; não há cópia para restaurar.', coalesce(g.rotulo, '?');
      end if;
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1) on conflict do nothing',
                     g.tabela, g.tabela) using g.dados;

    else -- alterou: volta os campos para o valor de antes
      execute format('select to_jsonb(t) from public.%I t where id::text = $1', g.tabela) into atual using g.registro_id;
      if atual is null then
        raise exception 'SUMIU: "%" não existe mais (foi apagado depois). Desfaça a exclusão primeiro.', coalesce(g.rotulo, '?');
      end if;
      if not p_forcar then
        for k in select jsonb_object_keys(g.mudancas) loop
          if (atual -> k) is distinct from (g.mudancas -> k -> 1) then
            raise exception 'CONFLITO: "%" foi alterado de novo depois disso.', coalesce(g.rotulo, '?');
          end if;
        end loop;
      end if;
      select jsonb_object_agg(key, value -> 0) into antigos from jsonb_each(g.mudancas);
      select string_agg(format('%I = r.%I', key, key), ', ') into cols from jsonb_object_keys(g.mudancas) as key;
      if cols is not null then
        execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.id::text = $2',
                       g.tabela, cols, g.tabela) using antigos, g.registro_id;
      end if;
    end if;

    update atividades set desfeita_em = now(), desfeita_por = auth.uid() where id = g.id;
    n := n + 1;
  end loop;

  perform set_config('eql.desfazendo', '', true);
  return n;
end $$;

revoke all on function public.desfazer_atividade(bigint, boolean) from public, anon;
grant execute on function public.desfazer_atividade(bigint, boolean) to authenticated;
