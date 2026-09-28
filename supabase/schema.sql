create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'Untitled',
  content text not null default '',
  summary text not null default '',
  tags text[] not null default '{}',
  share_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on notes (user_id, updated_at desc);
alter table notes enable row level security;
create policy "own notes" on notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public read of ONE shared note by its secret link id (no login needed)
create function get_shared_note(sid text)
returns table (title text, content text, updated_at timestamptz)
language sql security definer set search_path = public as
$$ select title, content, updated_at from notes where sid is not null and share_id = sid $$;
grant execute on function get_shared_note(text) to anon, authenticated;
