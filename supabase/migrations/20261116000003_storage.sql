-- Bucket público para imagens de produtos/banners enviadas pelo painel.
-- Upload é feito pelo servidor (service_role) após validação de admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "product_images_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "product_images_admin_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product_images_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
