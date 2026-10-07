-- =====================================================================
-- EQL Group — atualização 13: ESTOQUE DE EPI
--  EPI = equipamento de proteção individual · EPC = equipamento de proteção coletiva
--  * catálogo de itens (tipo, categoria, unidade, CA e validade, tamanho, estoque mínimo)
--  * movimentos: entradas (quem adicionou) e saídas (para quem, motivo, ficha NR-6 assinada)
--  * o estoque atual é a soma dos movimentos; o banco não deixa sair mais do que tem
-- Só administradores e gerente acessam.
-- Como rodar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema. Não apaga nenhum dado.
-- =====================================================================

create table if not exists public.epi_itens (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) > 0),
  tipo            text not null default 'EPI' check (tipo in ('EPI', 'EPC')),
  categoria       text,
  unidade         text not null default 'un',
  ca              text,                 -- número do Certificado de Aprovação
  ca_validade     date,
  tamanho         text,
  estoque_minimo  numeric(10, 2) not null default 0 check (estoque_minimo >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.epi_movimentos (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.epi_itens(id) on delete restrict,
  tipo            text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  quantidade      numeric(10, 2) not null check (quantidade <> 0),   -- entrada/saída: positiva; ajuste: + ou −
  dia             date not null default current_date,
  destino         text check (destino in ('individual', 'coletivo')), -- só nas saídas
  funcionario_id  uuid references public.funcionarios(id) on delete set null,
  demanda_id      uuid references public.demandas(id) on delete set null,
  motivo          text,
  ficha_assinada  boolean,             -- NR-6: ficha de entrega assinada pelo funcionário
  observacao      text,
  autor_id        uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  check (tipo = 'ajuste' or quantidade > 0)
);
create index if not exists epi_mov_item_idx on public.epi_movimentos (item_id, dia);
create index if not exists epi_mov_func_idx on public.epi_movimentos (funcionario_id, dia);

-- não deixa registrar saída maior que o estoque
create or replace function public.epi_conferir_saldo() returns trigger
language plpgsql security definer set search_path = public as $$
declare saldo numeric;
begin
  if new.tipo = 'saida' or (new.tipo = 'ajuste' and new.quantidade < 0) then
    select coalesce(sum(case when tipo = 'saida' then -quantidade else quantidade end), 0)
      into saldo from epi_movimentos where item_id = new.item_id;
    if saldo - abs(new.quantidade) < 0 then
      raise exception 'Estoque insuficiente: há % e você tentou tirar %.', saldo, abs(new.quantidade);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists epi_conferir_saldo on public.epi_movimentos;
create trigger epi_conferir_saldo before insert on public.epi_movimentos
for each row execute function public.epi_conferir_saldo();

create or replace function public.epi_tocar() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists epi_tocar on public.epi_itens;
create trigger epi_tocar before update on public.epi_itens for each row execute function public.epi_tocar();

-- ---------- Acesso: administradores e gerente ----------
alter table public.epi_itens enable row level security;
alter table public.epi_movimentos enable row level security;
drop policy if exists "epi itens gestao" on public.epi_itens;
create policy "epi itens gestao" on public.epi_itens for all to authenticated
  using (public.meu_papel() in ('admin', 'gerente')) with check (public.meu_papel() in ('admin', 'gerente'));
drop policy if exists "epi mov ler" on public.epi_movimentos;
drop policy if exists "epi mov registrar" on public.epi_movimentos;
drop policy if exists "epi mov alterar" on public.epi_movimentos;
drop policy if exists "epi mov apagar" on public.epi_movimentos;
create policy "epi mov ler" on public.epi_movimentos for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente'));
create policy "epi mov registrar" on public.epi_movimentos for insert to authenticated
  with check (public.meu_papel() in ('admin', 'gerente') and autor_id = auth.uid());
create policy "epi mov alterar" on public.epi_movimentos for update to authenticated   -- ex.: marcar ficha como assinada
  using (public.meu_papel() in ('admin', 'gerente')) with check (public.meu_papel() in ('admin', 'gerente'));
create policy "epi mov apagar" on public.epi_movimentos for delete to authenticated     -- corrigir lançamento errado
  using (public.meu_papel() = 'admin');

-- ---------- Registro de atividades e tempo real ----------
do $$
declare t text;
begin
  foreach t in array array['epi_itens', 'epi_movimentos'] loop
    if to_regclass('public.atividades') is not null and t = 'epi_itens' then
      execute format('drop trigger if exists registrar_atividade on public.%I', t);
      execute format('create trigger registrar_atividade after insert or update or delete on public.%I
                      for each row execute function public.registrar_atividade()', t);
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
