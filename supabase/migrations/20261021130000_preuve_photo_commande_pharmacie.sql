alter table public.visites
  add column if not exists commande_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('preuves-commandes', 'preuves-commandes', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = 8388608,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_preuves_commandes_read on storage.objects;
create policy storage_preuves_commandes_read
on storage.objects for select to authenticated
using (
  bucket_id = 'preuves-commandes'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or is_admin()
    or is_vm_in_my_scope(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists storage_preuves_commandes_write on storage.objects;
create policy storage_preuves_commandes_write
on storage.objects for insert to authenticated
with check (
  bucket_id = 'preuves-commandes'
  and (storage.foldername(name))[1] = auth.uid()::text
);
