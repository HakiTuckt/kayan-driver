create table public.driver_application_reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

alter table public.driver_application_reviewers enable row level security;
revoke all on public.driver_application_reviewers from anon, authenticated;
grant select on public.driver_application_reviewers to service_role;

alter table public.driver_profiles
  drop constraint driver_profiles_account_status_check,
  add constraint driver_profiles_account_status_check
    check (account_status in ('pending_review', 'active', 'suspended', 'rejected')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.driver_application_reviewers (user_id),
  add column review_notes text
    check (review_notes is null or char_length(review_notes) <= 1000);

alter table public.driver_documents
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.driver_application_reviewers (user_id);

create table public.driver_application_reviews (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles (id) on delete cascade,
  reviewer_id uuid not null references public.driver_application_reviewers (user_id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index driver_application_reviews_driver_id_created_at_idx
  on public.driver_application_reviews (driver_id, created_at desc);

alter table public.driver_application_reviews enable row level security;
revoke all on public.driver_application_reviews from anon, authenticated;

grant select on public.driver_profiles, public.driver_vehicles, public.driver_documents to service_role;

create function public.review_driver_application(
  p_driver_id uuid,
  p_decision text,
  p_notes text,
  p_reviewer_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_next_status text;
  v_document_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'This operation is available only through the protected review service.';
  end if;

  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Choose approve or reject.';
  end if;
  if p_notes is not null and char_length(p_notes) > 1000 then
    raise exception 'Review notes must be 1000 characters or fewer.';
  end if;
  if p_decision = 'reject' and char_length(trim(coalesce(p_notes, ''))) < 5 then
    raise exception 'A rejection reason of at least 5 characters is required.';
  end if;
  if not exists (
    select 1
    from public.driver_application_reviewers
    where user_id = p_reviewer_id and is_active
  ) then
    raise exception 'Reviewer access is not active.';
  end if;

  select account_status
    into v_current_status
    from public.driver_profiles
    where id = p_driver_id
    for update;
  if not found then
    raise exception 'The driver application was not found.';
  end if;
  if v_current_status <> 'pending_review' then
    raise exception 'Only pending applications can be reviewed.';
  end if;

  if p_decision = 'approve' then
    if not exists (
      select 1 from public.driver_vehicles where driver_id = p_driver_id
    ) then
      raise exception 'The driver application has no vehicle record.';
    end if;

    select count(distinct document_type)
      into v_document_count
      from public.driver_documents
      where driver_id = p_driver_id
        and document_type in (
          'drivers_license',
          'national_registration_card',
          'vehicle_registration',
          'roadworthiness_certificate'
        )
        and review_status <> 'rejected';
    if v_document_count <> 4 then
      raise exception 'All four required documents must be present and reviewable before approval.';
    end if;
    v_next_status := 'active';
  else
    v_next_status := 'rejected';
  end if;

  update public.driver_documents
    set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
        reviewed_at = now(),
        reviewed_by = p_reviewer_id
    where driver_id = p_driver_id
      and review_status = 'pending_review';

  update public.driver_profiles
    set account_status = v_next_status,
        reviewed_at = now(),
        reviewed_by = p_reviewer_id,
        review_notes = nullif(trim(p_notes), '')
    where id = p_driver_id;

  insert into public.driver_application_reviews (
    driver_id, reviewer_id, decision, notes
  ) values (
    p_driver_id, p_reviewer_id, case when p_decision = 'approve' then 'approved' else 'rejected' end, nullif(trim(p_notes), '')
  );

  return v_next_status;
end;
$$;

revoke all on function public.review_driver_application(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_driver_application(uuid, text, text, uuid) to service_role;
