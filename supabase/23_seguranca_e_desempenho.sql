-- =====================================================================
-- EQL Group — atualização 23: avisos de segurança e desempenho do Supabase
--  * "Security Definer View": perfis_publicos e adicionais_publicos deixam de ser
--    visões e viram funções (devolvem só nome/foto dos colegas e adicionais sem valor)
--  * "Auth RLS Initialization Plan": as regras de acesso passam a calcular quem é o
--    usuário uma vez por consulta, e não uma vez por linha
--  * "Function Search Path Mutable": todas as funções com caminho de busca fixo
-- Precisa das atualizações anteriores (até a 22). O app já foi atualizado para isso.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- ---------- 1) visões → funções ----------
drop view if exists public.perfis_publicos;
create or replace function public.perfis_publicos()
returns table (id uuid, nome text, foto_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.foto_url
    from public.perfis p
   where public.meu_papel() in ('admin', 'gerente', 'campo')
$$;
revoke all on function public.perfis_publicos() from public, anon;
grant execute on function public.perfis_publicos() to authenticated;

drop view if exists public.adicionais_publicos;
create or replace function public.adicionais_publicos()
returns table (id uuid, demanda_id uuid, descricao text, dia date, criado_por uuid, criado_em timestamptz, com_valor boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.demanda_id, a.descricao, a.dia, a.criado_por, a.criado_em, (a.valor is not null)
    from public.demanda_adicionais a
   where public.meu_papel() in ('admin', 'gerente')
$$;
revoke all on function public.adicionais_publicos() from public, anon;
grant execute on function public.adicionais_publicos() to authenticated;

-- ---------- 2) regras de acesso: auth.uid() e meu_papel() uma vez por consulta ----------
do $$
declare
  p record;
  q text; c text;
  troca constant text := 'auth\.uid\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(auth\.uid\(\)|meu_papel\(\)|meu_grupo\(\))'
  loop
    q := p.qual; c := p.with_check;
    -- troca só o que ainda não está dentro de "SELECT …" (rodar de novo não muda nada)
    q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    q := regexp_replace(q, '(?<!SELECT )(public\.)?meu_papel\(\)', '(select public.meu_papel())', 'g');
    q := regexp_replace(q, '(?<!SELECT )(public\.)?meu_grupo\(\)', '(select public.meu_grupo())', 'g');
    c := regexp_replace(c, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
    c := regexp_replace(c, '(?<!SELECT )(public\.)?meu_papel\(\)', '(select public.meu_papel())', 'g');
    c := regexp_replace(c, '(?<!SELECT )(public\.)?meu_grupo\(\)', '(select public.meu_grupo())', 'g');
    if q is distinct from p.qual and c is distinct from p.with_check and q is not null and c is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, q, c);
    elsif q is distinct from p.qual and q is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    elsif c is distinct from p.with_check and c is not null then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    end if;
  end loop;
end $$;

-- ---------- 3) caminho de busca fixo em todas as funções do app ----------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind in ('f', 'p')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') -- funções de extensões ficam como estão
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public', f.assinatura);
  end loop;
end $$;
