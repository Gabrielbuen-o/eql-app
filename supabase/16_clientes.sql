-- =====================================================================
-- EQL Group — atualização 16: cadastro de clientes
-- Pode rodar mais de uma vez sem problema.
--
-- • Lista única de clientes (Help, Agplan, Zopone, Radial…) usada nas obras, na fábrica,
--   nos orçamentos e no acesso dos clientes ao portal.
-- • Nome digitado de outro jeito ("help", "HELP ") vira o nome oficial ("Help").
-- • Nome novo usado em 2 obras/pedidos vira cliente sozinho.
-- • Renomear um cliente renomeia nas obras, nos orçamentos e no acesso dos usuários.
-- =====================================================================

create table if not exists public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  ativo      boolean not null default true,
  origem     text not null default 'manual' check (origem in ('manual', 'automatico')),
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references public.perfis(id) on delete set null
);
create unique index if not exists clientes_nome_unico on public.clientes (lower(trim(nome)));

-- Grupos internos (não são clientes): obra sem cliente cai neles
create or replace function public.grupo_interno(g text) returns boolean
language sql immutable as $$
  select lower(trim(coalesce(g, ''))) in ('', 'obras civis', 'obras', 'produção', 'producao', 'estoque', 'outros')
$$;

-- ---------- Regras de acesso ----------
alter table public.clientes enable row level security;
drop policy if exists "clientes ler" on public.clientes;
drop policy if exists "clientes criar" on public.clientes;
drop policy if exists "clientes alterar" on public.clientes;
drop policy if exists "clientes apagar" on public.clientes;
create policy "clientes ler" on public.clientes for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "clientes criar" on public.clientes for insert to authenticated
  with check (public.meu_papel() in ('admin', 'gerente'));
create policy "clientes alterar" on public.clientes for update to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');
create policy "clientes apagar" on public.clientes for delete to authenticated
  using (public.meu_papel() = 'admin');

-- ---------- Nome oficial nas obras ----------
create or replace function public.demandas_cliente_oficial() returns trigger
language plpgsql security definer set search_path = public as $$
declare oficial text;
begin
  new.grupo := nullif(trim(new.grupo), '');
  if new.grupo is not null then
    select c.nome into oficial from public.clientes c where lower(trim(c.nome)) = lower(new.grupo) limit 1;
    if oficial is not null then new.grupo := oficial; end if;
  end if;
  return new;
end $$;
drop trigger if exists demandas_cliente_oficial on public.demandas;
create trigger demandas_cliente_oficial before insert or update of grupo on public.demandas
for each row execute function public.demandas_cliente_oficial();

-- ---------- Nome novo em 2 obras → vira cliente ----------
create or replace function public.demandas_cliente_automatico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.grupo is null or public.grupo_interno(new.grupo) then return null; end if;
  if tg_op = 'UPDATE' and old.grupo is not distinct from new.grupo then return null; end if;
  if exists (select 1 from public.clientes c where lower(trim(c.nome)) = lower(trim(new.grupo))) then return null; end if;
  if (select count(*) from public.demandas d where lower(trim(d.grupo)) = lower(trim(new.grupo))) >= 2 then
    -- usa o nome como foi escrito da primeira vez e acerta as outras obras para ele
    insert into public.clientes (nome, origem)
    select trim(d.grupo), 'automatico' from public.demandas d
     where lower(trim(d.grupo)) = lower(trim(new.grupo)) order by d.criado_em, d.id limit 1
    on conflict do nothing;
    update public.demandas d set grupo = c.nome from public.clientes c
     where lower(trim(c.nome)) = lower(trim(new.grupo)) and lower(trim(d.grupo)) = lower(trim(c.nome)) and d.grupo <> c.nome;
  end if;
  return null;
end $$;
drop trigger if exists demandas_cliente_automatico on public.demandas;
create trigger demandas_cliente_automatico after insert or update of grupo on public.demandas
for each row execute function public.demandas_cliente_automatico();

-- ---------- Renomear cliente renomeia em todo lugar ----------
create or replace function public.clientes_limpar_nome() returns trigger
language plpgsql as $$ begin new.nome := trim(new.nome); return new; end $$;
drop trigger if exists clientes_limpar_nome on public.clientes;
create trigger clientes_limpar_nome before insert or update of nome on public.clientes
for each row execute function public.clientes_limpar_nome();

create or replace function public.clientes_renomear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.nome is distinct from new.nome then
    update public.demandas set grupo = new.nome where lower(trim(grupo)) = lower(trim(old.nome));
    if to_regclass('public.orcamentos') is not null then -- propostas já emitidas ficam como foram enviadas
      execute 'update public.orcamentos set cliente = $1, entrada = jsonb_set(entrada, ''{cliente}'', to_jsonb($1))
                where lower(trim(cliente)) = lower(trim($2)) and revisao_emitida is distinct from revisao'
        using new.nome, old.nome;
    end if;
    update public.perfis set cliente_grupo = new.nome where lower(trim(cliente_grupo)) = lower(trim(old.nome));
  end if;
  return null;
end $$;
drop trigger if exists clientes_renomear on public.clientes;
create trigger clientes_renomear after update of nome on public.clientes
for each row execute function public.clientes_renomear();

-- registro de atividades (quem criou/alterou cada cliente)
drop trigger if exists registrar_atividade on public.clientes;
create trigger registrar_atividade after insert or update or delete on public.clientes
for each row execute function public.registrar_atividade();

-- ---------- Lista inicial ----------
insert into public.clientes (nome) values ('Help'), ('Agplan'), ('Zopone'), ('Radial')
on conflict do nothing;
-- quem já aparece em 2 ou mais obras/pedidos também entra
insert into public.clientes (nome, origem)
select min(trim(grupo)), 'automatico' from public.demandas
 where not public.grupo_interno(grupo)
 group by lower(trim(grupo)) having count(*) >= 2
on conflict do nothing;
-- acerta o nome das obras que já existem ("help" → "Help")
update public.demandas d set grupo = c.nome from public.clientes c
 where lower(trim(d.grupo)) = lower(trim(c.nome)) and d.grupo <> c.nome;

-- atualização em tempo real para quem está com o app aberto
do $$ begin
  alter publication supabase_realtime add table public.clientes;
exception when duplicate_object or undefined_object then null; end $$;
