-- =====================================================================
-- EQL Group — atualização 04: acessos (admin, gerente, campo, cliente),
-- perfis com foto, último acesso e preferências.
-- Rode UMA vez no SQL Editor do Supabase. Não apaga nenhum dado.
-- =====================================================================

-- ---------- Perfis (um por login) ----------
create table if not exists public.perfis (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text,
  nome                text,
  papel               text not null default 'campo' check (papel in ('admin', 'gerente', 'campo', 'cliente')),
  cliente_grupo       text,             -- para clientes: qual grupo de demandas eles veem (ex.: Help)
  foto_url            text,
  preferencias        jsonb not null default '{}'::jsonb,
  ultimo_acesso       timestamptz,
  ultima_modificacao  timestamptz,
  criado_em           timestamptz not null default now()
);

-- Quem já tem login hoje são os sócios: entram como administradores.
-- (Depois é só ajustar o papel de cada um na aba Configurações.)
insert into public.perfis (id, email, nome, papel)
select id, email, split_part(email, '@', 1), 'admin' from auth.users
on conflict (id) do nothing;

-- Novos logins criados no Supabase ganham perfil "campo" automaticamente
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome) values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.criar_perfil();

-- ---------- Funções de apoio às regras ----------
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;
create or replace function public.meu_grupo() returns text
language sql stable security definer set search_path = public as $$
  select cliente_grupo from public.perfis where id = auth.uid()
$$;

-- Só administrador muda papel; e nunca fica sem nenhum administrador
create or replace function public.proteger_papel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.papel is distinct from old.papel or new.cliente_grupo is distinct from old.cliente_grupo)
     and coalesce(public.meu_papel(), '') <> 'admin' then
    raise exception 'Só administradores podem mudar o tipo de acesso.';
  end if;
  if old.papel = 'admin' and new.papel <> 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'Precisa existir pelo menos um administrador.';
  end if;
  return new;
end $$;
drop trigger if exists perfis_proteger_papel on public.perfis;
create trigger perfis_proteger_papel before update on public.perfis
for each row execute function public.proteger_papel();

-- Registra a "última modificação" de quem alterou qualquer coisa
create or replace function public.registrar_modificacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    update public.perfis set ultima_modificacao = now() where id = auth.uid();
  end if;
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['demandas', 'funcionarios', 'alocacoes', 'ausencias', 'veiculos', 'veiculo_alocacoes'] loop
    execute format('drop trigger if exists registrar_modificacao on public.%I', t);
    execute format('create trigger registrar_modificacao after insert or update or delete on public.%I
                    for each statement execute function public.registrar_modificacao()', t);
  end loop;
end $$;

-- Quem editou a demanda por último
alter table public.demandas add column if not exists atualizado_por uuid references public.perfis(id) on delete set null;
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em = now();
  new.atualizado_por = auth.uid();
  return new;
end $$;

-- ---------- Regras de acesso ----------
-- admin   : tudo, inclusive usuários
-- gerente : demandas, agenda, equipes e frotas
-- campo   : vê tudo da operação e atualiza andamento das demandas
-- cliente : vê só as demandas do seu grupo
alter table public.perfis enable row level security;
drop policy if exists "perfis ler" on public.perfis;
drop policy if exists "perfis alterar" on public.perfis;
create policy "perfis ler" on public.perfis for select to authenticated
  using (id = auth.uid() or public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "perfis alterar" on public.perfis for update to authenticated
  using (id = auth.uid() or public.meu_papel() = 'admin')
  with check (id = auth.uid() or public.meu_papel() = 'admin');

-- Demandas
drop policy if exists "logados" on public.demandas;
drop policy if exists "demandas ler" on public.demandas;
drop policy if exists "demandas criar" on public.demandas;
drop policy if exists "demandas alterar" on public.demandas;
drop policy if exists "demandas apagar" on public.demandas;
create policy "demandas ler" on public.demandas for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente', 'campo')
         or (public.meu_papel() = 'cliente' and grupo = public.meu_grupo()));
create policy "demandas criar" on public.demandas for insert to authenticated
  with check (public.meu_papel() in ('admin', 'gerente'));
create policy "demandas alterar" on public.demandas for update to authenticated
  using (public.meu_papel() in ('admin', 'gerente', 'campo'))
  with check (public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "demandas apagar" on public.demandas for delete to authenticated
  using (public.meu_papel() in ('admin', 'gerente'));

-- Operação: funcionários, agenda, folgas, veículos
do $$
declare t text;
begin
  foreach t in array array['funcionarios', 'alocacoes', 'ausencias', 'veiculos', 'veiculo_alocacoes'] loop
    execute format('drop policy if exists "logados" on public.%I', t);
    execute format('drop policy if exists "operacao ler" on public.%I', t);
    execute format('drop policy if exists "operacao escrever" on public.%I', t);
    execute format('create policy "operacao ler" on public.%I for select to authenticated
                    using (public.meu_papel() in (''admin'', ''gerente'', ''campo''))', t);
    execute format('create policy "operacao escrever" on public.%I for all to authenticated
                    using (public.meu_papel() in (''admin'', ''gerente''))
                    with check (public.meu_papel() in (''admin'', ''gerente''))', t);
  end loop;
end $$;

-- ---------- Fotos de perfil ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "fotos ler" on storage.objects;
drop policy if exists "fotos enviar" on storage.objects;
drop policy if exists "fotos trocar" on storage.objects;
drop policy if exists "fotos apagar" on storage.objects;
create policy "fotos ler" on storage.objects for select using (bucket_id = 'fotos');
create policy "fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "fotos trocar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "fotos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.meu_papel() in ('admin', 'gerente', 'campo'));

-- ---------- Tempo real ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'perfis') then
    alter publication supabase_realtime add table public.perfis;
  end if;
end $$;
