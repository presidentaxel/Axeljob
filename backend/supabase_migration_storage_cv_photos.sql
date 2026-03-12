-- Migration : créer le bucket Storage public « cv_photos » pour la photo CV.
-- Exécuter dans Supabase Dashboard > SQL Editor (une seule fois).
-- Sans ce bucket, les uploads renvoient : Bucket not found.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv_photos',
  'cv_photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Politique : lecture publique des objets du bucket (pour afficher la photo via URL)
drop policy if exists "Public read cv_photos" on storage.objects;
create policy "Public read cv_photos"
  on storage.objects for select
  using (bucket_id = 'cv_photos');

-- Politique : permettre les uploads (adaptez avec votre auth : with check (auth.role() = 'authenticated') ou true pour service_role)
drop policy if exists "Allow upload cv_photos" on storage.objects;
create policy "Allow upload cv_photos"
  on storage.objects for insert
  with check (bucket_id = 'cv_photos');

drop policy if exists "Allow update cv_photos" on storage.objects;
create policy "Allow update cv_photos"
  on storage.objects for update
  using (bucket_id = 'cv_photos');

drop policy if exists "Allow delete cv_photos" on storage.objects;
create policy "Allow delete cv_photos"
  on storage.objects for delete
  using (bucket_id = 'cv_photos');
