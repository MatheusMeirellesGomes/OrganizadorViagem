-- Execute in a new Supabase project. Never expose the service_role key in the frontend.
create table public.trips (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint data_id_matches check (data->>'id' = id::text)
);
create index trips_user_id_idx on public.trips(user_id);
alter table public.trips enable row level security;
create policy "Owners read trips" on public.trips for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create trips" on public.trips for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners edit trips" on public.trips for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete trips" on public.trips for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.trips to authenticated;
revoke all on public.trips from anon;
create function public.update_trip_timestamp() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;
create trigger set_trip_timestamp before update on public.trips for each row execute function public.update_trip_timestamp();
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('trip-photos','trip-photos',false,5242880,array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']);
create policy "Owners read photos" on storage.objects for select to authenticated using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete photos" on storage.objects for delete to authenticated using (bucket_id = 'trip-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
