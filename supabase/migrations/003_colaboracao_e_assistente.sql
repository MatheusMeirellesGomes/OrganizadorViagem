-- Etapa 15: colaboração por viagem e limite de uso do assistente.
-- Aplicar depois de 001 e 002 no projeto Supabase configurado (não é aplicado sozinho).
-- Não exponha a service_role no frontend.

-- Quem participa de cada viagem, além do dono (trips.user_id).
create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  email text,
  created_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members(user_id);

-- Convites de uso único. Só o resumo (SHA-256) do código fica no banco.
create table public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  role text not null check (role in ('editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz
);

-- Papel da pessoa logada na viagem: 'owner', 'editor', 'viewer' ou null.
-- security definer evita recursão das políticas de trips e trip_members.
create function public.trip_role(t uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.trips where id = t and user_id = (select auth.uid())) then 'owner'
    else (select role from public.trip_members where trip_id = t and user_id = (select auth.uid()))
  end;
$$;
revoke all on function public.trip_role(uuid) from public, anon;
grant execute on function public.trip_role(uuid) to authenticated;

-- Viagens: participantes leem; editores editam. Excluir continua só com o dono.
drop policy "Owners read trips" on public.trips;
create policy "Owners and members read trips" on public.trips for select to authenticated
  using ((select auth.uid()) = user_id or public.trip_role(id) in ('editor', 'viewer'));
drop policy "Owners edit trips" on public.trips;
create policy "Owners and editors edit trips" on public.trips for update to authenticated
  using ((select auth.uid()) = user_id or public.trip_role(id) = 'editor')
  -- O dono nunca muda por uma edição de participante.
  with check (user_id = (select t.user_id from public.trips t where t.id = trips.id));

alter table public.trip_members enable row level security;
create policy "Members see the people of their trips" on public.trip_members for select to authenticated
  using (public.trip_role(trip_id) is not null);
create policy "Owner removes people, people leave" on public.trip_members for delete to authenticated
  using (public.trip_role(trip_id) = 'owner' or user_id = (select auth.uid()));
create policy "Owner changes roles" on public.trip_members for update to authenticated
  using (public.trip_role(trip_id) = 'owner') with check (public.trip_role(trip_id) = 'owner');
grant select, update, delete on public.trip_members to authenticated;
revoke all on public.trip_members from anon;

alter table public.trip_invites enable row level security;
create policy "Owner sees invites" on public.trip_invites for select to authenticated
  using (public.trip_role(trip_id) = 'owner');
create policy "Owner creates invites" on public.trip_invites for insert to authenticated
  with check (public.trip_role(trip_id) = 'owner' and created_by = (select auth.uid()));
create policy "Owner revokes invites" on public.trip_invites for delete to authenticated
  using (public.trip_role(trip_id) = 'owner');
grant select, insert, delete on public.trip_invites to authenticated;
revoke all on public.trip_invites from anon;

-- Aceitar convite: confere o resumo, a validade e o uso único.
create function public.accept_trip_invite(token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.trip_invites;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select * into inv from public.trip_invites
   where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
   for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invalid or expired invite';
  end if;
  if exists (select 1 from public.trips where id = inv.trip_id and user_id = (select auth.uid())) then
    return inv.trip_id; -- o dono abrindo o próprio convite
  end if;
  insert into public.trip_members (trip_id, user_id, role, email)
  values (inv.trip_id, (select auth.uid()), inv.role, (select auth.jwt() ->> 'email'))
  on conflict (trip_id, user_id) do update set role = excluded.role;
  update public.trip_invites set accepted_by = (select auth.uid()), accepted_at = now() where id = inv.id;
  return inv.trip_id;
end;
$$;
revoke all on function public.accept_trip_invite(text) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;

-- Fotos e documentos privados continuam visíveis só para o dono (pastas por usuário).
-- Compartilhá-los exige políticas de Storage próprias; fica para uma etapa futura.

-- Limite diário do assistente (contado pela função no servidor com a service_role).
create table public.assistant_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;
create policy "People see their own usage" on public.assistant_usage for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.assistant_usage to authenticated;
revoke all on public.assistant_usage from anon;
