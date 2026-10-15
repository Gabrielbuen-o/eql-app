-- =====================================================================
-- EQL Group — atualização 22: excluir relatório só com o administrador
--  * gerente continua mexendo em tudo nos relatórios (editar, tirar foto, exportar),
--    mas para EXCLUIR um relatório ele pede e um administrador aprova ou recusa
--  * quem está fazendo um relatório pode descartar o próprio enquanto está em andamento
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

-- só administrador apaga relatório (e os arquivos dele)
drop policy if exists "relatorios apagar" on public.relatorios;
create policy "relatorios apagar" on public.relatorios for delete to authenticated
  using (public.meu_papel() = 'admin');
drop policy if exists "relatorios arquivos apagar" on storage.objects;
create policy "relatorios arquivos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'relatorios' and public.meu_papel() = 'admin');

-- pedidos de exclusão
create table if not exists public.relatorio_exclusoes (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  uuid not null,              -- sem ligação: o pedido fica no histórico depois que o relatório some
  rotulo        text,                       -- ex.: "Final do dia · Riviera · 14/10"
  motivo        text not null check (length(trim(motivo)) > 0),
  pedido_por    uuid default auth.uid() references public.perfis(id) on delete set null,
  pedido_em     timestamptz not null default now(),
  status        text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  decidido_por  uuid references public.perfis(id) on delete set null,
  decidido_em   timestamptz,
  resposta      text
);
create unique index if not exists relatorio_exclusoes_um_pendente on public.relatorio_exclusoes (relatorio_id) where status = 'pendente';

alter table public.relatorio_exclusoes enable row level security;
drop policy if exists "exclusoes ler" on public.relatorio_exclusoes;
drop policy if exists "exclusoes pedir" on public.relatorio_exclusoes;
drop policy if exists "exclusoes decidir" on public.relatorio_exclusoes;
-- administrador vê todos; gerente vê os que pediu
create policy "exclusoes ler" on public.relatorio_exclusoes for select to authenticated
  using (public.meu_papel() = 'admin' or pedido_por = auth.uid());
create policy "exclusoes pedir" on public.relatorio_exclusoes for insert to authenticated
  with check (public.meu_papel() in ('admin', 'gerente') and pedido_por = auth.uid() and status = 'pendente');
create policy "exclusoes decidir" on public.relatorio_exclusoes for update to authenticated
  using (public.meu_papel() = 'admin') with check (public.meu_papel() = 'admin');

create or replace function public.exclusao_decidida() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status <> 'pendente' then
    new.decidido_por := coalesce(auth.uid(), new.decidido_por);
    new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists exclusao_decidida on public.relatorio_exclusoes;
create trigger exclusao_decidida before update on public.relatorio_exclusoes
for each row execute function public.exclusao_decidida();

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'relatorio_exclusoes') then
    alter publication supabase_realtime add table public.relatorio_exclusoes;
  end if;
end $$;
