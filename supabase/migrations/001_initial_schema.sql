-- Enable PostGIS extension for Location Tracking
create extension if not exists postgis schema extensions;

-- ==========================================
-- 1. PROFILES TABLE
-- ==========================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade not null primary key,
  full_name text,
  role text,
  bio text,
  avatar_url text,
  location geometry(Point, 4326),
  skills text[],
  github_url text,
  linkedin_url text,
  goals text,
  company_name text,
  years_of_experience integer,
  availability_status text,
  timezone text,
  portfolio_url text,
  fcm_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS for profiles
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

-- ==========================================
-- 2. POSTS & COMMENTS & LIKES
-- ==========================================
create table if not exists public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  media_urls text[],
  tags text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.posts enable row level security;
create policy "Posts are viewable by everyone." on public.posts for select using (true);
create policy "Users can create posts." on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update own posts." on public.posts for update using (auth.uid() = user_id);
create policy "Users can delete own posts." on public.posts for delete using (auth.uid() = user_id);

create table if not exists public.post_likes (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (post_id, user_id)
);

alter table public.post_likes enable row level security;
create policy "Post likes are viewable by everyone." on public.post_likes for select using (true);
create policy "Users can like posts." on public.post_likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike posts." on public.post_likes for delete using (auth.uid() = user_id);

create table if not exists public.post_comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.post_comments enable row level security;
create policy "Post comments are viewable by everyone." on public.post_comments for select using (true);
create policy "Users can comment on posts." on public.post_comments for insert with check (auth.uid() = user_id);
create policy "Users can delete own comments." on public.post_comments for delete using (auth.uid() = user_id);

-- ==========================================
-- 3. CONNECTIONS (Friend Requests)
-- ==========================================
create table if not exists public.connections (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'rejected')) default 'pending' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(sender_id, receiver_id)
);

alter table public.connections enable row level security;
create policy "Users can see connections they are part of." on public.connections for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users can send connection requests." on public.connections for insert with check (auth.uid() = sender_id);
create policy "Users can update their connection requests." on public.connections for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- ==========================================
-- 4. CONVERSATIONS & MESSAGES
-- ==========================================
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  participant1_id uuid references public.profiles(id) on delete cascade not null,
  participant2_id uuid references public.profiles(id) on delete cascade not null,
  last_message_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(participant1_id, participant2_id)
);

alter table public.conversations enable row level security;
create policy "Users can see conversations they are part of." on public.conversations for select using (auth.uid() = participant1_id or auth.uid() = participant2_id);
create policy "Users can create conversations." on public.conversations for insert with check (auth.uid() = participant1_id or auth.uid() = participant2_id);
create policy "Users can update conversations." on public.conversations for update using (auth.uid() = participant1_id or auth.uid() = participant2_id);

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.messages enable row level security;
-- This policy is simplified; in production you'd join with conversations to ensure the user is a participant.
create policy "Users can see messages in their conversations." on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = messages.conversation_id and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid()))
);
create policy "Users can send messages." on public.messages for insert with check (auth.uid() = sender_id);
create policy "Users can mark messages as read." on public.messages for update using (
  exists (select 1 from public.conversations c where c.id = messages.conversation_id and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid()))
);

-- ==========================================
-- 5. NOTIFICATIONS
-- ==========================================
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  actor_id uuid references public.profiles(id) on delete cascade not null,
  type text check (type in ('like', 'comment', 'connection_request', 'connection_accepted', 'message')) not null,
  reference_id uuid not null,
  is_read boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.notifications enable row level security;
create policy "Users can see their own notifications." on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update their own notifications (read)." on public.notifications for update using (auth.uid() = user_id);
-- Insert notifications via triggers or backend functions, so we don't necessarily need an insert policy for users, but if doing client-side:
create policy "Users can trigger notifications." on public.notifications for insert with check (auth.uid() = actor_id);

-- ==========================================
-- 6. RPC FUNCTIONS
-- ==========================================

-- RPC: Update User Location Safely
create or replace function public.update_user_location(lat double precision, lng double precision)
returns void as $$
begin
  update public.profiles
  set location = st_setsrid(st_makepoint(lng, lat), 4326),
      updated_at = now()
  where id = auth.uid();
end;
$$ language plpgsql security definer;

-- RPC: Get Nearby Users (within X meters)
-- Excludes the requesting user and users they are already connected with
create or replace function public.get_nearby_users(lat double precision, lng double precision, radius_meters double precision)
returns table (
  id uuid,
  full_name text,
  role text,
  avatar_url text,
  bio text,
  skills text[],
  distance_meters double precision
) as $$
begin
  return query
  select 
    p.id, p.full_name, p.role, p.avatar_url, p.bio, p.skills,
    st_distance(p.location::geography, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_meters
  from public.profiles p
  where 
    p.id != auth.uid()
    and p.location is not null
    and st_dwithin(p.location::geography, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_meters)
    and not exists (
      select 1 from public.connections c 
      where (c.sender_id = auth.uid() and c.receiver_id = p.id) 
         or (c.sender_id = p.id and c.receiver_id = auth.uid())
    )
  order by distance_meters asc;
end;
$$ language plpgsql security definer;
