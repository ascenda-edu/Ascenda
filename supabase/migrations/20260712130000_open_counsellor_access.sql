-- Open the counsellor side to every signed-in user.
--
-- can_act_as_counsellor() previously required profiles.role in
-- ('counsellor','admin') or the single demo account (greg@workiflow.com).
-- Every RLS policy on the help/counsellor tables (help_requests, help_messages,
-- help_notes, help_meetings, notifications, counsellor_notes, parent_*,
-- student_documents, and the counsellor read policies on the student_* tables)
-- routes through this one function, so redefining it opens the whole
-- counsellor surface at once.
--
-- To re-restrict later, restore the body to:
--   select public.is_counsellor() or public.is_demo_account();
-- (both functions are left in place, unchanged).

create or replace function public.can_act_as_counsellor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

grant execute on function public.can_act_as_counsellor() to authenticated;
