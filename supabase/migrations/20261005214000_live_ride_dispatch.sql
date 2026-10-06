alter table public.driver_vehicles
  add column fuel_type text not null default 'petrol'
    check (fuel_type in ('petrol', 'diesel', 'hybrid', 'electric')),
  add column engine_trim text not null default 'Unspecified'
    check (char_length(trim(engine_trim)) between 1 and 120);

grant insert (driver_id, make, model, year, plate, color, fuel_type, engine_trim)
  on public.driver_vehicles to authenticated;
grant update (make, model, year, plate, color, fuel_type, engine_trim)
  on public.driver_vehicles to authenticated;

create table public.driver_availability (
  driver_id uuid primary key references public.driver_profiles (id) on delete cascade,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger driver_availability_set_updated_at
before update on public.driver_availability
for each row execute function public.set_updated_at();

alter table public.driver_availability enable row level security;
revoke all on public.driver_availability from anon, authenticated;
grant select, insert, update on public.driver_availability to authenticated;

create policy "Drivers can read their own availability"
on public.driver_availability for select to authenticated
using ((select auth.uid()) = driver_id);

create policy "Approved drivers can set their own availability"
on public.driver_availability for insert to authenticated
with check (
  (select auth.uid()) = driver_id
  and exists (
    select 1 from public.driver_profiles
    where id = (select auth.uid()) and account_status = 'active'
  )
);

create policy "Approved drivers can update their own availability"
on public.driver_availability for update to authenticated
using (
  (select auth.uid()) = driver_id
  and exists (
    select 1 from public.driver_profiles
    where id = (select auth.uid()) and account_status = 'active'
  )
)
with check (
  (select auth.uid()) = driver_id
  and exists (
    select 1 from public.driver_profiles
    where id = (select auth.uid()) and account_status = 'active'
  )
);

create table public.driver_push_tokens (
  token text primary key check (char_length(token) between 1 and 4096),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  platform text not null check (platform = 'android'),
  updated_at timestamptz not null default now()
);

create index driver_push_tokens_driver_id_idx on public.driver_push_tokens (driver_id);
alter table public.driver_push_tokens enable row level security;
revoke all on public.driver_push_tokens from anon, authenticated;

create function public.register_driver_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to register a device.';
  end if;
  if p_token is null or char_length(p_token) not between 1 and 4096 then
    raise exception 'The push token is invalid.';
  end if;
  if not exists (
    select 1 from public.driver_profiles where id = (select auth.uid())
  ) then
    raise exception 'A submitted driver profile is required to register a device.';
  end if;

  insert into public.driver_push_tokens (token, driver_id, platform)
  values (p_token, (select auth.uid()), 'android')
  on conflict (token) do update
    set driver_id = excluded.driver_id,
        platform = excluded.platform,
        updated_at = now();
end;
$$;

revoke all on function public.register_driver_push_token(text) from public, anon;
grant execute on function public.register_driver_push_token(text) to authenticated;

create function public.set_driver_availability(p_is_online boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to change driver availability.';
  end if;
  if not exists (
    select 1 from public.driver_profiles
    where id = (select auth.uid()) and account_status = 'active'
  ) then
    raise exception 'Your driver application must be approved before going online.';
  end if;
  if p_is_online and exists (
    select 1 from public.ride_requests
    where accepted_driver_id = (select auth.uid()) and status = 'accepted'
  ) then
    raise exception 'Finish the accepted ride before going online again.';
  end if;

  insert into public.driver_availability (driver_id, is_online)
  values ((select auth.uid()), p_is_online)
  on conflict (driver_id) do update
    set is_online = excluded.is_online,
        updated_at = now();
  return p_is_online;
end;
$$;

revoke all on function public.set_driver_availability(boolean) from public, anon;
grant execute on function public.set_driver_availability(boolean) to authenticated;

create table public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references auth.users (id) on delete cascade,
  pickup text not null check (char_length(trim(pickup)) between 1 and 160),
  destination text not null check (char_length(trim(destination)) between 1 and 160),
  category text not null check (category in ('KAYAN Classic', 'KAYAN Comfort')),
  distance_km numeric(7, 2) not null check (distance_km > 0 and distance_km <= 500),
  fare_zmw numeric(9, 2) not null check (fare_zmw > 0 and fare_zmw <= 100000),
  status text not null default 'searching'
    check (status in ('searching', 'accepted', 'cancelled', 'completed', 'no_drivers')),
  accepted_driver_id uuid references public.driver_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ride_requests_passenger_status_idx
  on public.ride_requests (passenger_id, status, created_at desc);
create index ride_requests_status_created_idx
  on public.ride_requests (status, created_at);
create unique index ride_requests_one_active_per_passenger_idx
  on public.ride_requests (passenger_id)
  where status in ('searching', 'accepted');

create trigger ride_requests_set_updated_at
before update on public.ride_requests
for each row execute function public.set_updated_at();

create table public.driver_ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests (id) on delete cascade,
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create unique index driver_ride_offers_one_pending_per_driver_idx
  on public.driver_ride_offers (driver_id)
  where status = 'pending';
create unique index ride_requests_one_active_per_driver_idx
  on public.ride_requests (accepted_driver_id)
  where accepted_driver_id is not null and status = 'accepted';

create index driver_ride_offers_driver_status_idx
  on public.driver_ride_offers (driver_id, status, expires_at);
create index driver_ride_offers_ride_status_idx
  on public.driver_ride_offers (ride_id, status);

create trigger driver_ride_offers_set_updated_at
before update on public.driver_ride_offers
for each row execute function public.set_updated_at();

alter table public.ride_requests enable row level security;
alter table public.driver_ride_offers enable row level security;
revoke all on public.ride_requests, public.driver_ride_offers from anon, authenticated;
grant select on public.ride_requests, public.driver_ride_offers to authenticated;

create policy "Passengers and offered drivers can read ride requests"
on public.ride_requests for select to authenticated
using (
  passenger_id = (select auth.uid())
  or exists (
    select 1 from public.driver_ride_offers offers
    where offers.ride_id = ride_requests.id
      and offers.driver_id = (select auth.uid())
  )
);

create policy "Drivers can read their own offers"
on public.driver_ride_offers for select to authenticated
using (driver_id = (select auth.uid()));

create function public.respond_to_driver_ride_offer(p_offer_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride_id uuid;
  v_offer_status text;
  v_expires_at timestamptz;
  v_ride_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to respond to an offer.';
  end if;

  select ride_id
  into v_ride_id
  from public.driver_ride_offers
  where id = p_offer_id and driver_id = (select auth.uid());
  if not found then
    raise exception 'This offer is not available to your driver account.';
  end if;

  select status into v_ride_status
  from public.ride_requests
  where id = v_ride_id
  for update;
  if not found then
    raise exception 'The passenger ride request no longer exists.';
  end if;

  select status, expires_at
  into v_offer_status, v_expires_at
  from public.driver_ride_offers
  where id = p_offer_id and driver_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'This offer is not available to your driver account.';
  end if;
  if v_offer_status <> 'pending' then
    return v_offer_status;
  end if;

  if v_expires_at <= now() or v_ride_status <> 'searching' then
    update public.driver_ride_offers set status = 'expired' where id = p_offer_id;
    if v_ride_status = 'searching' then
      update public.driver_ride_offers
      set status = 'expired'
      where ride_id = v_ride_id and status = 'pending' and expires_at <= now();
      if not exists (
        select 1 from public.driver_ride_offers
        where ride_id = v_ride_id and status = 'pending' and expires_at > now()
      ) then
        update public.ride_requests set status = 'no_drivers'
        where id = v_ride_id and status = 'searching';
      end if;
    end if;
    return 'expired';
  end if;

  if p_accept then
    perform 1 from public.driver_profiles
    where id = (select auth.uid()) and account_status = 'active'
    for update;
    if not found then
      raise exception 'Your driver account is no longer approved to accept rides.';
    end if;
    if exists (
      select 1 from public.ride_requests
      where accepted_driver_id = (select auth.uid())
        and status = 'accepted'
        and id <> v_ride_id
    ) then
      update public.driver_ride_offers set status = 'expired' where id = p_offer_id;
      update public.driver_ride_offers
      set status = 'expired'
      where ride_id = v_ride_id and status = 'pending' and expires_at <= now();
      if not exists (
        select 1 from public.driver_ride_offers
        where ride_id = v_ride_id and status = 'pending' and expires_at > now()
      ) then
        update public.ride_requests set status = 'no_drivers'
        where id = v_ride_id and status = 'searching';
      end if;
      return 'occupied';
    end if;
    update public.ride_requests
    set status = 'accepted', accepted_driver_id = (select auth.uid())
    where id = v_ride_id and status = 'searching';
    if not found then
      update public.driver_ride_offers set status = 'expired' where id = p_offer_id;
      return 'expired';
    end if;
    update public.driver_ride_offers
    set status = case when id = p_offer_id then 'accepted' else 'expired' end
    where ride_id = v_ride_id and status = 'pending';
    update public.driver_availability
    set is_online = false, updated_at = now()
    where driver_id = (select auth.uid());
    return 'accepted';
  end if;

  update public.driver_ride_offers set status = 'declined' where id = p_offer_id;
  update public.driver_ride_offers
  set status = 'expired'
  where ride_id = v_ride_id and status = 'pending' and expires_at <= now();
  if not exists (
    select 1 from public.driver_ride_offers
    where ride_id = v_ride_id and status = 'pending' and expires_at > now()
  ) then
    update public.ride_requests set status = 'no_drivers'
    where id = v_ride_id and status = 'searching';
  end if;
  return 'declined';
end;
$$;

revoke all on function public.respond_to_driver_ride_offer(uuid, boolean) from public, anon;
grant execute on function public.respond_to_driver_ride_offer(uuid, boolean) to authenticated;

create function public.cancel_passenger_ride_request(p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to cancel a ride request.';
  end if;

  update public.ride_requests
  set status = 'cancelled'
  where id = p_ride_id
    and passenger_id = (select auth.uid())
    and status = 'searching';
  if not found then
    return false;
  end if;
  update public.driver_ride_offers
  set status = 'cancelled'
  where ride_id = p_ride_id and status = 'pending';
  return true;
end;
$$;

revoke all on function public.cancel_passenger_ride_request(uuid) from public, anon;
grant execute on function public.cancel_passenger_ride_request(uuid) to authenticated;

create function public.expire_passenger_ride_request(p_ride_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to check a ride request.';
  end if;

  select status, created_at
  into v_status, v_created_at
  from public.ride_requests
  where id = p_ride_id and passenger_id = (select auth.uid())
  for update;
  if not found or v_status <> 'searching' or v_created_at > now() - interval '60 seconds' then
    return false;
  end if;

  update public.driver_ride_offers
  set status = 'expired'
  where ride_id = p_ride_id and status = 'pending' and expires_at <= now();
  if exists (
    select 1 from public.driver_ride_offers
    where ride_id = p_ride_id and status = 'pending' and expires_at > now()
  ) then
    return false;
  end if;

  update public.ride_requests
  set status = 'no_drivers'
  where id = p_ride_id and status = 'searching';
  return found;
end;
$$;

revoke all on function public.expire_passenger_ride_request(uuid) from public, anon;
grant execute on function public.expire_passenger_ride_request(uuid) to authenticated;

create function public.finish_driver_ride_request(p_ride_id uuid, p_cancelled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to finish a ride.';
  end if;
  if p_cancelled is null then
    raise exception 'A ride completion status is required.';
  end if;

  update public.ride_requests
  set status = case when p_cancelled then 'cancelled' else 'completed' end
  where id = p_ride_id
    and accepted_driver_id = (select auth.uid())
    and status = 'accepted';
  return found;
end;
$$;

revoke all on function public.finish_driver_ride_request(uuid, boolean) from public, anon;
grant execute on function public.finish_driver_ride_request(uuid, boolean) to authenticated;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.ride_requests';
  exception
    when duplicate_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.driver_ride_offers';
  exception
    when duplicate_object then null;
  end;
end;
$$;
