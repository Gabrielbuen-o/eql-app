-- =====================================================================
-- EQL Group — atualização 14: ORÇAMENTOS (primeira categoria: Muros pré-moldados)
--  * parâmetros por categoria em VERSÕES (vigência e responsável; nunca sobrescreve)
--  * orçamentos com a cópia dos parâmetros usados (mudar a tabela não muda proposta já feita)
--  * revisões emitidas guardadas e imutáveis; histórico de alterações (autor, antes, depois)
--  * o servidor RECALCULA o orçamento ao salvar e VALIDA ao emitir (não confia só no navegador)
-- Só administradores acessam (custos, margens e limites de negociação ficam protegidos no banco).
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- ---------- Parâmetros por categoria (versionados) ----------
create table if not exists public.orcamento_parametros (
  id            uuid primary key default gen_random_uuid(),
  categoria     text not null,
  versao        int not null,
  parametros    jsonb not null,
  observacao    text,
  vigente_desde timestamptz not null default now(),
  autor_id      uuid default auth.uid() references public.perfis(id) on delete set null,
  unique (categoria, versao)
);

-- tabela inicial de Muros pré-moldados (só entra se ainda não houver nenhuma versão)
insert into public.orcamento_parametros (categoria, versao, parametros, observacao)
select 'muros', 1, '{
  "nome_tabela": "Tabela inicial",
  "precos": {"placa": 90, "mourao": 225, "montagem_m": 150},
  "custos": {"placa": 42.42, "mourao": 109.01},
  "dimensoes": {"vao": 1.5, "placa_altura": 0.5, "mourao_comprimento": 3.2, "placa_desc": "1,50 × 0,50 × 0,03 m", "mourao_desc": "3,20 × 0,12 × 0,12 m"},
  "alturas_validadas": [1.5, 2.0, 2.5],
  "altura_referencia": 2.5,
  "produtividade_placas_dia": 110,
  "equipe_desc": "1 encarregado, 1 técnico de obras e 2 ajudantes",
  "fte_dia": 850,
  "aliquota": 0.08,
  "margem_material_min": 0.30,
  "margem_material_meta": 0.40,
  "margem_instalacao_min": null,
  "despesas": []
}'::jsonb, 'Tabela inicial (especificação da aba Orçamentos)'
where not exists (select 1 from public.orcamento_parametros where categoria = 'muros');

-- ---------- Orçamentos ----------
create sequence if not exists public.orcamento_numero_seq;
create table if not exists public.orcamentos (
  id                uuid primary key default gen_random_uuid(),
  numero            int not null default nextval('public.orcamento_numero_seq'),
  categoria         text not null default 'muros',
  status            text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'negociacao', 'aprovado', 'perdido', 'cancelado')),
  cliente           text,
  projeto           text,
  responsavel_id    uuid references public.perfis(id) on delete set null,
  data              date not null default current_date,
  validade          date,
  entrada           jsonb not null default '{}'::jsonb,   -- tudo o que foi preenchido
  parametros        jsonb not null default '{}'::jsonb,   -- cópia dos parâmetros usados
  parametros_versao int,
  resumo            jsonb,                                -- resumo calculado no app
  total             numeric(14, 2),                       -- recalculado pelo servidor
  validacao         jsonb,                                -- resultado do recálculo do servidor
  revisao           int not null default 0,
  revisao_emitida   int,                                  -- se igual a "revisao", a revisão atual já foi emitida (travada)
  duplicado_de      uuid references public.orcamentos(id) on delete set null,
  criado_por        uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create index if not exists orcamentos_data_idx on public.orcamentos (data desc);

create table if not exists public.orcamento_versoes (
  id            uuid primary key default gen_random_uuid(),
  orcamento_id  uuid not null references public.orcamentos(id) on delete cascade,
  revisao       int not null,
  parametros    jsonb not null,
  entrada       jsonb not null,
  resumo        jsonb not null,
  total         numeric(14, 2) not null,
  emitida_em    timestamptz not null default now(),
  emitida_por   uuid default auth.uid() references public.perfis(id) on delete set null,
  unique (orcamento_id, revisao)
);

create table if not exists public.orcamento_historico (
  id            bigint generated always as identity primary key,
  orcamento_id  uuid not null references public.orcamentos(id) on delete cascade,
  quando        timestamptz not null default now(),
  autor_id      uuid default auth.uid() references public.perfis(id) on delete set null,
  campo         text not null,
  antes         jsonb,
  depois        jsonb
);
create index if not exists orcamento_historico_idx on public.orcamento_historico (orcamento_id, quando desc);

-- ---------- Cálculo no servidor (mesmas regras do app: src/orcamentos/muros.js) ----------
create or replace function public.orc_num(v jsonb) returns numeric
language plpgsql immutable as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return 0; end if;
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then return trim(v #>> '{}')::numeric; end if;
  return 0;
exception when others then return 0;
end $$;

create or replace function public.orc_muros_calcular(e jsonb, p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  vao numeric := coalesce(nullif(public.orc_num(p #> '{dimensoes,vao}'), 0), 1.5);
  hp  numeric := coalesce(nullif(public.orc_num(p #> '{dimensoes,placa_altura}'), 0), 0.5);
  h   numeric := public.orc_num(e #> '{geometria,altura}');
  esc text := coalesce(e ->> 'escopo', 'material_montagem');
  tem_mat boolean; tem_mont boolean;
  erros text[] := '{}'; bloq text[] := '{}';
  t jsonb; li numeric; v int; ppv int := 0;
  L numeric := 0; placas int := 0; mouroes int := 0; pf int := 0; mf int := 0;
  aberturas numeric := 0;
  prod numeric := coalesce(nullif(public.orc_num(p -> 'produtividade_placas_dia'), 0), 110);
  dd int; disp int; frentes int; limite int; sug int; equipes int := 0; dias int := 0; reais int; dias_eq int := 0;
  fte numeric := 0;
  tabm numeric; tabi numeric := 0; dm numeric; di numeric; addm numeric := 0; addi numeric := 0; addo numeric := 0;
  cadm numeric := 0; cadi numeric := 0; cado numeric := 0;
  basem numeric; basei numeric; dg numeric; dgm numeric := 0; dgi numeric;
  recm numeric; reci numeric; reco numeric; total numeric;
  aliq numeric := public.orc_num(p -> 'aliquota');
  custom numeric; custoi numeric; custoo numeric;
  resm numeric := 0; resi numeric := 0;
  a jsonb; venda numeric; ct numeric; comp text;
  impm numeric; impi numeric; impo numeric;
  rm numeric; ri numeric; ro numeric; rm_apos numeric; ri_apos numeric; rtotal numeric;
  minm numeric := coalesce(public.orc_num(p -> 'margem_material_min'), 0.3);
  mini jsonb := p -> 'margem_instalacao_min';
  mm numeric; mi numeric;
begin
  tem_mat := esc in ('material', 'material_montagem', 'completa');
  tem_mont := esc in ('material_montagem', 'completa', 'mao_de_obra');

  if h <= 0 then erros := array_append(erros, 'altura'::text); end if;
  if h > 0 and abs(h / hp - round(h / hp)) > 0.000000001 then erros := array_append(erros, 'altura_fora_do_modulo'::text);
  elsif h > 0 then ppv := round(h / hp); end if;

  if e #>> '{geometria,modo}' = 'trechos' then
    for t in select * from jsonb_array_elements(coalesce(e #> '{geometria,trechos}', '[]')) loop
      li := public.orc_num(t -> 'comprimento');
      if li <= 0 or li > 50000 then erros := array_append(erros, 'comprimento'::text); end if;
      v := ceil(li / vao);
      L := L + li; placas := placas + v * ppv; mouroes := mouroes + v + 1;
    end loop;
    if jsonb_array_length(coalesce(e #> '{geometria,trechos}', '[]')) = 0 then erros := array_append(erros, 'sem_trechos'::text); end if;
  else
    select coalesce(sum(public.orc_num(x -> 'largura')) filter (where public.orc_num(x -> 'largura') > 0), 0) into aberturas
      from jsonb_array_elements(coalesce(e #> '{geometria,aberturas}', '[]')) x;
    li := public.orc_num(e #> '{geometria,comprimento}') - aberturas;
    if li <= 0 or li > 50000 then erros := array_append(erros, 'comprimento'::text); end if;
    v := ceil(li / vao);
    L := li; placas := v * ppv; mouroes := v + 1;
  end if;

  if array_length(erros, 1) > 0 then
    return jsonb_build_object('ok', false, 'erros', to_jsonb(erros), 'bloqueios', '[]'::jsonb, 'total', 0);
  end if;

  if tem_mat and coalesce((e ->> 'fornece_placas')::boolean, true) then pf := placas; end if;
  if tem_mat and coalesce((e ->> 'fornece_mouroes')::boolean, true) then mf := mouroes; end if;

  -- prazo e FTE
  if tem_mont and placas > 0 then
    dd := floor(public.orc_num(e #> '{prazo,dias_desejados}'));
    disp := greatest(1, floor(coalesce(nullif(public.orc_num(e #> '{prazo,equipes_disponiveis}'), 0), 1)));
    frentes := greatest(1, floor(coalesce(nullif(public.orc_num(e #> '{prazo,frentes}'), 0), 1)));
    limite := least(disp, frentes);
    sug := case when dd > 0 then ceil(placas::numeric / (prod * dd)) else 1 end;
    if e #>> '{prazo,modo}' = 'manual' then equipes := greatest(1, floor(coalesce(nullif(public.orc_num(e #> '{prazo,equipes_manual}'), 0), 1)));
    else equipes := least(sug, limite); end if;
    equipes := greatest(1, equipes);
    dias := ceil(placas::numeric / (prod * equipes));
    reais := floor(public.orc_num(e #> '{prazo,dias_equipe_reais}'));
    dias_eq := case when reais > 0 then reais else equipes * dias end;
    fte := round(dias_eq * coalesce(nullif(public.orc_num(p -> 'fte_dia'), 0), 850), 2);
  end if;

  -- adicionais
  for a in select * from jsonb_array_elements(coalesce(e #> '{comercial,adicionais}', '[]')) loop
    if coalesce((a ->> 'cobrado')::boolean, true) = false and public.orc_num(a -> 'custo') <= 0 then continue; end if;
    venda := case when coalesce((a ->> 'cobrado')::boolean, true) then round(public.orc_num(a -> 'quantidade') * public.orc_num(a -> 'preco'), 2) else 0 end;
    ct := round(public.orc_num(a -> 'quantidade') * public.orc_num(a -> 'custo'), 2);
    comp := coalesce(nullif(a ->> 'componente', ''), 'outro');
    if comp = 'material' then addm := addm + venda; cadm := cadm + ct;
    elsif comp = 'instalacao' then addi := addi + venda; cadi := cadi + ct;
    else addo := addo + venda; cado := cado + ct; end if;
  end loop;
  addm := round(addm, 2); addi := round(addi, 2); addo := round(addo, 2);

  -- preço
  tabm := round(pf * public.orc_num(p #> '{precos,placa}') + mf * public.orc_num(p #> '{precos,mourao}'), 2);
  if tem_mont then tabi := round(L * public.orc_num(p #> '{precos,montagem_m}'), 2); end if;
  dm := round(tabm * public.orc_num(e #> '{comercial,desconto_material_pct}') / 100, 2);
  di := round(tabi * public.orc_num(e #> '{comercial,desconto_instalacao_pct}') / 100, 2);
  basem := tabm - dm + addm; basei := tabi - di + addi;
  dg := round((basem + basei) * public.orc_num(e #> '{comercial,desconto_global_pct}') / 100, 2);
  if basem + basei > 0 then dgm := round(dg * basem / (basem + basei), 2); end if;
  dgi := round(dg - dgm, 2);
  recm := round(basem - dgm, 2); reci := round(basei - dgi, 2); reco := addo;
  total := round(recm + reci + reco, 2);

  -- custos, reservas e resultado
  custom := round(round(pf * public.orc_num(p #> '{custos,placa}') + mf * public.orc_num(p #> '{custos,mourao}'), 2) + cadm, 2);
  custoi := round(fte + cadi, 2);
  custoo := round(cado, 2);
  if recm > 0 then
    select round(coalesce(sum(case d ->> 'base' when 'pct_custo' then custom * public.orc_num(d -> 'valor') / 100
                                         when 'reais_m' then public.orc_num(d -> 'valor') * L else public.orc_num(d -> 'valor') end), 0), 2)
      into resm from jsonb_array_elements(coalesce(p -> 'despesas', '[]')) d where d ->> 'componente' = 'material';
  end if;
  if reci > 0 then
    select round(coalesce(sum(case d ->> 'base' when 'pct_custo' then custoi * public.orc_num(d -> 'valor') / 100
                                         when 'reais_m' then public.orc_num(d -> 'valor') * L else public.orc_num(d -> 'valor') end), 0), 2)
      into resi from jsonb_array_elements(coalesce(p -> 'despesas', '[]')) d where d ->> 'componente' = 'instalacao';
  end if;
  impm := round(recm * aliq, 2); impi := round(reci * aliq, 2); impo := round(reco * aliq, 2);
  rm := round(recm - impm - custom, 2); ri := round(reci - impi - custoi, 2); ro := round(reco - impo - custoo, 2);
  rm_apos := round(rm - resm, 2); ri_apos := round(ri - resi, 2);
  rtotal := round(rm_apos + ri_apos + ro, 2);

  -- regras de bloqueio
  if total <= 0 then erros := array_append(erros, 'receita_zero'::text); end if;
  if recm > 0 then
    mm := rm_apos / recm;
    if mm <= minm then bloq := array_append(bloq, (case when (dm + dgm) > 0 then 'desconto_material' else 'tabela_material' end)::text); end if;
  end if;
  if reci > 0 and (di + dgi) > 0 then
    mi := ri_apos / reci;
    if mini is null or jsonb_typeof(mini) = 'null' then
      if (e #> '{comercial,autorizacao_instalacao}') is null or jsonb_typeof(e #> '{comercial,autorizacao_instalacao}') = 'null' then bloq := array_append(bloq, 'desconto_instalacao'::text); end if;
    elsif mi <= public.orc_num(mini) then bloq := array_append(bloq, 'desconto_instalacao_piso'::text); end if;
  end if;
  if total > 0 and rtotal < 0 then bloq := array_append(bloq, 'prejuizo'::text); end if;

  return jsonb_build_object(
    'ok', array_length(erros, 1) is null, 'erros', to_jsonb(erros), 'bloqueios', to_jsonb(bloq),
    'L', L, 'placas', placas, 'mouroes', mouroes, 'equipes', equipes, 'dias', dias, 'fte', fte,
    'total', total, 'receita_material', recm, 'receita_instalacao', reci, 'custo_material', custom,
    'resultado', rtotal, 'margem_material', mm);
end $$;

-- recalcula ao salvar; trava revisão já emitida
create or replace function public.orcamentos_antes_salvar() returns trigger
language plpgsql security definer set search_path = public as $$
declare calc jsonb;
begin
  if tg_op = 'UPDATE' and old.revisao_emitida is not null and old.revisao_emitida = old.revisao
     and new.revisao = old.revisao
     and (new.entrada is distinct from old.entrada or new.parametros is distinct from old.parametros) then
    raise exception 'Esta revisão já foi emitida e não pode ser alterada. Use "Revisar" para criar uma nova revisão.';
  end if;
  if new.categoria = 'muros' then
    calc := public.orc_muros_calcular(new.entrada, new.parametros);
    new.total := (calc ->> 'total')::numeric;
    new.validacao := calc;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists orcamentos_antes_salvar on public.orcamentos;
create trigger orcamentos_antes_salvar before insert or update on public.orcamentos
for each row execute function public.orcamentos_antes_salvar();

-- histórico: autor, data, antes e depois
create or replace function public.orcamentos_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, 'criado', null, jsonb_build_object('total', new.total, 'status', new.status));
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, 'status', to_jsonb(old.status), to_jsonb(new.status));
  end if;
  if new.total is distinct from old.total then
    insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, 'total', to_jsonb(old.total), to_jsonb(new.total));
  end if;
  if new.revisao is distinct from old.revisao then
    insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, 'revisao', to_jsonb(old.revisao), to_jsonb(new.revisao));
  end if;
  if new.parametros_versao is distinct from old.parametros_versao then
    insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, 'tabela', to_jsonb(old.parametros_versao), to_jsonb(new.parametros_versao));
  end if;
  foreach k in array array['geometria', 'escopo', 'fornece_placas', 'fornece_mouroes', 'prazo'] loop
    if (new.entrada -> k) is distinct from (old.entrada -> k) then
      insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, k, old.entrada -> k, new.entrada -> k);
    end if;
  end loop;
  foreach k in array array['desconto_material_pct', 'desconto_instalacao_pct', 'desconto_global_pct', 'adicionais', 'autorizacao_instalacao'] loop
    if (new.entrada #> array['comercial', k]) is distinct from (old.entrada #> array['comercial', k]) then
      insert into orcamento_historico (orcamento_id, campo, antes, depois) values (new.id, k, old.entrada #> array['comercial', k], new.entrada #> array['comercial', k]);
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists orcamentos_historico on public.orcamentos;
create trigger orcamentos_historico after insert or update on public.orcamentos
for each row execute function public.orcamentos_historico();

-- emitir: o servidor confere o cálculo e as regras antes de guardar a revisão
create or replace function public.orcamento_emitir_validar() returns trigger
language plpgsql security definer set search_path = public as $$
declare calc jsonb;
begin
  calc := public.orc_muros_calcular(new.entrada, new.parametros);
  if not (calc ->> 'ok')::boolean then
    raise exception 'Não dá para emitir: há medidas ou dados inválidos (%).', calc -> 'erros';
  end if;
  if jsonb_array_length(calc -> 'bloqueios') > 0 then
    raise exception 'Não dá para emitir: regra de preço/margem não atendida (%).', calc -> 'bloqueios';
  end if;
  if abs((calc ->> 'total')::numeric - new.total) > 0.01 then
    raise exception 'Não dá para emitir: o total calculado no servidor (%) é diferente do enviado (%).', calc ->> 'total', new.total;
  end if;
  if coalesce((new.resumo ->> 'final')::boolean, false) = false then
    raise exception 'Não dá para emitir: ainda há pendências na proposta.';
  end if;
  update orcamentos set revisao_emitida = new.revisao,
         status = case when status = 'rascunho' then 'enviado' else status end
   where id = new.orcamento_id and revisao = new.revisao;
  return new;
end $$;
drop trigger if exists orcamento_emitir_validar on public.orcamento_versoes;
create trigger orcamento_emitir_validar before insert on public.orcamento_versoes
for each row execute function public.orcamento_emitir_validar();

-- ---------- Acesso: só administradores ----------
alter table public.orcamento_parametros enable row level security;
alter table public.orcamentos enable row level security;
alter table public.orcamento_versoes enable row level security;
alter table public.orcamento_historico enable row level security;
drop policy if exists "orc param ler" on public.orcamento_parametros;
drop policy if exists "orc param nova versao" on public.orcamento_parametros;
create policy "orc param ler" on public.orcamento_parametros for select to authenticated using (public.meu_papel() = 'admin');
create policy "orc param nova versao" on public.orcamento_parametros for insert to authenticated with check (public.meu_papel() = 'admin');
drop policy if exists "orcamentos admin" on public.orcamentos;
create policy "orcamentos admin" on public.orcamentos for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');
drop policy if exists "orc versoes ler" on public.orcamento_versoes;
drop policy if exists "orc versoes emitir" on public.orcamento_versoes;
create policy "orc versoes ler" on public.orcamento_versoes for select to authenticated using (public.meu_papel() = 'admin');
create policy "orc versoes emitir" on public.orcamento_versoes for insert to authenticated with check (public.meu_papel() = 'admin');
-- (sem update/delete: revisão emitida é imutável)
drop policy if exists "orc historico ler" on public.orcamento_historico;
create policy "orc historico ler" on public.orcamento_historico for select to authenticated using (public.meu_papel() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['orcamentos', 'orcamento_parametros', 'orcamento_versoes'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
