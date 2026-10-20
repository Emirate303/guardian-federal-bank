-- Fix: PostgREST `.upsert()` performs an INSERT ... ON CONFLICT DO UPDATE
-- that writes BOTH user_id and preferences on the update branch.
-- The original grant only covered `update (preferences)`, so any upsert that
-- hit an existing row failed with "permission denied for table user_settings".
-- This grants the missing column without loosening RLS (users can still only
-- touch rows where auth.uid() = user_id).

grant update (user_id, preferences) on public.user_settings to authenticated;
