-- When a student inserts a help_request, fan out a notification so the
-- navbar bell lights up.
--
-- For the May 18 demo the student and counsellor are the same Supabase
-- auth user, so we notify the student themselves — bell lights up after
-- the side switch. When a multi-user counsellor model is wired in, this
-- trigger should be amended to notify the assigned counsellor instead.

create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, kind, title, body, href)
  values (
    new.student_profile_id,
    'help_request',
    'New help request from Greg',
    coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
    '/counsellor?help=' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists trg_help_request_notify on help_requests;
create trigger trg_help_request_notify
  after insert on help_requests
  for each row
  execute function notify_on_help_request_insert();
