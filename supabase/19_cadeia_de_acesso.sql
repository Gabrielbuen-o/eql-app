-- =====================================================================
-- EQL Group — atualização 19: cadeia de acesso
-- Pode rodar mais de uma vez sem problema.
--
-- Só administrador vê quem é administrador, gerente, campo ou cliente.
-- Os outros leem a própria conta inteira e, dos colegas, só nome e foto
-- (para aparecer "lançado por Fulano" nos custos, EPI e obras).
--
-- Também: dados do cabeçalho do relatório oficial (RFI) guardados no relatório,
-- para o "Baixar RFI no modelo" sair preenchido (endereço, ID do site, etc.).
-- =====================================================================

drop policy if exists "perfis ler" on public.perfis;
create policy "perfis ler" on public.perfis for select to authenticated
  using (id = auth.uid() or public.meu_papel() = 'admin');

-- nome e foto dos colegas, sem nível de acesso, e-mail ou cliente
create or replace view public.perfis_publicos as
  select p.id, p.nome, p.foto_url
    from public.perfis p
   where public.meu_papel() in ('admin', 'gerente', 'campo');
revoke all on public.perfis_publicos from public, anon;
grant select on public.perfis_publicos to authenticated;

-- ---------- Cabeçalho do relatório oficial (RFI) ----------
alter table public.relatorios add column if not exists campos jsonb not null default '{}'::jsonb;

-- o portal do cliente também recebe o cabeçalho (para baixar o RFI no modelo)
create or replace function public.portal_cliente_dados(g text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  obras uuid[];
begin
  if g is null then
    return jsonb_build_object('grupo', null, 'obras', '[]'::jsonb, 'equipe', '[]'::jsonb, 'relatorios', '[]'::jsonb);
  end if;

  select coalesce(array_agg(d.id), '{}') into obras
    from public.demandas d
   where lower(trim(d.grupo)) = lower(g) and d.empresa <> 'eko';

  return jsonb_build_object(
    'grupo', g,
    'obras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'nome', d.nome, 'empresa', d.empresa, 'fase', d.fase, 'percentual', d.percentual,
               'inicio', d.inicio, 'entrega', d.entrega, 'arquivada', d.arquivada, 'atualizado_em', d.atualizado_em)
             order by d.arquivada, d.entrega nulls last, d.nome)
        from public.demandas d where d.id = any(obras)), '[]'::jsonb),
    -- equipe: últimos 60 dias e próximos 30
    'equipe', coalesce((
      select jsonb_agg(jsonb_build_object('demanda_id', a.demanda_id, 'dia', a.dia, 'funcionario_id', f.id, 'nome', f.nome, 'funcao', f.funcao)
             order by a.dia, f.nome)
        from public.alocacoes a join public.funcionarios f on f.id = a.funcionario_id
       where a.demanda_id = any(obras) and a.dia between current_date - 60 and current_date + 30), '[]'::jsonb),
    -- relatórios concluídos (o que ainda está sendo feito no campo não aparece)
    'relatorios', coalesce((
      select jsonb_agg(x order by x->>'dia' desc, x->>'criado_em' desc) from (
        select jsonb_build_object(
                 'id', r.id, 'demanda_id', r.demanda_id, 'dia', r.dia, 'tipo', r.tipo, 'observacao', r.observacao,
                 'arquivos', r.arquivos, 'campos', coalesce(r.campos, '{}'::jsonb), 'criado_em', r.criado_em, 'status', r.status,
                 'funcionario_id', r.funcionario_id, 'funcionario', f.nome) as x
          from public.relatorios r left join public.funcionarios f on f.id = r.funcionario_id
         where r.demanda_id = any(obras) and r.status = 'enviado'
         order by r.dia desc, r.criado_em desc
         limit 600) t), '[]'::jsonb)
  );
end $$;


revoke all on function public.portal_cliente_dados(text) from public, anon, authenticated;
