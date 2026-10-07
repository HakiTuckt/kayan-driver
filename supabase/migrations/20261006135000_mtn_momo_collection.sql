alter table public.ride_requests
  add column payment_method text not null default 'Cash'
    check (payment_method in ('Cash', 'MTN MoMo', 'Airtel Money', 'Zamtel Kwacha'));

create table public.mtn_momo_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests (id) on delete cascade,
  passenger_id uuid not null references auth.users (id) on delete cascade,
  reference_id uuid not null unique,
  amount_zmw numeric(9, 2) not null check (amount_zmw > 0 and amount_zmw <= 100000),
  status text not null default 'pending'
    check (status in ('pending', 'successful', 'failed')),
  financial_transaction_id text,
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mtn_momo_payments_passenger_created_idx
  on public.mtn_momo_payments (passenger_id, created_at desc);
create unique index mtn_momo_payments_one_active_per_ride_idx
  on public.mtn_momo_payments (ride_id)
  where status in ('pending', 'successful');

create trigger mtn_momo_payments_set_updated_at
before update on public.mtn_momo_payments
for each row execute function public.set_updated_at();

alter table public.mtn_momo_payments enable row level security;
revoke all on public.mtn_momo_payments from anon, authenticated;
