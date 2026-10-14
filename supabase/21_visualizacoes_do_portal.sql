-- =====================================================================
-- EQL Group — atualização 21: o que cada cliente vê no portal
-- Configurações → Visualizações. Um padrão para todos os clientes e, se quiser,
-- ajustes por cliente (Help, Ageplan…) e obras escondidas uma a uma.
-- As regras valem no banco: o que está desligado nem sai do servidor.
-- Precisa da atualização 20 já rodada.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- escopo: '*' = todos os clientes · id do cliente (tabela clientes) = só aquele cliente
create table if not exists public.portal_config (
  escopo         text primary key,
  config         jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references public.perfis(id) on delete set null
);
alter table public.portal_config enable row level security;
drop policy if exists "so admin" on public.portal_config;
create policy "so admin" on public.portal_config for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

create or replace function public.portal_config_tocar() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); new.atualizado_por := coalesce(auth.uid(), new.atualizado_por); return new; end $$;
drop trigger if exists portal_config_tocar on public.portal_config;
create trigger portal_config_tocar before insert or update on public.portal_config
for each row execute function public.portal_config_tocar();

-- junta dois jsonb: o segundo vence, objeto dentro de objeto também é juntado
create or replace function public.jsonb_mesclar(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when a is null then b
    when b is null then a
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then (
      select coalesce(jsonb_object_agg(k,
               case when a ? k and b ? k then public.jsonb_mesclar(a -> k, b -> k)
                    when b ? k then b -> k else a -> k end), '{}'::jsonb)
        from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) t)
    else b
  end
$$;

-- o que vale para um cliente: padrão do sistema + "todos os clientes" + ajustes daquele cliente
create or replace function public.portal_config_de(g text) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.jsonb_mesclar(public.jsonb_mesclar(
    '{
      "obras":      { "andamento": true, "datas": true, "concluidas": true, "engenharia": true, "impermeabilizacao": true },
      "fabrica":    { "mostrar": false },
      "equipe":     { "mostrar": true, "funcao": true, "futuro": true },
      "relatorios": { "mostrar": true, "observacao": true, "videos": true, "baixar": true,
                      "tipos": { "inicio_dia": true, "fim_dia": true, "limpeza": true, "rfi": true, "ancoragem": true, "entrega_obra": true } },
      "ocultas":    []
    }'::jsonb,
    coalesce((select config - 'ocultas' from public.portal_config where escopo = '*'), '{}'::jsonb)),
    coalesce((select pc.config from public.portal_config pc join public.clientes c on pc.escopo = c.id::text
               where lower(trim(c.nome)) = lower(trim(g)) limit 1), '{}'::jsonb))
$$;
revoke all on function public.portal_config_de(text) from public, anon, authenticated;

-- ---------- O portal: tudo o que o cliente pode ver, já com as regras ----------
create or replace function public.portal_cliente_dados(g text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb;
  obras uuid[];
  pedidos uuid[];
  liga boolean;
begin
  if g is null then
    return jsonb_build_object('grupo', null, 'obras', '[]'::jsonb, 'equipe', '[]'::jsonb, 'relatorios', '[]'::jsonb, 'fabrica', '[]'::jsonb, 'config', '{}'::jsonb);
  end if;
  cfg := public.portal_config_de(g);

  select coalesce(array_agg(d.id), '{}') into obras
    from public.demandas d
   where lower(trim(d.grupo)) = lower(g) and d.empresa <> 'eko'
     and coalesce((cfg -> 'obras' ->> d.empresa)::boolean, true)
     and (coalesce((cfg #>> '{obras,concluidas}')::boolean, true) or not d.arquivada)
     and not coalesce(cfg -> 'ocultas', '[]'::jsonb) ? d.id::text;

  liga := coalesce((cfg #>> '{fabrica,mostrar}')::boolean, false);
  select coalesce(array_agg(d.id), '{}') into pedidos
    from public.demandas d
   where liga and lower(trim(d.grupo)) = lower(g) and d.empresa = 'eko'
     and (coalesce((cfg #>> '{obras,concluidas}')::boolean, true) or not d.arquivada)
     and not coalesce(cfg -> 'ocultas', '[]'::jsonb) ? d.id::text;

  return jsonb_build_object(
    'grupo', g,
    -- o que a tela do portal precisa saber para montar as seções
    'config', jsonb_build_object(
      'andamento', cfg #> '{obras,andamento}', 'datas', cfg #> '{obras,datas}',
      'equipe', cfg #> '{equipe,mostrar}', 'funcao', cfg #> '{equipe,funcao}', 'futuro', cfg #> '{equipe,futuro}',
      'relatorios', cfg #> '{relatorios,mostrar}', 'baixar', cfg #> '{relatorios,baixar}', 'fabrica', to_jsonb(liga)),
    'obras', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', d.id, 'nome', d.nome, 'empresa', d.empresa, 'fase', d.fase,
               'percentual', case when (cfg #>> '{obras,andamento}')::boolean then d.percentual end,
               'inicio', case when (cfg #>> '{obras,datas}')::boolean then d.inicio end,
               'entrega', case when (cfg #>> '{obras,datas}')::boolean then d.entrega end,
               'arquivada', d.arquivada, 'atualizado_em', d.atualizado_em))
             order by d.arquivada, d.entrega nulls last, d.nome)
        from public.demandas d where d.id = any(obras)), '[]'::jsonb),
    -- pedidos da fábrica (só se ligado): produto, quantidade pronta e prazo — nunca valores
    'fabrica', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', d.id, 'produto', d.produto, 'especificacao', d.especificacao, 'descricao', d.descricao,
               'qtd_total', d.qtd_total, 'qtd_produzida', d.qtd_produzida, 'unidade', d.unidade, 'fase', d.fase,
               'entrega', case when (cfg #>> '{obras,datas}')::boolean then d.entrega end, 'arquivada', d.arquivada))
             order by d.arquivada, d.entrega nulls last)
        from public.demandas d where d.id = any(pedidos)), '[]'::jsonb),
    -- equipe: últimos 60 dias e (se ligado) próximos 30
    'equipe', case when (cfg #>> '{equipe,mostrar}')::boolean then coalesce((
      select jsonb_agg(jsonb_build_object('demanda_id', a.demanda_id, 'dia', a.dia, 'funcionario_id', f.id, 'nome', f.nome,
                                          'funcao', case when (cfg #>> '{equipe,funcao}')::boolean then f.funcao end)
             order by a.dia, f.nome)
        from public.alocacoes a join public.funcionarios f on f.id = a.funcionario_id
       where a.demanda_id = any(obras)
         and a.dia between current_date - 60 and current_date + case when (cfg #>> '{equipe,futuro}')::boolean then 30 else 0 end), '[]'::jsonb)
      else '[]'::jsonb end,
    -- relatórios concluídos dos tipos liberados
    'relatorios', case when (cfg #>> '{relatorios,mostrar}')::boolean then coalesce((
      select jsonb_agg(x order by x->>'dia' desc, x->>'criado_em' desc) from (
        select jsonb_build_object(
                 'id', r.id, 'demanda_id', r.demanda_id, 'dia', r.dia, 'tipo', r.tipo,
                 'observacao', case when (cfg #>> '{relatorios,observacao}')::boolean then r.observacao end,
                 'arquivos', case when (cfg #>> '{relatorios,videos}')::boolean then r.arquivos
                                  else coalesce((select jsonb_agg(a) from jsonb_array_elements(r.arquivos) a where coalesce(a ->> 'tipo', 'foto') <> 'video'), '[]'::jsonb) end,
                 'campos', coalesce(r.campos, '{}'::jsonb), 'estrutura', r.estrutura, 'criado_em', r.criado_em, 'status', r.status,
                 'funcionario_id', r.funcionario_id, 'funcionario', f.nome) as x
          from public.relatorios r left join public.funcionarios f on f.id = r.funcionario_id
         where r.demanda_id = any(obras) and r.status = 'enviado'
           and coalesce((cfg #>> array['relatorios', 'tipos', r.tipo])::boolean, true)
         order by r.dia desc, r.criado_em desc
         limit 600) t), '[]'::jsonb)
      else '[]'::jsonb end
  );
end $$;
revoke all on function public.portal_cliente_dados(text) from public, anon, authenticated;

-- ---------- Registro de atividades ----------
create or replace function public.portal_config_atividade() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r record; nome text;
begin
  if uid is null then return null; end if;
  r := coalesce(new, old);
  if r.escopo = '*' then nome := 'todos os clientes';
  else select c.nome into nome from public.clientes c where c.id::text = r.escopo; end if;
  insert into atividades (usuario_id, tabela, acao, registro_id, rotulo, mudancas, dados, transacao)
  values (uid, 'portal_config', case tg_op when 'INSERT' then 'criou' when 'DELETE' then 'apagou' else 'alterou' end, r.escopo,
          'Portal · ' || coalesce(nome, '?'),
          case when tg_op = 'UPDATE' then jsonb_build_object('config', jsonb_build_array(old.config, new.config)) end,
          case when tg_op = 'DELETE' then to_jsonb(old) end, txid_current());
  update perfis set ultima_modificacao = now() where id = uid;
  return null;
end $$;
drop trigger if exists registrar_atividade on public.portal_config;
create trigger registrar_atividade after insert or update or delete on public.portal_config
for each row execute function public.portal_config_atividade();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'portal_config') then
    alter publication supabase_realtime add table public.portal_config;
  end if;
end $$;
