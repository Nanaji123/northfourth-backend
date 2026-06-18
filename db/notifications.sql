-- Notifications table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

-- Fix legacy schema conflicts from 001_initial_schema.sql
DO $$ 
BEGIN
  ALTER TABLE public.notifications ALTER COLUMN reference_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN 
    -- Ignore if reference_id doesn't exist
END $$;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ─── Trigger: Notify on post like ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner UUID;
BEGIN
  -- Get the post owner
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  
  -- Don't notify if liking own post
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_liked ON public.post_likes;
CREATE TRIGGER on_post_liked
  AFTER INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

-- ─── Trigger: Notify on comment ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  
  IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_post_commented ON public.post_comments;
CREATE TRIGGER on_post_commented
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- ─── Trigger: Notify on connection request ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_connection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    -- Notify receiver of new request
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.receiver_id, NEW.sender_id, 'connect');
  ELSIF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- Notify sender that their request was accepted
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES (NEW.sender_id, NEW.receiver_id, 'accept');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_connection_changed ON public.connections;
CREATE TRIGGER on_connection_changed
  AFTER INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_connection();
