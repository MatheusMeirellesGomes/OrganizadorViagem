-- Etapa 16: localizadores de reserva (PNR, número da locação) fora dos dados da viagem.
-- Aplicar depois de 001, 002 e 003. Os dados da viagem (trips.data) são vistos por
-- quem participa dela; estes códigos não: só quem guardou e quem essa pessoa autorizar.

create table public.booking_secrets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  -- id do transporte, veículo ou reserva dentro da viagem
  ref_id text not null check (length(ref_id) between 1 and 80),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (length(code) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, ref_id, owner)
);

-- Autorizações explícitas: o dono do código escolhe quem mais pode vê-lo.
create table public.booking_secret_grants (
  secret_id uuid not null references public.booking_secrets(id) on delete cascade,
  grantee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (secret_id, grantee)
);

-- Funções security definer evitam recursão entre as políticas das duas tabelas.
create function public.booking_secret_granted(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.booking_secret_grants where secret_id = s and grantee = (select auth.uid()));
$$;
create function public.booking_secret_mine(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.booking_secrets where id = s and owner = (select auth.uid()));
$$;
revoke all on function public.booking_secret_granted(uuid), public.booking_secret_mine(uuid) from public, anon;
grant execute on function public.booking_secret_granted(uuid), public.booking_secret_mine(uuid) to authenticated;

alter table public.booking_secrets enable row level security;
alter table public.booking_secret_grants enable row level security;

-- Ler: quem guardou, ou quem foi autorizado e ainda participa da viagem.
create policy "Owner or granted reads booking secrets" on public.booking_secrets for select to authenticated
  using (
    owner = (select auth.uid())
    or (
      public.trip_role(trip_id) is not null
      and public.booking_secret_granted(id)
    )
  );
-- Gravar: só em viagens em que a pessoa participa, e sempre em nome próprio.
create policy "Members save their own codes" on public.booking_secrets for insert to authenticated
  with check (owner = (select auth.uid()) and public.trip_role(trip_id) is not null);
create policy "Owner updates own codes" on public.booking_secrets for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Owner deletes own codes" on public.booking_secrets for delete to authenticated
  using (owner = (select auth.uid()));

create policy "Code owner manages grants" on public.booking_secret_grants for all to authenticated
  using (public.booking_secret_mine(secret_id))
  with check (public.booking_secret_mine(secret_id));
create policy "Grantee sees own grant" on public.booking_secret_grants for select to authenticated
  using (grantee = (select auth.uid()));

grant select, insert, update, delete on public.booking_secrets to authenticated;
grant select, insert, delete on public.booking_secret_grants to authenticated;
revoke all on public.booking_secrets, public.booking_secret_grants from anon;

create function public.touch_booking_secret() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger booking_secrets_touch before update on public.booking_secrets
  for each row execute function public.touch_booking_secret();
