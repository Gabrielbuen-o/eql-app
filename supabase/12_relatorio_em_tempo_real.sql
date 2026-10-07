-- =====================================================================
-- EQL Group — atualização 12: RELATÓRIO SALVO EM TEMPO REAL
--  * cada foto sobe assim que é tirada; o relatório já existe como "em andamento"
--    (rascunho) e vira "enviado" quando o funcionário conclui
--  * se o celular cair na água, as fotos que já subiram estão salvas
-- Precisa da atualização 09 (relatórios) já rodada.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

alter table public.relatorios add column if not exists status text not null default 'enviado';
alter table public.relatorios drop constraint if exists relatorios_status_check;
alter table public.relatorios add constraint relatorios_status_check check (status in ('rascunho', 'enviado'));
alter table public.relatorios add column if not exists atualizado_em timestamptz not null default now();

-- quem começou o relatório pode ir acrescentando fotos e concluir (enquanto está em andamento)
drop policy if exists "relatorios autor continua" on public.relatorios;
create policy "relatorios autor continua" on public.relatorios for update to authenticated
  using (autor_id = auth.uid() and status = 'rascunho')
  with check (autor_id = auth.uid());
-- e pode descartar um relatório em andamento
drop policy if exists "relatorios autor descarta" on public.relatorios;
create policy "relatorios autor descarta" on public.relatorios for delete to authenticated
  using (autor_id = auth.uid() and status = 'rascunho');

create or replace function public.relatorios_tocar() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists relatorios_tocar on public.relatorios;
create trigger relatorios_tocar before update on public.relatorios
for each row execute function public.relatorios_tocar();

-- reenviar um arquivo que caiu no meio (mesmo nome) precisa de permissão de atualizar
drop policy if exists "relatorios arquivos trocar" on storage.objects;
create policy "relatorios arquivos trocar" on storage.objects for update to authenticated
  using (bucket_id = 'relatorios' and public.meu_papel() in ('admin', 'gerente', 'campo'))
  with check (bucket_id = 'relatorios' and public.meu_papel() in ('admin', 'gerente', 'campo'));
