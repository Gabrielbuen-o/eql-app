-- =====================================================================
-- EQL Group — estrutura do banco de dados
-- Rode este arquivo UMA vez no Supabase: SQL Editor → New query → colar → Run
-- =====================================================================

-- Funcionários de campo
create table if not exists public.funcionarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  funcao      text,
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_em   timestamptz not null default now()
);

-- Demandas (obras, serviços e produção) das três empresas
create table if not exists public.demandas (
  id             uuid primary key default gen_random_uuid(),
  empresa        text not null check (empresa in ('engenharia', 'impermeabilizacao', 'eko')),
  grupo          text,                       -- cliente/parceiro: Obras civis, Help, Ageplan, Produção…
  nome           text not null,
  descricao      text,
  fase           text not null default 'orcamento'
                 check (fase in ('orcamento', 'aprovacao', 'execucao', 'entrega')),
  percentual     int not null default 0 check (percentual between 0 and 100),
  inicio         date,
  entrega        date,                       -- entrega máxima / produzir até
  pagamento      text not null default 'a_faturar'
                 check (pagamento in ('a_faturar', 'faturada', 'paga')),
  qtd_total      int,                        -- só para produção (Eko)
  qtd_produzida  int not null default 0,
  unidade        text,
  arquivada      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Quem trabalhou/vai trabalhar em qual demanda, em qual dia
create table if not exists public.alocacoes (
  id              uuid primary key default gen_random_uuid(),
  funcionario_id  uuid not null references public.funcionarios(id) on delete cascade,
  demanda_id      uuid not null references public.demandas(id) on delete cascade,
  dia             date not null,
  criado_em       timestamptz not null default now(),
  unique (funcionario_id, demanda_id, dia)
);
create index if not exists alocacoes_dia_idx on public.alocacoes (dia);

-- Atualiza "atualizado_em" sozinho
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$ begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists demandas_atualizado on public.demandas;
create trigger demandas_atualizado before update on public.demandas
for each row execute function public.tocar_atualizado_em();

-- Segurança: só quem está logado lê e altera
alter table public.funcionarios enable row level security;
alter table public.demandas     enable row level security;
alter table public.alocacoes    enable row level security;

drop policy if exists "logados" on public.funcionarios;
drop policy if exists "logados" on public.demandas;
drop policy if exists "logados" on public.alocacoes;
create policy "logados" on public.funcionarios for all to authenticated using (true) with check (true);
create policy "logados" on public.demandas     for all to authenticated using (true) with check (true);
create policy "logados" on public.alocacoes    for all to authenticated using (true) with check (true);

-- Tempo real: avisa todos os aparelhos quando algo muda
do $$
declare t text;
begin
  foreach t in array array['funcionarios', 'demandas', 'alocacoes'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
