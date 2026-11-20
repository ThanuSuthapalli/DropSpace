create table if not exists public.workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{"projects":[],"items":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

revoke all on public.workspaces from anon;
grant select, insert, update on public.workspaces to authenticated;

drop policy if exists "Users can read their own workspace" on public.workspaces;
create policy "Users can read their own workspace"
  on public.workspaces for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own workspace" on public.workspaces;
create policy "Users can create their own workspace"
  on public.workspaces for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own workspace" on public.workspaces;
create policy "Users can update their own workspace"
  on public.workspaces for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.workspace_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  device_name text not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.workspace_devices enable row level security;
revoke all on public.workspace_devices from public, anon;
grant select, insert, update, delete on public.workspace_devices to authenticated;

drop policy if exists "Users can manage their own devices" on public.workspace_devices;
create policy "Users can manage their own devices"
  on public.workspace_devices for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('dropspace-resources', 'dropspace-resources', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Users can upload their own resource files" on storage.objects;
create policy "Users can upload their own resource files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dropspace-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can read their own resource files" on storage.objects;
create policy "Users can read their own resource files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dropspace-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own resource files" on storage.objects;
create policy "Users can delete their own resource files"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dropspace-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own resource files" on storage.objects;
create policy "Users can update their own resource files"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dropspace-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'dropspace-resources'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
