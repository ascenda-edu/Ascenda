// Thin typed wrappers around the help_requests and notifications tables.
// The generated Database type in src/lib/types/database.ts predates the
// 20260512120000 migration; until it's regenerated, we cast through `any`
// in one place rather than scattering casts across feature code.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HelpMeeting,
  HelpMeetingInsert,
  HelpMeetingStatus,
  HelpMessage,
  HelpMessageInsert,
  HelpNote,
  HelpNoteInsert,
  HelpRequest,
  HelpRequestInsert,
  HelpRequestStatus,
  Notification,
  NotificationAudience,
  NotificationInsert
} from '@/lib/types/demo-tables';

type AnyClient = SupabaseClient<any, any, any>;

const tbl = (supabase: AnyClient, name: string) => (supabase as any).from(name);

export const insertHelpRequest = async (supabase: AnyClient, row: HelpRequestInsert) => {
  const { data, error } = await tbl(supabase, 'help_requests').insert(row).select('id').single();
  if (error) throw error;
  return data as { id: string };
};

export const insertNotification = async (supabase: AnyClient, row: NotificationInsert) => {
  const { error } = await tbl(supabase, 'notifications').insert(row);
  if (error) throw error;
};

export const listOpenHelpRequests = async (supabase: AnyClient): Promise<HelpRequest[]> => {
  const { data, error } = await tbl(supabase, 'help_requests')
    .select('*')
    .in('status', ['open', 'accepted'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HelpRequest[];
};

// Inbox uses this — pulls every conversation the student is part of, including
// resolved ones. The student-side inbox doesn't filter by status; it shows the
// full history with read/unread state surfaced separately.
export const listInboxRequests = async (
  supabase: AnyClient,
  profileId: string
): Promise<HelpRequest[]> => {
  const { data, error } = await tbl(supabase, 'help_requests')
    .select('*')
    .eq('student_profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HelpRequest[];
};

export const updateHelpRequestStatus = async (
  supabase: AnyClient,
  id: string,
  status: HelpRequestStatus
) => {
  const patch: Record<string, unknown> = { status };
  if (status === 'accepted') patch.accepted_at = new Date().toISOString();
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();
  const { error } = await tbl(supabase, 'help_requests').update(patch).eq('id', id);
  if (error) throw error;
};

// Stamp the caller's side last-read time. Drives inbox unread badges + the
// "Seen" receipt in the thread — no notification-href parsing needed.
export const markThreadRead = async (
  supabase: AnyClient,
  id: string,
  side: 'student' | 'counsellor'
) => {
  const col = side === 'counsellor' ? 'counsellor_last_read_at' : 'student_last_read_at';
  const { error } = await tbl(supabase, 'help_requests')
    .update({ [col]: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
};

export const listNotifications = async (
  supabase: AnyClient,
  profileId: string,
  audience: NotificationAudience,
  limit = 20
): Promise<Notification[]> => {
  const { data, error } = await tbl(supabase, 'notifications')
    .select('*')
    .eq('profile_id', profileId)
    .eq('audience', audience)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Notification[];
};

export const markNotificationRead = async (supabase: AnyClient, id: string) => {
  const { error } = await tbl(supabase, 'notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
};

export const markAllNotificationsRead = async (
  supabase: AnyClient,
  profileId: string,
  audience: NotificationAudience
) => {
  const { error } = await tbl(supabase, 'notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .eq('audience', audience)
    .is('read_at', null);
  if (error) throw error;
};

export const getHelpRequest = async (
  supabase: AnyClient,
  id: string
): Promise<HelpRequest | null> => {
  const { data, error } = await tbl(supabase, 'help_requests').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as HelpRequest | null;
};

export const listHelpMessages = async (
  supabase: AnyClient,
  requestId: string
): Promise<HelpMessage[]> => {
  const { data, error } = await tbl(supabase, 'help_messages')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HelpMessage[];
};

export const insertHelpMessage = async (supabase: AnyClient, row: HelpMessageInsert) => {
  const { data, error } = await tbl(supabase, 'help_messages').insert(row).select('*').single();
  if (error) throw error;
  return data as HelpMessage;
};

// ── Names + grouped inbox ────────────────────────────────────────────────────

// Names are effectively static, but the inbox polls; cache resolved names across
// calls so a poll tick only queries ids we haven't seen. We cache ONLY real
// resolved names — never the fallback — so callers passing different fallbacks
// ('Student' vs '' vs a counsellor label) still get their own fallback applied
// to ids that resolve to nothing.
const resolvedNameCache = new Map<string, string>();

// Resolve display names for a set of profile ids. Prefers the richer
// student_personal_information first/last name, falls back to profiles.full_name,
// then a neutral label. Under the current open demo posture every signed-in user
// can read these rows; if can_act_as_counsellor() is later re-restricted, a plain
// student simply falls back to the neutral label (graceful degradation).
export const resolveProfileNames = async (
  supabase: AnyClient,
  ids: string[],
  fallback = 'Student'
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return map;

  // Serve anything we've already resolved; only query the rest.
  const missing = unique.filter((id) => !resolvedNameCache.has(id));
  if (missing.length > 0) {
    const [personalRes, profileRes] = await Promise.all([
      tbl(supabase, 'student_personal_information')
        .select('profile_id, first_name, last_name')
        .in('profile_id', missing),
      tbl(supabase, 'profiles').select('id, full_name').in('id', missing)
    ]);
    const fullById = new Map<string, string>();
    for (const p of (profileRes.data ?? []) as { id: string; full_name: string | null }[]) {
      const n = (p.full_name ?? '').trim();
      if (n) fullById.set(p.id, n);
    }
    const resolved = new Map<string, string>();
    for (const r of (personalRes.data ?? []) as {
      profile_id: string;
      first_name: string | null;
      last_name: string | null;
    }[]) {
      const n = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      if (n) resolved.set(r.profile_id, n);
    }
    for (const id of missing) {
      const name = resolved.get(id) ?? fullById.get(id);
      // Only real names go in the shared cache; unresolved ids stay uncached so
      // a later call with a different fallback (or after the name lands) re-tries.
      if (name) resolvedNameCache.set(id, name);
    }
  }

  for (const id of unique) {
    map.set(id, resolvedNameCache.get(id) ?? fallback);
  }
  return map;
};

export interface CounsellorInboxItem {
  request: HelpRequest;
  studentName: string;
  lastMessageBody: string;
  lastMessageAt: string; // request.created_at when there are no replies yet
  lastMessageFromCounsellor: boolean;
  unreadCount: number; // student messages (incl. the opening request) unseen by the counsellor
}

type InboxMessage = Pick<HelpMessage, 'request_id' | 'author_role' | 'body' | 'created_at'>;

// The counsellor inbox: every conversation the caller can see (RLS scopes it;
// open demo returns all), grouped with the student's real name, a last-message
// preview and an unread count derived from counsellor_last_read_at.
export const loadCounsellorInbox = async (
  supabase: AnyClient
): Promise<CounsellorInboxItem[]> => {
  // Most recent 100 threads (by created_at). PostgREST silently caps result sets
  // at 1000 rows, so we bound both queries deliberately rather than relying on
  // that cap: cap the thread list here, then fetch messages only for these ids.
  const { data: reqData, error } = await tbl(supabase, 'help_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const requests = (reqData ?? []) as HelpRequest[];
  if (requests.length === 0) return [];

  const requestIds = requests.map((r) => r.id);

  // Replies for these threads. Ordered DESCENDING + capped at 1000 so that if we
  // ever hit the cap it drops the OLDEST messages, not the newest (which drive
  // the preview + unread count). We reverse to ascending below where the grouping
  // logic assumes chronological order. If volume routinely nears the cap this
  // should move to a per-thread "latest message" view + a count RPC.
  const { data: msgData, error: msgErr } = await tbl(supabase, 'help_messages')
    .select('request_id, author_role, body, created_at')
    .in('request_id', requestIds)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (msgErr) throw msgErr;
  const messages = ((msgData ?? []) as InboxMessage[]).reverse();

  const byRequest = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const arr = byRequest.get(m.request_id) ?? [];
    arr.push(m);
    byRequest.set(m.request_id, arr);
  }

  const names = await resolveProfileNames(
    supabase,
    requests.map((r) => r.student_profile_id)
  );

  const items = requests.map((request): CounsellorInboxItem => {
    const msgs = byRequest.get(request.id) ?? [];
    const last = msgs.length ? msgs[msgs.length - 1] : null;
    const readAt = request.counsellor_last_read_at
      ? new Date(request.counsellor_last_read_at).getTime()
      : 0;
    let unreadCount = msgs.filter(
      (m) => m.author_role === 'student' && new Date(m.created_at).getTime() > readAt
    ).length;
    // A brand-new student-raised request has no help_messages row yet — its
    // opening body counts as the first unread message for the counsellor.
    if (request.initiated_by === 'student' && new Date(request.created_at).getTime() > readAt) {
      unreadCount += 1;
    }
    return {
      request,
      studentName: names.get(request.student_profile_id) ?? 'Student',
      lastMessageBody: last?.body ?? request.body,
      lastMessageAt: last?.created_at ?? request.created_at,
      lastMessageFromCounsellor: last
        ? last.author_role === 'counsellor'
        : request.initiated_by === 'counsellor',
      unreadCount
    };
  });

  // Order by real activity, not request creation: a thread with a fresh reply
  // should surface above an older thread that's gone quiet.
  items.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return items;
};

// Returns request_id -> unread count for the STUDENT inbox, derived from
// student_last_read_at (the same source of truth as the "Seen" receipt and the
// counsellor's own unread count) rather than parsing notification hrefs. Mirrors
// loadCounsellorInbox's unread logic with the sides flipped: counsellor-authored
// messages newer than student_last_read_at, plus the opening body when the thread
// was initiated_by a counsellor and predates the read stamp. Using the read stamp
// keeps the badge consistent with the receipt — a reply that arrives while the
// student has the drawer open advances the stamp and stays read on both sides.
export const countUnreadForStudent = async (
  supabase: AnyClient,
  profileId: string
): Promise<Map<string, number>> => {
  const { data: reqData, error } = await tbl(supabase, 'help_requests')
    .select('id, initiated_by, created_at, student_last_read_at')
    .eq('student_profile_id', profileId);
  if (error) throw error;
  type Row = Pick<HelpRequest, 'id' | 'initiated_by' | 'created_at' | 'student_last_read_at'>;
  const requests = (reqData ?? []) as Row[];
  const map = new Map<string, number>();
  if (requests.length === 0) return map;

  const requestIds = requests.map((r) => r.id);
  // Descending + capped so the cap drops oldest, not newest (see loadCounsellorInbox).
  const { data: msgData, error: msgErr } = await tbl(supabase, 'help_messages')
    .select('request_id, author_role, created_at')
    .in('request_id', requestIds)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (msgErr) throw msgErr;
  // Unread counting only needs author_role + created_at (grouped by request_id);
  // the message body is never read here, so it's omitted from the select.
  type UnreadRow = Pick<HelpMessage, 'request_id' | 'author_role' | 'created_at'>;
  const messages = (msgData ?? []) as UnreadRow[];

  const byRequest = new Map<string, UnreadRow[]>();
  for (const m of messages) {
    const arr = byRequest.get(m.request_id) ?? [];
    arr.push(m);
    byRequest.set(m.request_id, arr);
  }

  for (const request of requests) {
    const readAt = request.student_last_read_at
      ? new Date(request.student_last_read_at).getTime()
      : 0;
    let unread = (byRequest.get(request.id) ?? []).filter(
      (m) => m.author_role === 'counsellor' && new Date(m.created_at).getTime() > readAt
    ).length;
    // A counsellor-initiated request's opening body is the first unread message
    // for the student (no help_messages row backs it).
    if (request.initiated_by === 'counsellor' && new Date(request.created_at).getTime() > readAt) {
      unread += 1;
    }
    if (unread > 0) map.set(request.id, unread);
  }
  return map;
};

export const listHelpNotes = async (
  supabase: AnyClient,
  requestId: string
): Promise<HelpNote[]> => {
  const { data, error } = await tbl(supabase, 'help_notes')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as HelpNote[];
};

export const insertHelpNote = async (supabase: AnyClient, row: HelpNoteInsert) => {
  const { data, error } = await tbl(supabase, 'help_notes').insert(row).select('*').single();
  if (error) throw error;
  return data as HelpNote;
};

export const listHelpMeetings = async (
  supabase: AnyClient,
  requestId: string
): Promise<HelpMeeting[]> => {
  const { data, error } = await tbl(supabase, 'help_meetings')
    .select('*')
    .eq('request_id', requestId)
    .order('scheduled_for', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HelpMeeting[];
};

export const insertHelpMeeting = async (supabase: AnyClient, row: HelpMeetingInsert) => {
  const { data, error } = await tbl(supabase, 'help_meetings').insert(row).select('*').single();
  if (error) throw error;
  return data as HelpMeeting;
};

export const updateHelpMeetingStatus = async (
  supabase: AnyClient,
  id: string,
  status: HelpMeetingStatus,
  actor: 'student' | 'counsellor'
) => {
  // status_changed_by drives the trg_help_meeting_status_notify fan-out —
  // auth.uid() can't tell which side of the single-account demo acted.
  const { error } = await tbl(supabase, 'help_meetings')
    .update({ status, status_changed_by: actor })
    .eq('id', id);
  if (error) throw error;
};
