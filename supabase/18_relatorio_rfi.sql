-- =====================================================================
-- EQL Group — atualização 18: relatório RFI (por etapas)
-- Pode rodar mais de uma vez sem problema.
--
-- O RFI tem 26 etapas com até 10 fotos cada (46 recomendadas). O limite antigo
-- era de 40 arquivos por relatório; passa para 300.
-- =====================================================================
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.relatorios'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%jsonb_array_length%'
  loop
    execute format('alter table public.relatorios drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.relatorios add constraint relatorios_arquivos_limite
  check (jsonb_typeof(arquivos) = 'array' and jsonb_array_length(arquivos) <= 300);
