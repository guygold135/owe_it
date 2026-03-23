-- Filtered postgres_changes for UPDATE/DELETE on judge_requests require FULL replica identity
-- so the judge's realtime subscription (judge_user_id=eq.<id>) receives row changes when the
-- requester cancels or status otherwise updates.
ALTER TABLE public.judge_requests REPLICA IDENTITY FULL;
