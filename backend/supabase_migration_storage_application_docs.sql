-- Migration : créer le bucket Storage public « application_docs » pour les PDFs des candidatures (lettre, CV, fiche).
-- Exécuter dans Supabase Dashboard > SQL Editor (une seule fois).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application_docs',
  'application_docs',
  true,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read application_docs" on storage.objects;
create policy "Public read application_docs"
  on storage.objects for select
  using (bucket_id = 'application_docs');

drop policy if exists "Allow upload application_docs" on storage.objects;
create policy "Allow upload application_docs"
  on storage.objects for insert
  with check (bucket_id = 'application_docs');

drop policy if exists "Allow update application_docs" on storage.objects;
create policy "Allow update application_docs"
  on storage.objects for update
  using (bucket_id = 'application_docs');

drop policy if exists "Allow delete application_docs" on storage.objects;
create policy "Allow delete application_docs"
  on storage.objects for delete
  using (bucket_id = 'application_docs');
