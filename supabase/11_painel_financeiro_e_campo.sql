-- =====================================================================
-- EQL Group — atualização 11
--  * campo: quem escolhe "sou o Jefferson" no celular fica ligado ao funcionário
--    automaticamente (só na primeira vez; depois só administrador troca)
--  * frases do dia: administradores cadastram as frases que aparecem para todos
--  * faturamento do mês: guarda a data em que cada obra foi faturada
--  * gerente pode LANÇAR custos do dia (gasolina, material…) sem ver nenhum valor
-- Precisa das atualizações 08 e 09 já rodadas.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- ---------- Vínculo usuário ↔ funcionário feito pelo próprio usuário ----------
create or replace function public.proteger_papel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.papel is distinct from old.papel or new.cliente_grupo is distinct from old.cliente_grupo)
     and coalesce(public.meu_papel(), '') <> 'admin' then
    raise exception 'Só administradores podem mudar o tipo de acesso.';
  end if;
  -- a própria pessoa pode dizer quem é UMA vez (quando ainda não está ligada a ninguém)
  if new.funcionario_id is distinct from old.funcionario_id
     and coalesce(public.meu_papel(), '') <> 'admin'
     and not (old.funcionario_id is null and new.id = auth.uid()) then
    raise exception 'Só administradores podem trocar o funcionário ligado a um usuário.';
  end if;
  if old.papel = 'admin' and new.papel <> 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'Precisa existir pelo menos um administrador.';
  end if;
  return new;
end $$;

-- ---------- Frases do dia ----------
create table if not exists public.frases (
  id         uuid primary key default gen_random_uuid(),
  texto      text not null check (length(trim(texto)) between 3 and 240),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
alter table public.frases enable row level security;
drop policy if exists "frases ler" on public.frases;
drop policy if exists "frases editar" on public.frases;
create policy "frases ler" on public.frases for select to authenticated using (true);
create policy "frases editar" on public.frases for all to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

-- ---------- Data de faturamento (para "este mês a EQL faturou…") ----------
alter table public.demandas add column if not exists faturado_em date;
-- o que já está faturado/pago entra com a data da última atualização
update public.demandas set faturado_em = coalesce(atualizado_em, criado_em)::date
 where faturado_em is null and pagamento in ('faturada', 'paga');

create or replace function public.marcar_faturamento() returns trigger
language plpgsql as $$
begin
  if new.pagamento in ('faturada', 'paga') and new.faturado_em is null then
    new.faturado_em := (now() at time zone 'America/Sao_Paulo')::date;
  elsif new.pagamento = 'a_faturar' then
    new.faturado_em := null;
  end if;
  return new;
end $$;
drop trigger if exists demandas_faturamento on public.demandas;
create trigger demandas_faturamento before insert or update of pagamento, faturado_em on public.demandas
for each row execute function public.marcar_faturamento();

-- ---------- Gerente lança custos (não lê valores) ----------
drop policy if exists "gerente lanca custo" on public.custos_lancamentos;
create policy "gerente lanca custo" on public.custos_lancamentos for insert to authenticated
  with check (public.meu_papel() = 'gerente');

-- ---------- Tempo real ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'frases') then
    alter publication supabase_realtime add table public.frases;
  end if;
end $$;
