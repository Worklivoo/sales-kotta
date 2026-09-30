-- Upload da logo da empresa pelo portal (aba "Modelo de proposta")
--
-- O bucket `logos_clientes` ja existe e e publico (as URLs funcionam sem politica), mas nao tinha
-- NENHUMA politica de escrita para usuario logado: o upload pelo portal seria negado.
--
-- Migracao ADITIVA: uma unica politica nova, so de INSERT, e so dentro da pasta da propria
-- empresa (`<empresa_id>/arquivo`). Nao ha politica de UPDATE/DELETE: cada upload usa um nome
-- novo, entao nada existente e sobrescrito nem apagado por essa via. Logos antigas (na raiz do
-- bucket) continuam intocadas.

create policy "sales_logos_upload_propria_empresa"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logos_clientes'
    and (storage.foldername(name))[1] = public.sales_v2_current_empresa_id()::text
  );
