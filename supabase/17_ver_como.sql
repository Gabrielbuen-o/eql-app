-- =====================================================================
-- EQL Group — atualização 17: "Ver como" (administradores)
-- Pode rodar mais de uma vez sem problema.
--
-- O administrador pode abrir o portal exatamente como um cliente vê.
-- O cliente continua vendo só o grupo dele; ninguém além de administrador usa a versão "como".
-- =====================================================================

-- dados do portal de um grupo (uso interno: só as funções abaixo chamam)
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
                 'arquivos', r.arquivos, 'criado_em', r.criado_em, 'status', r.status,
                 'funcionario_id', r.funcionario_id, 'funcionario', f.nome) as x
          from public.relatorios r left join public.funcionarios f on f.id = r.funcionario_id
         where r.demanda_id = any(obras) and r.status = 'enviado'
         order by r.dia desc, r.criado_em desc
         limit 600) t), '[]'::jsonb)
  );
end $$;


revoke all on function public.portal_cliente_dados(text) from public, anon, authenticated;

-- o próprio cliente
create or replace function public.portal_cliente() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.meu_papel(), '') <> 'cliente' then
    raise exception 'Somente para clientes.';
  end if;
  return public.portal_cliente_dados(public.meu_grupo());
end $$;
revoke all on function public.portal_cliente() from public, anon;
grant execute on function public.portal_cliente() to authenticated;

-- administrador vendo como um cliente
create or replace function public.portal_cliente_como(p_grupo text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(public.meu_papel(), '') <> 'admin' then
    raise exception 'Somente administradores.';
  end if;
  return public.portal_cliente_dados(nullif(trim(p_grupo), ''));
end $$;
revoke all on function public.portal_cliente_como(text) from public, anon;
grant execute on function public.portal_cliente_como(text) to authenticated;
