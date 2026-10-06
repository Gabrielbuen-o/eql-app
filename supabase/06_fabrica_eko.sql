-- =====================================================================
-- EQL Group — atualização 06: demandas da fábrica (EQL Eko)
-- Fábrica passa a ter as fases Orçamento → Execução → Estoque,
-- e cada demanda tem produto, especificação e cliente.
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

alter table public.demandas add column if not exists produto text;
alter table public.demandas add column if not exists especificacao text;

-- nova fase "estoque" (usada só pela fábrica)
alter table public.demandas drop constraint if exists demandas_fase_check;
alter table public.demandas add constraint demandas_fase_check
  check (fase in ('orcamento', 'aprovacao', 'execucao', 'entrega', 'estoque'));

-- ajusta as demandas da fábrica que já existem
update public.demandas set produto = 'Concreto ensacado', especificacao = coalesce(especificacao, '30 kg · 30 MPa'),
       grupo = 'Estoque', nome = 'Estoque'
 where empresa = 'eko' and produto is null and nome ilike '%saco%';
update public.demandas set produto = 'Placa', grupo = 'Zopone', nome = 'Zopone'
 where empresa = 'eko' and produto is null and nome ilike '%placa%';
update public.demandas set produto = 'Mourão', grupo = 'Zopone', nome = 'Zopone'
 where empresa = 'eko' and produto is null and nome ilike '%mour%';
update public.demandas set fase = 'execucao' where empresa = 'eko' and fase in ('aprovacao', 'entrega');
