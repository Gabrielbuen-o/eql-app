-- =====================================================================
-- EQL Group — atualização 09: RELATÓRIOS DE OBRA
--  * relatórios enviados pelo pessoal de campo (início do dia, fim do dia,
--    limpeza do dia e, depois, RFI, ancoragem e entrega de obra)
--  * pasta de arquivos "relatorios" para as fotos e vídeos (já comprimidos pelo app)
--  * cada usuário pode ser ligado a um funcionário (para o app saber quem é quem)
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- Usuário ↔ funcionário (ex.: login do Jefferson ligado ao funcionário Jefferson)
alter table public.perfis add column if not exists funcionario_id uuid references public.funcionarios(id) on delete set null;

-- Só administrador muda o tipo de acesso e o funcionário ligado ao usuário
create or replace function public.proteger_papel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.papel is distinct from old.papel or new.cliente_grupo is distinct from old.cliente_grupo
      or new.funcionario_id is distinct from old.funcionario_id)
     and coalesce(public.meu_papel(), '') <> 'admin' then
    raise exception 'Só administradores podem mudar o tipo de acesso.';
  end if;
  if old.papel = 'admin' and new.papel <> 'admin'
     and (select count(*) from public.perfis where papel = 'admin') <= 1 then
    raise exception 'Precisa existir pelo menos um administrador.';
  end if;
  return new;
end $$;

-- ---------- Relatórios ----------
create table if not exists public.relatorios (
  id              uuid primary key default gen_random_uuid(),
  demanda_id      uuid not null references public.demandas(id) on delete cascade,
  funcionario_id  uuid references public.funcionarios(id) on delete set null,  -- quem estava na obra e enviou
  autor_id        uuid default auth.uid() references public.perfis(id) on delete set null, -- login usado
  dia             date not null default current_date,
  tipo            text not null check (tipo in ('inicio_dia', 'fim_dia', 'limpeza', 'rfi', 'ancoragem', 'entrega_obra')),
  observacao      text,
  -- lista de arquivos: [{ "caminho": "...", "miniatura": "...", "tipo": "foto" | "video", "bytes": 123 }]
  arquivos        jsonb not null default '[]'::jsonb check (jsonb_typeof(arquivos) = 'array' and jsonb_array_length(arquivos) <= 40),
  criado_em       timestamptz not null default now()
);
create index if not exists relatorios_dia_idx on public.relatorios (dia);
create index if not exists relatorios_demanda_idx on public.relatorios (demanda_id, dia);

alter table public.relatorios enable row level security;
drop policy if exists "relatorios ler" on public.relatorios;
drop policy if exists "relatorios enviar" on public.relatorios;
drop policy if exists "relatorios alterar" on public.relatorios;
drop policy if exists "relatorios apagar" on public.relatorios;
-- administradores e gerente veem tudo; o campo vê o que foi enviado pelo próprio login
create policy "relatorios ler" on public.relatorios for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente') or autor_id = auth.uid());
create policy "relatorios enviar" on public.relatorios for insert to authenticated
  with check (public.meu_papel() in ('admin', 'gerente', 'campo') and autor_id = auth.uid());
create policy "relatorios alterar" on public.relatorios for update to authenticated
  using (public.meu_papel() in ('admin', 'gerente')) with check (public.meu_papel() in ('admin', 'gerente'));
create policy "relatorios apagar" on public.relatorios for delete to authenticated
  using (public.meu_papel() in ('admin', 'gerente'));

-- ---------- Pasta das fotos e vídeos ----------
-- limite de 50 MB por arquivo (o app já reduz as fotos para ~150–300 KB cada)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relatorios', 'relatorios', true, 52428800,
        array['image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "relatorios arquivos ler" on storage.objects;
drop policy if exists "relatorios arquivos enviar" on storage.objects;
drop policy if exists "relatorios arquivos apagar" on storage.objects;
create policy "relatorios arquivos ler" on storage.objects for select to authenticated
  using (bucket_id = 'relatorios');
create policy "relatorios arquivos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'relatorios' and public.meu_papel() in ('admin', 'gerente', 'campo'));
create policy "relatorios arquivos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'relatorios' and public.meu_papel() in ('admin', 'gerente'));

-- ---------- Tempo real (relatório novo aparece na hora para os administradores) ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'relatorios') then
    alter publication supabase_realtime add table public.relatorios;
  end if;
end $$;
