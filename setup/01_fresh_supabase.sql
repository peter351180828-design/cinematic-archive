-- 仅当你以后新建一个全新的 Supabase 项目时才需要运行。
-- 现在你已经有可用的旧测试站 Supabase，可直接复用，不要重复运行。

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '未命名',
  project text not null default '未分类',
  note text not null default '',
  storage_path text not null unique,
  original_name text,
  mime_type text default 'image/jpeg',
  bytes bigint,
  uploaded_at timestamptz not null default now(),
  date_taken timestamptz,
  make text, model text, camera text, lens text,
  focal_length numeric, focal_length_35mm numeric,
  aperture numeric, exposure_time numeric, iso integer,
  exposure_compensation numeric,
  width integer, height integer, orientation integer,
  is_featured boolean not null default false,
  sort_order integer not null default 0
);
create index if not exists photos_project_idx on public.photos(project);
create index if not exists photos_date_taken_idx on public.photos(date_taken desc nulls last);
create index if not exists photos_uploaded_at_idx on public.photos(uploaded_at desc);
alter table public.photos enable row level security;
revoke all on table public.photos from anon, authenticated;
grant select on table public.photos to anon;
grant select, insert, update, delete on table public.photos to authenticated;

drop policy if exists "public can read photos" on public.photos;
drop policy if exists "authenticated can insert own photos" on public.photos;
drop policy if exists "owner can update own photos" on public.photos;
drop policy if exists "owner can delete own photos" on public.photos;
create policy "public can read photos" on public.photos for select to anon, authenticated using (true);
create policy "authenticated can insert own photos" on public.photos for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner can update own photos" on public.photos for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner can delete own photos" on public.photos for delete to authenticated using (owner_id = (select auth.uid()));

-- 在 Storage 页面手动创建 Public bucket，名字严格为 photos。
-- 这套策略专门避免之前遇到的“new row violates row-level security policy”。
drop policy if exists "authenticated can view photo objects" on storage.objects;
drop policy if exists "authenticated can upload photo objects" on storage.objects;
drop policy if exists "authenticated can update photo objects" on storage.objects;
drop policy if exists "authenticated can delete photo objects" on storage.objects;
drop policy if exists "owner can update photo objects" on storage.objects;
drop policy if exists "owner can delete photo objects" on storage.objects;
create policy "authenticated can view photo objects" on storage.objects for select to authenticated using (bucket_id = 'photos');
create policy "authenticated can upload photo objects" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "authenticated can update photo objects" on storage.objects for update to authenticated using (bucket_id = 'photos') with check (bucket_id = 'photos');
create policy "authenticated can delete photo objects" on storage.objects for delete to authenticated using (bucket_id = 'photos');
