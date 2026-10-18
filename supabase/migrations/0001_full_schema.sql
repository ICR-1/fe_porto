-- ============================================================
-- 0001_init.sql
-- ============================================================
-- Tables
create table public.projects (
  id text primary key default gen_random_uuid()::text,
  title_id text, title_en text,
  description_id text, description_en text,
  image_path text,
  tags text,
  created_at timestamptz not null default now()
);
create table public.certificates (
  id text primary key default gen_random_uuid()::text,
  title_id text, title_en text,
  image_path text,
  created_at timestamptz not null default now()
);
create table public.skills (
  id text primary key default gen_random_uuid()::text,
  name varchar(100),
  image_path text,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id int primary key default 1 check (id = 1),
  description_id text, description_en text,
  image_path text,
  cv_url1 text, cv_url2 text,
  updated_at timestamptz not null default now()
);
create table public.musics (
  id bigint generated always as identity primary key,
  title varchar(255), artist varchar(255),
  file_path text, cover_path text,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index musics_one_active on public.musics (is_active) where is_active;

-- Functions
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create function public.set_active_music(p_id bigint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.musics set is_active = false where is_active;
  update public.musics set is_active = true where id = p_id;
end $$;
revoke execute on function public.set_active_music(bigint) from public, anon;
grant execute on function public.set_active_music(bigint) to authenticated;

-- RLS
do $$
declare t text;
begin
  foreach t in array array['projects','certificates','skills','profiles','musics'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "admin insert" on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Storage (public buckets: files readable by URL, no listing policy)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('projek','projek',true, 10485760, array['image/png','image/jpeg','image/webp','image/gif']),
  ('sertif','sertif',true, 10485760, array['image/png','image/jpeg','image/webp','image/x-icon','image/vnd.microsoft.icon']),
  ('skills','skills',true, 5242880,  array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('profile','profile',true, 10485760, array['image/png','image/jpeg','image/webp']),
  ('music','music',true, 31457280, array['audio/mpeg','audio/mp3','image/png','image/jpeg','image/webp']);

create policy "admin write uploads" on storage.objects for all to authenticated
  using (bucket_id in ('projek','sertif','skills','profile','music') and public.is_admin())
  with check (bucket_id in ('projek','sertif','skills','profile','music') and public.is_admin());

-- ============================================================
-- 0002_indonesian_only.sql
-- ============================================================
alter table public.projects drop column title_en, drop column description_en;
alter table public.projects rename column title_id to title;
alter table public.projects rename column description_id to description;
alter table public.certificates drop column title_en;
alter table public.certificates rename column title_id to title;
alter table public.profiles drop column description_en;
alter table public.profiles rename column description_id to description;

-- ============================================================
-- 0003_contacts.sql
-- ============================================================
create table public.contacts (
  id bigint generated always as identity primary key,
  email text not null check (char_length(email) between 5 and 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
create unique index contacts_email_unique on public.contacts (lower(email));
alter table public.contacts enable row level security;
create policy "visitor insert" on public.contacts for insert to anon, authenticated with check (char_length(email) <= 254);
create policy "admin read" on public.contacts for select to authenticated using (public.is_admin());
create policy "admin delete" on public.contacts for delete to authenticated using (public.is_admin());

-- ============================================================
-- 0004_contacts_message.sql
-- ============================================================
drop index if exists public.contacts_email_unique;
alter table public.contacts
  add column name text check (name is null or char_length(name) between 1 and 100),
  add column message text check (message is null or char_length(message) between 1 and 2000);
drop policy "visitor insert" on public.contacts;
create policy "visitor insert" on public.contacts for insert to anon, authenticated
  with check (char_length(email) <= 254 and char_length(btrim(name)) between 1 and 100 and char_length(btrim(message)) between 1 and 2000);

-- ============================================================
-- 0005_projects_link.sql
-- ============================================================
alter table public.projects
  add column link text check (link is null or (char_length(link) <= 500 and link ~* '^https?://[^\s]+$'));

-- ============================================================
-- 0006_position.sql
-- ============================================================
-- Urutan tampil yang bisa diatur lewat drag & drop di admin. NULL (item baru) tampil paling akhir.
alter table public.projects add column if not exists position integer;
alter table public.certificates add column if not exists position integer;
alter table public.skills add column if not exists position integer;

update public.projects t set position = r.rn from (select id, row_number() over (order by created_at) - 1 as rn from public.projects) r where t.id = r.id and t.position is null;
update public.certificates t set position = r.rn from (select id, row_number() over (order by created_at) - 1 as rn from public.certificates) r where t.id = r.id and t.position is null;
update public.skills t set position = r.rn from (select id, row_number() over (order by created_at) - 1 as rn from public.skills) r where t.id = r.id and t.position is null;

notify pgrst, 'reload schema';

-- ============================================================
-- 0007_cvs.sql
-- ============================================================
-- Daftar CV yang bisa dikelola dari admin (CRUD). Dibaca publik, ditulis admin.
create table public.cvs (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  url text not null check (char_length(url) <= 500 and url ~* '^https?://[^\s]+$'),
  position integer,
  created_at timestamptz not null default now()
);

alter table public.cvs enable row level security;
create policy "public read" on public.cvs for select using (true);
create policy "admin insert" on public.cvs for insert to authenticated with check (public.is_admin());
create policy "admin update" on public.cvs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete" on public.cvs for delete to authenticated using (public.is_admin());

-- Isi awal: dua CV yang sebelumnya tertulis langsung di index.html
insert into public.cvs (title, url, position) values
  ('CV 1', 'https://drive.google.com/file/d/1HyMIvMcw4_uj6OQhq07UCHq6OQ8mWucK/view?usp=sharing', 0),
  ('CV 2', 'https://drive.google.com/file/d/1lvKnlyrCaV9Z9c2t66lOKSiycp1HavRq/view', 1);

notify pgrst, 'reload schema';

