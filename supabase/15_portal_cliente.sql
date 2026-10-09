-- =====================================================================
-- EQL Group — atualização 15: portal do cliente (Help, Agplan…)
-- Pode rodar mais de uma vez sem problema.
--
-- O cliente vê SÓ:
--   • as obras do grupo dele (nome, fase, andamento, datas) — sem descrição interna, sem pagamento
--   • a equipe que esteve/vai estar nas obras dele (nome e função) — sem frota
--   • os relatórios de obra concluídos das obras dele (fotos, vídeos, observação)
-- Nenhum valor, custo, faturamento, orçamento ou dado de outro cliente.
-- Tudo passa por uma única função que escolhe campo por campo o que sai do banco.
-- =====================================================================

-- grupo do cliente comparado sem diferença de maiúsculas/espaços ("help" = "Help ")
create or replace function public.meu_grupo() returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(cliente_grupo), '') from public.perfis where id = auth.uid()
$$;

-- 1) Cliente não lê mais a tabela de demandas direto (ela tem pagamento e descrição interna)
drop policy if exists "demandas ler" on public.demandas;
create policy "demandas ler" on public.demandas for select to authenticated
  using (public.meu_papel() in ('admin', 'gerente', 'campo'));

-- 2) Arquivos dos relatórios: listar o bucket só para a equipe EQL.
--    (o cliente abre as fotos pelo link de cada arquivo, que só chega até ele pelos relatórios dele)
drop policy if exists "relatorios arquivos ler" on storage.objects;
create policy "relatorios arquivos ler" on storage.objects for select to authenticated
  using (bucket_id = 'relatorios' and public.meu_papel() in ('admin', 'gerente', 'campo'));

-- 3) O portal: tudo o que o cliente pode ver, em uma chamada
create or replace function public.portal_cliente() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  g text := public.meu_grupo();
  obras uuid[];
begin
  if coalesce(public.meu_papel(), '') <> 'cliente' then
    raise exception 'Somente para clientes.';
  end if;
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
                 'arquivos', r.arquivos, 'criado_em', r.criado_em, 'status', r.status,
                 'funcionario_id', r.funcionario_id, 'funcionario', f.nome) as x
          from public.relatorios r left join public.funcionarios f on f.id = r.funcionario_id
         where r.demanda_id = any(obras) and r.status = 'enviado'
         order by r.dia desc, r.criado_em desc
         limit 600) t), '[]'::jsonb)
  );
end $$;

revoke all on function public.portal_cliente() from public, anon;
grant execute on function public.portal_cliente() to authenticated;
