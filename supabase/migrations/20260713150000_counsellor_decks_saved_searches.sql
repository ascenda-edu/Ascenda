-- Counsellor university decks + student saved searches.
--
-- Counsellors search the programme catalogue, collect programmes into themed
-- "decks" (video-game framing: decks of cards with a rarity per programme),
-- and assign a deck to one or more students. Assigning fires a student-audience
-- notification via a SECURITY DEFINER trigger (same pattern as the help-system
-- triggers in 20260702120000). Students also get a saved_searches table to
-- persist university-search filter state across devices.
--
-- Applied one-off via `npm run db:apply <file>` — must be idempotent and
-- self-contained (safe to apply alone and to re-apply).

-- ── 1. counsellor_decks — a themed collection of programmes ──────────────────

create table if not exists counsellor_decks (
  id uuid primary key default gen_random_uuid(),
  counsellor_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  -- Visual theme for the deck card: emoji badge + accent token, kept loose on
  -- purpose so the UI can evolve without migrations.
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists counsellor_decks_owner_idx
  on counsellor_decks (counsellor_id, created_at desc);

-- ── 2. counsellor_deck_programs — the cards in a deck ────────────────────────

create table if not exists counsellor_deck_programs (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references counsellor_decks(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  -- Rarity is the game-facing label; fit is the admissions-facing meaning.
  rarity text not null default 'rare'
    check (rarity in ('legendary', 'epic', 'rare', 'common')),
  fit text not null default 'match'
    check (fit in ('reach', 'match', 'safety')),
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (deck_id, program_id)
);

create index if not exists counsellor_deck_programs_deck_idx
  on counsellor_deck_programs (deck_id, position);

-- ── 3. deck_assignments — deck handed to a student ───────────────────────────

create table if not exists deck_assignments (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references counsellor_decks(id) on delete cascade,
  student_profile_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  message text,
  created_at timestamptz not null default now(),
  unique (deck_id, student_profile_id)
);

create index if not exists deck_assignments_student_idx
  on deck_assignments (student_profile_id, created_at desc);

-- ── 4. saved_searches — student-persisted university-search state ────────────

create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  query text not null default '',
  -- Array of { group, value } FilterChip objects (src/lib/university-search/search-params.ts).
  filters jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists saved_searches_owner_idx
  on saved_searches (profile_id, created_at desc);

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

alter table counsellor_decks enable row level security;
alter table counsellor_deck_programs enable row level security;
alter table deck_assignments enable row level security;
alter table saved_searches enable row level security;

-- Decks: anyone acting as a counsellor can read the deck library; only the
-- owner mutates their decks. Students may read decks assigned to them.
drop policy if exists counsellor_decks_select on counsellor_decks;
create policy counsellor_decks_select on counsellor_decks
  for select to authenticated
  using (
    (select public.can_act_as_counsellor())
    or exists (
      select 1 from deck_assignments da
      where da.deck_id = counsellor_decks.id
        and da.student_profile_id = (select auth.uid())
    )
  );

drop policy if exists counsellor_decks_insert on counsellor_decks;
create policy counsellor_decks_insert on counsellor_decks
  for insert to authenticated
  with check (
    (select public.can_act_as_counsellor())
    and counsellor_id = (select auth.uid())
  );

drop policy if exists counsellor_decks_update on counsellor_decks;
create policy counsellor_decks_update on counsellor_decks
  for update to authenticated
  using (counsellor_id = (select auth.uid()))
  with check (counsellor_id = (select auth.uid()));

drop policy if exists counsellor_decks_delete on counsellor_decks;
create policy counsellor_decks_delete on counsellor_decks
  for delete to authenticated
  using (counsellor_id = (select auth.uid()));

-- Deck cards: readable wherever the deck is readable; mutable by the deck owner.
drop policy if exists counsellor_deck_programs_select on counsellor_deck_programs;
create policy counsellor_deck_programs_select on counsellor_deck_programs
  for select to authenticated
  using (
    exists (
      select 1 from counsellor_decks d
      where d.id = counsellor_deck_programs.deck_id
        and (
          (select public.can_act_as_counsellor())
          or exists (
            select 1 from deck_assignments da
            where da.deck_id = d.id
              and da.student_profile_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists counsellor_deck_programs_write on counsellor_deck_programs;
create policy counsellor_deck_programs_write on counsellor_deck_programs
  for all to authenticated
  using (
    exists (
      select 1 from counsellor_decks d
      where d.id = counsellor_deck_programs.deck_id
        and d.counsellor_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from counsellor_decks d
      where d.id = counsellor_deck_programs.deck_id
        and d.counsellor_id = (select auth.uid())
    )
  );

-- Assignments: counsellors manage; students read their own.
drop policy if exists deck_assignments_select on deck_assignments;
create policy deck_assignments_select on deck_assignments
  for select to authenticated
  using (
    student_profile_id = (select auth.uid())
    or (select public.can_act_as_counsellor())
  );

drop policy if exists deck_assignments_write on deck_assignments;
create policy deck_assignments_write on deck_assignments
  for all to authenticated
  using (
    exists (
      select 1 from counsellor_decks d
      where d.id = deck_assignments.deck_id
        and d.counsellor_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from counsellor_decks d
      where d.id = deck_assignments.deck_id
        and d.counsellor_id = (select auth.uid())
    )
  );

-- Saved searches: strictly self-service.
drop policy if exists saved_searches_self on saved_searches;
create policy saved_searches_self on saved_searches
  for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ── 6. Assignment → student notification (server-side, like the help triggers) ─

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
    '/dashboard#counsellor-quests',
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
