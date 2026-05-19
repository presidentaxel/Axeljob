-- Migration : créer le bucket Storage privé « cv_photos » pour la photo CV.
-- Exécuter dans Supabase Dashboard > SQL Editor (une seule fois).
-- Sans ce bucket, les uploads renvoient : Bucket not found.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv_photos',
  'cv_photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nettoyage des anciennes policies permissives.
drop policy if exists "Public read cv_photos" on storage.objects;
drop policy if exists "Allow upload cv_photos" on storage.objects;
drop policy if exists "Allow update cv_photos" on storage.objects;
drop policy if exists "Allow delete cv_photos" on storage.objects;

-- Le backend utilise service_role pour signer les URLs, mais on borne aussi les accès client.
drop policy if exists "Authenticated read own cv_photos" on storage.objects;
create policy "Authenticated read own cv_photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cv_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated insert own cv_photos" on storage.objects;
create policy "Authenticated insert own cv_photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cv_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated update own cv_photos" on storage.objects;
create policy "Authenticated update own cv_photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cv_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'cv_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated delete own cv_photos" on storage.objects;
create policy "Authenticated delete own cv_photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cv_photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
commit;
