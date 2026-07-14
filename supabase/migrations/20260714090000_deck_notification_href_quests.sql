-- Point the deck-assignment notification at the student Quests tab.
--
-- The trigger from 20260713150000 deep-linked to /dashboard#counsellor-quests
-- (the dashboard widget was the only student surface then). Students now have
-- a full quest log at /university-search/quests — send them there instead.
--
-- Applied one-off via `npm run db:apply <file>` — idempotent and self-contained.

create or replace function public.notify_on_deck_assignment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_name text;
  card_count integer;
begin
  select d.name into deck_name from counsellor_decks d where d.id = new.deck_id;
  select count(*) into card_count
    from counsellor_deck_programs p where p.deck_id = new.deck_id;

  insert into notifications (profile_id, kind, title, body, href, audience)
  values (
    new.student_profile_id,
    'deck_assignment',
    'New quest from your counsellor',
    coalesce(deck_name, 'A university deck')
      || ' · ' || card_count || ' universit' || case when card_count = 1 then 'y' else 'ies' end
      || coalesce(' — ' || nullif(trim(new.message), ''), ''),
    '/university-search/quests',
    'student'
  );
  return new;
end;
$$;

drop trigger if exists trg_deck_assignment_notify on deck_assignments;
create trigger trg_deck_assignment_notify
  after insert on deck_assignments
  for each row
  execute function public.notify_on_deck_assignment_insert();
