create table public.driver_subscriptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  plan text not null check (plan in ('plus', 'premium')),
  product_id text not null check (product_id in ('kayan_driver_plus', 'kayan_driver_premium')),
  purchase_token_hash text not null unique check (purchase_token_hash ~ '^[a-f0-9]{64}$'),
  obfuscated_account_id text not null check (char_length(obfuscated_account_id) between 1 and 64),
  status text not null check (status in ('active', 'cancelled', 'grace_period', 'on_hold', 'paused', 'expired', 'revoked')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  auto_renew_enabled boolean not null default false,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > started_at)
);

create index driver_subscriptions_driver_expiry_idx
  on public.driver_subscriptions (driver_id, expires_at desc);

create trigger driver_subscriptions_set_updated_at
before update on public.driver_subscriptions
for each row execute function public.set_updated_at();

alter table public.driver_subscriptions enable row level security;
revoke all on public.driver_subscriptions from public, anon, authenticated;
grant all on public.driver_subscriptions to service_role;

alter table public.ride_requests
  add column completed_at timestamptz,
  add column commission_rate_bps smallint not null default 0
    check (commission_rate_bps in (0, 500)),
  add column commission_due_zmw numeric(9, 2) not null default 0
    check (commission_due_zmw >= 0),
  add column commission_plan text not null default 'free'
    check (commission_plan in ('free', 'plus', 'premium')),
  add column commission_subscription_id uuid
    references public.driver_subscriptions (id) on delete set null;

create index ride_requests_driver_completed_idx
  on public.ride_requests (accepted_driver_id, completed_at desc)
  where status = 'completed';

create table public.driver_premium_fuel_rewards (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  subscription_id uuid not null references public.driver_subscriptions (id) on delete cascade,
  period_number integer not null check (period_number > 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  completed_trips integer not null check (completed_trips >= 100),
  status text not null default 'eligible' check (status in ('eligible', 'issued')),
  voucher_value_zmw numeric(9, 2) check (voucher_value_zmw is null or voucher_value_zmw > 0),
  voucher_reference text check (voucher_reference is null or char_length(voucher_reference) <= 120),
  issued_by uuid references public.driver_application_reviewers (user_id) on delete set null,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_number),
  check (period_end > period_start),
  check (
    (status = 'eligible' and issued_by is null and issued_at is null)
    or (status = 'issued' and voucher_value_zmw is not null and issued_by is not null and issued_at is not null)
  )
);

create index driver_premium_fuel_rewards_driver_period_idx
  on public.driver_premium_fuel_rewards (driver_id, period_start desc);

create trigger driver_premium_fuel_rewards_set_updated_at
before update on public.driver_premium_fuel_rewards
for each row execute function public.set_updated_at();

alter table public.driver_premium_fuel_rewards enable row level security;
revoke all on public.driver_premium_fuel_rewards from public, anon, authenticated;
grant all on public.driver_premium_fuel_rewards to service_role;

create table public.google_play_rtdn_messages (
  message_id text primary key check (char_length(message_id) between 1 and 200),
  processed_at timestamptz not null default now()
);

alter table public.google_play_rtdn_messages enable row level security;
revoke all on public.google_play_rtdn_messages from public, anon, authenticated;
grant all on public.google_play_rtdn_messages to service_role;

create function public.refresh_driver_premium_fuel_rewards(p_driver_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription record;
  v_month_count integer;
  v_period_count integer;
  v_period_number integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_completed_trips integer;
begin
  if auth.uid() is distinct from p_driver_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'You can only refresh your own Premium reward progress.';
  end if;
  if p_driver_id is null then
    raise exception 'A driver account is required.';
  end if;

  for v_subscription in
    select id, driver_id, started_at, expires_at, status
      from public.driver_subscriptions
      where driver_id = p_driver_id
        and plan = 'premium'
        and status <> 'revoked'
  loop
    v_month_count := greatest(0,
      (extract(year from now())::integer - extract(year from v_subscription.started_at)::integer) * 12
      + extract(month from now())::integer - extract(month from v_subscription.started_at)::integer);
    v_period_count := v_month_count / 3;
    if v_period_count > 0
      and v_subscription.started_at + (v_period_count * interval '3 months') > now() then
      v_period_count := v_period_count - 1;
    end if;
    if v_period_count < 1 then
      continue;
    end if;

    for v_period_number in 1..v_period_count loop
      v_period_start := v_subscription.started_at + ((v_period_number - 1) * interval '3 months');
      v_period_end := v_subscription.started_at + (v_period_number * interval '3 months');
      if v_period_end > now() or v_period_end > v_subscription.expires_at then
        continue;
      end if;

      select count(*)::integer
        into v_completed_trips
        from public.ride_requests
        where accepted_driver_id = p_driver_id
          and status = 'completed'
          and completed_at >= v_period_start
          and completed_at < v_period_end;
      if v_completed_trips >= 100 then
        insert into public.driver_premium_fuel_rewards (
          driver_id, subscription_id, period_number, period_start, period_end, completed_trips
        ) values (
          p_driver_id, v_subscription.id, v_period_number, v_period_start, v_period_end, v_completed_trips
        )
        on conflict (subscription_id, period_number) do update
          set completed_trips = excluded.completed_trips
          where public.driver_premium_fuel_rewards.status = 'eligible';
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.refresh_driver_premium_fuel_rewards(uuid) from public, anon;
grant execute on function public.refresh_driver_premium_fuel_rewards(uuid) to authenticated, service_role;

create function public.record_verified_driver_subscription(
  p_driver_id uuid,
  p_plan text,
  p_product_id text,
  p_purchase_token_hash text,
  p_obfuscated_account_id text,
  p_status text,
  p_started_at timestamptz,
  p_expires_at timestamptz,
  p_auto_renew_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Verified Google Play purchases can only be recorded by the server.';
  end if;
  if p_driver_id is null or not exists (
    select 1 from public.driver_profiles
    where id = p_driver_id and account_status = 'active'
  ) then
    raise exception 'An approved driver account is required for a subscription.';
  end if;
  if p_plan is null or p_product_id is null or not (
    (p_plan = 'plus' and p_product_id = 'kayan_driver_plus')
    or (p_plan = 'premium' and p_product_id = 'kayan_driver_premium')
  ) then
    raise exception 'The Play Store product does not match a KAYAN driver plan.';
  end if;
  if p_purchase_token_hash is null or p_purchase_token_hash !~ '^[a-f0-9]{64}$'
    or p_obfuscated_account_id is null or char_length(p_obfuscated_account_id) not between 1 and 64
    or p_status is null or p_status not in ('active', 'cancelled', 'grace_period', 'on_hold', 'paused', 'expired', 'revoked')
    or p_started_at is null or p_expires_at is null or p_expires_at <= p_started_at
    or p_started_at > now() + interval '5 minutes'
    or p_auto_renew_enabled is null then
    raise exception 'The verified Play subscription details are invalid.';
  end if;

  insert into public.driver_subscriptions (
    driver_id, plan, product_id, purchase_token_hash, obfuscated_account_id,
    status, started_at, expires_at, auto_renew_enabled, verified_at
  ) values (
    p_driver_id, p_plan, p_product_id, p_purchase_token_hash, p_obfuscated_account_id,
    p_status, p_started_at, p_expires_at, p_auto_renew_enabled, now()
  )
  on conflict (purchase_token_hash) do update
    set plan = excluded.plan,
        product_id = excluded.product_id,
        obfuscated_account_id = excluded.obfuscated_account_id,
        status = excluded.status,
        started_at = least(public.driver_subscriptions.started_at, excluded.started_at),
        expires_at = excluded.expires_at,
        auto_renew_enabled = excluded.auto_renew_enabled,
        verified_at = now()
    where public.driver_subscriptions.driver_id = excluded.driver_id
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception 'This Google Play subscription is already linked to another driver.';
  end if;

  perform public.refresh_driver_premium_fuel_rewards(p_driver_id);
  return v_subscription_id;
end;
$$;

revoke all on function public.record_verified_driver_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.record_verified_driver_subscription(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean) to service_role;

create function public.get_driver_membership_summary()
returns table (
  plan text,
  status text,
  starts_at timestamptz,
  expires_at timestamptz,
  auto_renew_enabled boolean,
  commission_rate_bps smallint,
  commission_due_zmw numeric,
  premium_period_start timestamptz,
  premium_period_end timestamptz,
  premium_completed_trips integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_subscription_id uuid;
  v_plan text := 'free';
  v_status text := 'free';
  v_started_at timestamptz;
  v_expires_at timestamptz;
  v_auto_renew_enabled boolean := false;
  v_commission_due_zmw numeric := 0;
  v_commission_rate_bps smallint := 500;
  v_month_count integer;
  v_period_number integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_premium_completed_trips integer := 0;
begin
  if v_driver_id is null then
    raise exception 'Authentication is required to view your driver membership.';
  end if;
  perform public.refresh_driver_premium_fuel_rewards(v_driver_id);

  select subscription.id, subscription.plan, subscription.status,
      subscription.started_at, subscription.expires_at, subscription.auto_renew_enabled
    into v_subscription_id, v_plan, v_status, v_started_at, v_expires_at, v_auto_renew_enabled
    from public.driver_subscriptions as subscription
    where subscription.driver_id = v_driver_id
      and subscription.expires_at > now()
      and subscription.status in ('active', 'cancelled', 'grace_period')
    order by subscription.expires_at desc
    limit 1;

  if v_subscription_id is null then
    v_plan := 'free';
    v_status := 'free';
    v_auto_renew_enabled := false;
    v_commission_rate_bps := 500;
  else
    v_commission_rate_bps := 0;
  end if;

  select coalesce(sum(ride.commission_due_zmw), 0)
    into v_commission_due_zmw
    from public.ride_requests as ride
    where ride.accepted_driver_id = v_driver_id
      and ride.status = 'completed';

  if v_plan = 'premium' and v_started_at is not null then
    v_month_count := greatest(0,
      (extract(year from now())::integer - extract(year from v_started_at)::integer) * 12
      + extract(month from now())::integer - extract(month from v_started_at)::integer);
    v_period_number := (v_month_count / 3) + 1;
    v_period_start := v_started_at + ((v_period_number - 1) * interval '3 months');
    if v_period_start > now() then
      v_period_number := greatest(1, v_period_number - 1);
      v_period_start := v_started_at + ((v_period_number - 1) * interval '3 months');
    end if;
    v_period_end := v_started_at + (v_period_number * interval '3 months');
    select count(*)::integer
      into v_premium_completed_trips
      from public.ride_requests as ride
      where ride.accepted_driver_id = v_driver_id
        and ride.status = 'completed'
        and ride.completed_at >= v_period_start
        and ride.completed_at < v_period_end;
  end if;

  return query select
    v_plan, v_status, v_started_at, v_expires_at, v_auto_renew_enabled,
    v_commission_rate_bps, v_commission_due_zmw,
    v_period_start, v_period_end, v_premium_completed_trips;
end;
$$;

revoke all on function public.get_driver_membership_summary() from public, anon;
grant execute on function public.get_driver_membership_summary() to authenticated;

create function public.get_driver_commission_history()
returns table (
  ride_id uuid,
  destination text,
  completed_at timestamptz,
  fare_zmw numeric,
  commission_plan text,
  commission_rate_bps smallint,
  commission_due_zmw numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to view your commission history.';
  end if;

  return query
    select ride.id, ride.destination, ride.completed_at, ride.fare_zmw,
      ride.commission_plan, ride.commission_rate_bps, ride.commission_due_zmw
      from public.ride_requests as ride
      where ride.accepted_driver_id = auth.uid()
        and ride.status = 'completed'
      order by ride.completed_at desc
      limit 50;
end;
$$;

revoke all on function public.get_driver_commission_history() from public, anon;
grant execute on function public.get_driver_commission_history() to authenticated;

create function public.get_driver_premium_fuel_rewards()
returns table (
  reward_id uuid,
  period_start timestamptz,
  period_end timestamptz,
  completed_trips integer,
  status text,
  voucher_value_zmw numeric,
  voucher_reference text,
  issued_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to view your Premium rewards.';
  end if;
  perform public.refresh_driver_premium_fuel_rewards(auth.uid());

  return query
    select reward.id, reward.period_start, reward.period_end, reward.completed_trips,
      reward.status, reward.voucher_value_zmw, reward.voucher_reference, reward.issued_at
      from public.driver_premium_fuel_rewards as reward
      where reward.driver_id = auth.uid()
      order by reward.period_start desc
      limit 20;
end;
$$;

revoke all on function public.get_driver_premium_fuel_rewards() from public, anon;
grant execute on function public.get_driver_premium_fuel_rewards() to authenticated;

create function public.issue_driver_premium_fuel_reward(
  p_reward_id uuid,
  p_voucher_value_zmw numeric,
  p_voucher_reference text,
  p_reviewer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Fuel rewards can only be issued through the authorized admin service.';
  end if;
  if p_reward_id is null or p_voucher_value_zmw is null or p_voucher_value_zmw <= 0
    or (p_voucher_reference is not null and char_length(p_voucher_reference) > 120) then
    raise exception 'Enter a valid positive fuel voucher value and reference.';
  end if;
  if not exists (
    select 1 from public.driver_application_reviewers
    where user_id = p_reviewer_id and is_active
  ) then
    raise exception 'Reviewer access is not active.';
  end if;

  update public.driver_premium_fuel_rewards
    set status = 'issued',
        voucher_value_zmw = round(p_voucher_value_zmw, 2),
        voucher_reference = nullif(trim(p_voucher_reference), ''),
        issued_by = p_reviewer_id,
        issued_at = now()
    where id = p_reward_id
      and status = 'eligible'
    returning id into v_reward_id;
  if v_reward_id is null then
    raise exception 'This fuel reward is not eligible or was already issued.';
  end if;
  return v_reward_id;
end;
$$;

revoke all on function public.issue_driver_premium_fuel_reward(uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.issue_driver_premium_fuel_reward(uuid, numeric, text, uuid) to service_role;

create or replace function public.finish_driver_ride_request(p_ride_id uuid, p_cancelled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver_id uuid := auth.uid();
  v_fare_zmw numeric;
  v_driver_stage smallint;
  v_subscription_id uuid;
  v_plan text := 'free';
  v_commission_rate_bps smallint := 500;
  v_commission_due_zmw numeric(9, 2) := 0;
begin
  if v_driver_id is null then
    raise exception 'Authentication is required to finish a ride.';
  end if;
  if p_cancelled is null then
    raise exception 'A ride completion status is required.';
  end if;

  select fare_zmw, driver_stage
    into v_fare_zmw, v_driver_stage
    from public.ride_requests
    where id = p_ride_id
      and accepted_driver_id = v_driver_id
      and status = 'accepted'
    for update;
  if not found then
    return false;
  end if;

  if p_cancelled then
    update public.ride_requests
      set status = 'cancelled'
      where id = p_ride_id
        and accepted_driver_id = v_driver_id
        and status = 'accepted';
    return found;
  end if;
  if v_driver_stage <> 3 then
    raise exception 'Complete the drop-off stage before finishing this successful trip.';
  end if;

  select subscription.id, subscription.plan
    into v_subscription_id, v_plan
    from public.driver_subscriptions as subscription
    where subscription.driver_id = v_driver_id
      and subscription.expires_at > now()
      and subscription.status in ('active', 'cancelled', 'grace_period')
    order by subscription.expires_at desc
    limit 1;
  if v_subscription_id is not null then
    v_commission_rate_bps := 0;
  else
    v_plan := 'free';
  end if;
  v_commission_due_zmw := round(v_fare_zmw * v_commission_rate_bps / 10000.0, 2);

  update public.ride_requests
    set status = 'completed',
        completed_at = now(),
        commission_rate_bps = v_commission_rate_bps,
        commission_due_zmw = v_commission_due_zmw,
        commission_plan = v_plan,
        commission_subscription_id = v_subscription_id
    where id = p_ride_id
      and accepted_driver_id = v_driver_id
      and status = 'accepted';
  if not found then
    return false;
  end if;

  perform public.refresh_driver_premium_fuel_rewards(v_driver_id);
  return true;
end;
$$;

revoke all on function public.finish_driver_ride_request(uuid, boolean) from public, anon;
grant execute on function public.finish_driver_ride_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
