-- Run this in Supabase SQL Editor to add location support to the profiles table
-- and create the get_nearby_users RPC function

-- 1. Add location columns to profiles (if not already there)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS latitude FLOAT8,
  ADD COLUMN IF NOT EXISTS longitude FLOAT8,
  ADD COLUMN IF NOT EXISTS last_location_updated_at TIMESTAMPTZ;

-- 2. Update handle_new_user trigger to also save location fields to profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Insert into public.users (legacy table)
  INSERT INTO public.users (id, email, full_name, avatar_url, bio, role, goals, github_url, linkedin_url)
  VALUES (
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

  -- Insert into public.profiles
  INSERT INTO public.profiles (
    id, full_name, role, bio, avatar_url,
    skills, github_url, linkedin_url, goals,
    company_name, years_of_experience, availability_status,
    timezone, portfolio_url
  )
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'bio',
    new.raw_user_meta_data->>'avatar_url',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(new.raw_user_meta_data->'skills', '[]'::jsonb))),
    new.raw_user_meta_data->>'github_url',
    new.raw_user_meta_data->>'linkedin_url',
    new.raw_user_meta_data->>'goals',
    new.raw_user_meta_data->>'company_name',
    NULLIF(new.raw_user_meta_data->>'years_of_experience', '')::integer,
    new.raw_user_meta_data->>'availability_status',
    new.raw_user_meta_data->>'timezone',
    new.raw_user_meta_data->>'portfolio_url'
  );

  RETURN new;
END;
$$;

-- 3. Create the get_nearby_users RPC function using Haversine formula
-- Finds all users within radius_meters of the given lat/lng
DROP FUNCTION IF EXISTS public.get_nearby_users(FLOAT8, FLOAT8, FLOAT8);
DROP FUNCTION IF EXISTS public.get_nearby_users(UUID, FLOAT8, FLOAT8, FLOAT8);
CREATE OR REPLACE FUNCTION public.get_nearby_users(
  viewer_id UUID,
  lat FLOAT8,
  lng FLOAT8,
  radius_meters FLOAT8 DEFAULT 50000
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT,
  bio TEXT,
  avatar_url TEXT,
  skills TEXT[],
  github_url TEXT,
  linkedin_url TEXT,
  latitude FLOAT8,
  longitude FLOAT8,
  distance_meters FLOAT8
)
LANGUAGE sql STABLE
SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.full_name,
    p.role,
    p.bio,
    p.avatar_url,
    p.skills,
    p.github_url,
    p.linkedin_url,
    p.latitude,
    p.longitude,
    -- Haversine formula for distance in meters
    (2 * 6371000 * asin(
      sqrt(
        power(sin((radians(p.latitude) - radians(lat)) / 2), 2) +
        cos(radians(lat)) * cos(radians(p.latitude)) *
        power(sin((radians(p.longitude) - radians(lng)) / 2), 2)
      )
    )) AS distance_meters
  FROM public.profiles p
  WHERE
    p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.id != viewer_id
    -- Bounding box pre-filter for performance (1 degree ≈ 111km)
    AND p.latitude BETWEEN (lat - radius_meters/111000.0) AND (lat + radius_meters/111000.0)
    AND p.longitude BETWEEN (lng - radius_meters/111000.0) AND (lng + radius_meters/111000.0)
    -- Haversine filter
    AND (2 * 6371000 * asin(
      sqrt(
        power(sin((radians(p.latitude) - radians(lat)) / 2), 2) +
        cos(radians(lat)) * cos(radians(p.latitude)) *
        power(sin((radians(p.longitude) - radians(lng)) / 2), 2)
      )
    )) <= radius_meters
  ORDER BY distance_meters ASC
  LIMIT 50;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_nearby_users(UUID, FLOAT8, FLOAT8, FLOAT8) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_nearby_users(UUID, FLOAT8, FLOAT8, FLOAT8) TO anon;
