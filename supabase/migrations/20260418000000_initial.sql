-- ============================================================
-- Chấm công — initial schema (multi-office)
-- ============================================================

create extension if not exists "pgcrypto";

-- Offices: nhiều chi nhánh
create table public.offices (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  address    text,
  latitude   double precision not null,
  longitude  double precision not null,
  radius_m   int not null default 100,
  timezone   text not null default 'Asia/Ho_Chi_Minh',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Employees: 1 record / 1 email. Liên kết với auth.users khi login lần đầu.
create table public.employees (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique references auth.users(id) on delete set null,
  email              text unique not null,
  name               text not null,
  reference_photo    text,                 -- path trong storage bucket 'faces'
  face_descriptor    jsonb,                -- float[128] từ face-api.js
  home_office_id     uuid references public.offices(id) on delete set null,
  is_admin           boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create index on public.employees (email);

-- Check-ins: mỗi lần nhân viên chấm công
create table public.check_ins (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  office_id          uuid references public.offices(id) on delete set null,
  checked_in_at      timestamptz not null default now(),
  selfie_path        text not null,
  latitude           double precision,
  longitude          double precision,
  distance_m         double precision,
  face_match_score   double precision,
  liveness_passed    boolean,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index on public.check_ins (employee_id, checked_in_at desc);
create index on public.check_ins (checked_in_at desc);
create index on public.check_ins (office_id, checked_in_at desc);

-- ============================================================
-- Seed offices
-- ============================================================
insert into public.offices (name, address, latitude, longitude, radius_m) values
  ('VP Hà Nội',  '493 Nguyễn Văn Cừ, Long Biên, Hà Nội',   21.0483985, 105.8809419, 100),
  ('VP Sài Gòn', '51 Thép Mới, P12, Tân Bình, TP. HCM',    10.7964726, 106.6486002, 100);

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public) values ('faces', 'faces', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('selfies', 'selfies', false)
  on conflict (id) do nothing;

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table public.offices   enable row level security;
alter table public.employees enable row level security;
alter table public.check_ins enable row level security;

-- Helper: user hiện tại có phải admin không
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.employees
    where user_id = auth.uid() and is_admin = true and is_active = true
  );
$$;

-- offices: ai đọc cũng được (client cần biết để phát hiện VP gần nhất); admin ghi
create policy "offices_read_all"   on public.offices for select using (is_active = true or public.is_admin());
create policy "offices_admin_all"  on public.offices for all
  using (public.is_admin()) with check (public.is_admin());

-- employees: đọc được chính mình; admin toàn quyền
create policy "emp_select_self"    on public.employees for select
  using (user_id = auth.uid() or public.is_admin());
create policy "emp_admin_all"      on public.employees for all
  using (public.is_admin()) with check (public.is_admin());

-- check_ins: đọc được check-in của chính mình; admin đọc tất cả
create policy "ci_select_self"     on public.check_ins for select
  using (
    exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    or public.is_admin()
  );

-- ============================================================
-- Storage policies
-- ============================================================
create policy "faces_read_admin"   on storage.objects for select
  using (bucket_id = 'faces' and public.is_admin());

create policy "selfies_read_own"   on storage.objects for select
  using (
    bucket_id = 'selfies' and (
      public.is_admin()
      or exists (
        select 1 from public.employees e
        where e.user_id = auth.uid()
          and (storage.foldername(name))[1] = e.id::text
      )
    )
  );
