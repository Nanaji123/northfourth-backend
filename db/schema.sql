-- 0. Clean up existing objects so we can re-run this script safely
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.users cascade;

-- 1. Create a table for public user profiles
create table public.users (
  id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  bio text,
  role text,
  goals text,
  github_url text,
  linkedin_url text,
  is_online boolean default false,
  last_active_at timestamp with time zone default timezone('utc'::text, now()),
  
  -- Location & Push
  latitude float8,
  longitude float8,
  push_token text,
  
  -- Settings & Preferences
  is_private boolean default false,
  onboarding_completed boolean default false,
  is_verified boolean default false,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  primary key (id)
);

-- 2. Set up Row Level Security (RLS)
-- Enable RLS on the users table
alter table public.users enable row level security;

-- Policy: Anyone can view public user profiles
create policy "Public profiles are viewable by everyone."
  on public.users for select
  using ( true );

-- Policy: Users can insert their own profile (handled mostly by our trigger below)
create policy "Users can insert their own profile."
  on public.users for insert
  with check ( auth.uid() = id );

-- Policy: Users can update their own profile
create policy "Users can update own profile."
  on public.users for update
  using ( auth.uid() = id );

-- 3. Create a Postgres Function to automatically handle new signups
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, bio, role, goals, github_url, linkedin_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'bio',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'goals',
    new.raw_user_meta_data->>'github_url',
    new.raw_user_meta_data->>'linkedin_url'
  );
  return new;
end;
$$;

-- 4. Create a Postgres Trigger that calls the function whenever a user signs up
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
