-- 20260718130000_realtime_publication_and_doc_nudge_limits.sql
--
-- Two hardening fixes from the 2026-07-18 efficiency/security audit:
--
-- 1) chat_conversations was never added to the supabase_realtime publication
--    (20260718120000 created the table without it), so the assistant
--    workspace's channel can never reach SUBSCRIBED and the client fell back
--    to permanent fast-polling. The other live tables are re-asserted
--    idempotently in case the remote publication drifted.
-- 2) notifications_insert (narrowed to doc_nudge in 20260715120000) still
--    allowed arbitrary title/body text into any user's feed. The app only
--    ever sends the two "Your counsellor is …" templates
--    (counsellor-document-board.tsx), so pin the title prefix and cap
--    lengths. Real fix post-demo: move nudges behind an API route and drop
--    the client-authored cross-user branch entirely.
--
-- Idempotent: safe to re-run.

-- 1) Realtime publication membership for every table the client subscribes to.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'notifications', 'help_requests', 'help_messages', 'help_notes',
      'help_meetings', 'chat_conversations'
    ]
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  else
    raise exception 'supabase_realtime publication not found — check that Realtime is enabled for the project';
  end if;
end $$;

-- 2) Constrain the client-authored doc_nudge to its legitimate template shape.
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated
  -- Users may notify themselves. The counsellor-capable branch (open to all
  -- signed-in users under the demo posture) is restricted to the one
  -- client-authored cross-user kind ('doc_nudge'), root-relative hrefs, the
  -- app's actual title template, and bounded lengths — so it can no longer
  -- carry arbitrary text into other feeds. All other cross-user
  -- notifications flow through SECURITY DEFINER triggers, which this policy
  -- does not constrain.
  with check (
    profile_id = auth.uid()
    or (
      public.can_act_as_counsellor()
      and kind = 'doc_nudge'
      and (href is null or (href like '/%' and href not like '//%'))
      and title like 'Your counsellor is %'
      and char_length(title) <= 160
      and (body is null or char_length(body) <= 300)
    )
  );

-- Verification guard: abort (and roll back) if anything is missing.
do $$
declare t text;
begin
  foreach t in array array[
    'notifications', 'help_requests', 'help_messages', 'help_notes',
    'help_meetings', 'chat_conversations'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      raise exception 'verification failed: % missing from supabase_realtime publication', t;
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert'
      and with_check like '%Your counsellor is %'
  ) then
    raise exception 'verification failed: notifications_insert not template-constrained';
  end if;
end $$;
