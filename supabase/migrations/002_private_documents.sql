-- Apply after 001 in the user's configured project; not applied automatically.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('trip-documents','trip-documents',false,1048576,array['application/pdf','image/jpeg','image/png','image/webp']);
create policy "Owners read documents" on storage.objects for select to authenticated using (bucket_id = 'trip-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners upload documents" on storage.objects for insert to authenticated with check (bucket_id = 'trip-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete documents" on storage.objects for delete to authenticated using (bucket_id = 'trip-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
