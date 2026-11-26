-- Quero Conhecer na conta: a lista de lugares que a pessoa quer visitar um dia,
-- fora das viagens. Hoje ela fica só no aparelho (e no backup); com esta tabela,
-- passa a acompanhar a conta em qualquer aparelho.
-- Aplicar depois de 001 a 004. NÃO foi aplicada automaticamente: precisa de
-- autorização do dono do projeto.
-- Só a própria pessoa lê e grava a sua lista; ninguém mais, nem participantes
-- de viagens.

create table public.wishlists (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- lista no mesmo formato do aparelho (lugar, coleção, datas)
  data jsonb not null default '[]'::jsonb check (jsonb_typeof(data) = 'array' and octet_length(data::text) < 2000000),
  updated_at timestamptz not null default now()
);

alter table public.wishlists enable row level security;

create policy "Owner reads own wishlist" on public.wishlists for select to authenticated
  using (owner = (select auth.uid()));
create policy "Owner creates own wishlist" on public.wishlists for insert to authenticated
  with check (owner = (select auth.uid()));
create policy "Owner updates own wishlist" on public.wishlists for update to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "Owner deletes own wishlist" on public.wishlists for delete to authenticated
  using (owner = (select auth.uid()));

revoke all on public.wishlists from anon;
grant select, insert, update, delete on public.wishlists to authenticated;
