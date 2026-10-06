-- =====================================================================
-- EQL Group — atualização 03: folgas/férias e frotas
-- Rode UMA vez no SQL Editor do Supabase. Só acrescenta, não apaga nada.
-- =====================================================================

-- Folgas e férias (um registro por funcionário por dia)
create table if not exists public.ausencias (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  dia             date not null,
  tipo            text not null default 'folga' check (tipo in ('folga', 'ferias')),
  criado_em       timestamptz not null default now(),
  unique (funcionario_id, dia)
);
create index if not exists ausencias_dia_idx on public.ausencias (dia);

-- Veículos da frota
create table if not exists public.veiculos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,            -- apelido: "HR", "Strada branca"…
  placa               text,
  tipo                text,                     -- caminhão, utilitário, carro…
  proxima_manutencao  date,
  observacoes         text,
  ativo               boolean not null default true,
  ordem               int not null default 0,
  criado_em           timestamptz not null default now()
);

-- Qual veículo vai para qual demanda, em qual dia
create table if not exists public.veiculo_alocacoes (
  id          uuid primary key default gen_random_uuid(),
  veiculo_id  uuid not null references public.veiculos(id) on delete cascade,
  demanda_id  uuid not null references public.demandas(id) on delete cascade,
  dia         date not null,
  criado_em   timestamptz not null default now(),
  unique (veiculo_id, demanda_id, dia)
);
create index if not exists veiculo_alocacoes_dia_idx on public.veiculo_alocacoes (dia);

-- Segurança: só quem está logado
alter table public.ausencias         enable row level security;
alter table public.veiculos          enable row level security;
alter table public.veiculo_alocacoes enable row level security;
drop policy if exists "logados" on public.ausencias;
drop policy if exists "logados" on public.veiculos;
drop policy if exists "logados" on public.veiculo_alocacoes;
create policy "logados" on public.ausencias         for all to authenticated using (true) with check (true);
create policy "logados" on public.veiculos          for all to authenticated using (true) with check (true);
create policy "logados" on public.veiculo_alocacoes for all to authenticated using (true) with check (true);

-- Tempo real
do $$
declare t text;
begin
  foreach t in array array['ausencias', 'veiculos', 'veiculo_alocacoes'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
