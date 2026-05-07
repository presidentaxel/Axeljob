-- Migration : créer le bucket Storage privé « application_docs » pour les PDFs des candidatures (lettre, CV, fiche).
-- Exécuter dans Supabase Dashboard > SQL Editor (une seule fois).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application_docs',
  'application_docs',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nettoyage des anciennes policies permissives.
drop policy if exists "Public read application_docs" on storage.objects;
drop policy if exists "Allow upload application_docs" on storage.objects;
drop policy if exists "Allow update application_docs" on storage.objects;
drop policy if exists "Allow delete application_docs" on storage.objects;

drop policy if exists "Authenticated read own application_docs" on storage.objects;
create policy "Authenticated read own application_docs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'application_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated insert own application_docs" on storage.objects;
create policy "Authenticated insert own application_docs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'application_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated update own application_docs" on storage.objects;
create policy "Authenticated update own application_docs"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'application_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'application_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated delete own application_docs" on storage.objects;
create policy "Authenticated delete own application_docs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'application_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
commit;
