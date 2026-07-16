// Hand-typed shapes for tables added in 20260512120000_help_requests_and_notifications.sql.
// Kept separate from the generated database.ts; if/when the schema dump is regenerated,
// these can be folded back into the main Database type.

export type HelpRequestStatus = 'open' | 'accepted' | 'resolved';
export type HelpRequestInitiator = 'student' | 'counsellor';

export interface HelpRequest {
  id: string;
  student_profile_id: string;
  counsellor_profile_id: string | null;
  application_id: string | null;
  university: string | null;
  program: string | null;
  subject: string;
  body: string;
  status: HelpRequestStatus;
  initiated_by: HelpRequestInitiator;
  student_last_read_at: string | null;
  counsellor_last_read_at: string | null;
  created_at: string;
  accepted_at: string | null;
  resolved_at: string | null;
}

export type HelpRequestInsert = Pick<
  HelpRequest,
  'student_profile_id' | 'subject' | 'body'
> &
  Partial<
    Pick<
      HelpRequest,
      'counsellor_profile_id' | 'application_id' | 'university' | 'program' | 'status' | 'initiated_by'
    >
  >;

export type NotificationAudience = 'student' | 'counsellor';

export interface Notification {
  id: string;
  profile_id: string;
  audience: NotificationAudience;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export type NotificationInsert = Pick<
  Notification,
  'profile_id' | 'kind' | 'title'
> &
  Partial<Pick<Notification, 'audience' | 'body' | 'href'>>;

export type HelpMessageAuthorRole = 'student' | 'counsellor';

export interface HelpMessage {
  id: string;
  request_id: string;
  author_profile_id: string;
  author_role: HelpMessageAuthorRole;
  body: string;
  created_at: string;
}

export type HelpMessageInsert = Pick<HelpMessage, 'request_id' | 'author_profile_id' | 'author_role' | 'body'>;

export interface HelpNote {
  id: string;
  request_id: string;
  author_profile_id: string;
  body: string;
  created_at: string;
}

export type HelpNoteInsert = Pick<HelpNote, 'request_id' | 'author_profile_id' | 'body'>;

export type HelpMeetingStatus = 'proposed' | 'confirmed' | 'cancelled' | 'completed';

export interface HelpMeeting {
  id: string;
  request_id: string;
  counsellor_profile_id: string;
  student_profile_id: string;
  title: string;
  scheduled_for: string;
  duration_minutes: number;
  location: string | null;
  status: HelpMeetingStatus;
  status_changed_by: 'student' | 'counsellor' | null;
  created_at: string;
}

export type HelpMeetingInsert = Pick<
  HelpMeeting,
  'request_id' | 'counsellor_profile_id' | 'student_profile_id' | 'title' | 'scheduled_for'
> &
  Partial<Pick<HelpMeeting, 'duration_minutes' | 'location' | 'status'>>;

// ── Tables added in 20260628120000_counsellor_real_data.sql ──────────────────

// New columns on the existing `applications` table (database.ts lags these).
export type ApplicationDecision = 'accepted' | 'rejected' | 'waitlisted' | 'withdrawn';

export interface ApplicationOutcomeColumns {
  platform: string | null;
  decision: ApplicationDecision | null; // null = pending
  decision_at: string | null;
  decision_conditions: string | null;
}

export type CounsellorNoteType = 'session' | 'flag' | 'update';

export interface CounsellorNoteRow {
  id: string;
  student_profile_id: string;
  author_profile_id: string;
  body: string;
  note_type: CounsellorNoteType;
  created_at: string;
}

export type CounsellorNoteInsert = Pick<
  CounsellorNoteRow,
  'student_profile_id' | 'author_profile_id' | 'body'
> &
  Partial<Pick<CounsellorNoteRow, 'note_type'>>;

export type ParentContactStatus = 'active' | 'needs-response' | 'resolved';

export interface ParentContactRow {
  id: string;
  student_profile_id: string;
  parent_name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  status: ParentContactStatus;
  last_contacted: string | null;
  created_at: string;
}

export type ParentMessageSender = 'counsellor' | 'parent';

export interface ParentMessageRow {
  id: string;
  contact_id: string;
  sender: ParentMessageSender;
  body: string;
  template: string | null;
  read_at: string | null;
  created_at: string;
}

export type ParentMessageInsert = Pick<ParentMessageRow, 'contact_id' | 'sender' | 'body'> &
  Partial<Pick<ParentMessageRow, 'template' | 'read_at'>>;

export type StudentDocumentType = 'transcript' | 'recommendation' | 'essay' | 'certificate' | 'other';
export type StudentDocumentStatus = 'received' | 'pending' | 'overdue';

export interface StudentDocumentRow {
  id: string;
  student_profile_id: string;
  document_name: string;
  doc_type: StudentDocumentType;
  status: StudentDocumentStatus;
  uploaded_at: string | null;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

// ── Table added in 20260716120000_guardian_links.sql ─────────────────────────

export type GuardianLinkStatus = 'pending' | 'active' | 'revoked';

export interface GuardianLinkRow {
  id: string;
  parent_profile_id: string;
  student_profile_id: string;
  relationship: string;
  status: GuardianLinkStatus;
  created_at: string;
}

// Links are written only by migration/service role (select-only RLS) — no
// Insert type on purpose; browser sessions never insert guardian_links.

// ── Tables added in 20260713150000_counsellor_decks_saved_searches.sql ────────

export type DeckCardRarity = 'legendary' | 'epic' | 'rare' | 'common';
export type DeckCardFit = 'reach' | 'match' | 'safety';

export interface DeckTheme {
  emoji?: string;
  accent?: string;
}

export interface CounsellorDeckRow {
  id: string;
  counsellor_id: string;
  name: string;
  description: string | null;
  theme: DeckTheme;
  created_at: string;
  updated_at: string;
}

export type CounsellorDeckInsert = Pick<CounsellorDeckRow, 'counsellor_id' | 'name'> &
  Partial<Pick<CounsellorDeckRow, 'description' | 'theme'>>;

export interface DeckProgramRow {
  id: string;
  deck_id: string;
  program_id: string;
  rarity: DeckCardRarity;
  fit: DeckCardFit;
  note: string | null;
  position: number;
  created_at: string;
}

export type DeckProgramInsert = Pick<DeckProgramRow, 'deck_id' | 'program_id'> &
  Partial<Pick<DeckProgramRow, 'rarity' | 'fit' | 'note' | 'position'>>;

export interface DeckAssignmentRow {
  id: string;
  deck_id: string;
  student_profile_id: string;
  assigned_by: string | null;
  message: string | null;
  created_at: string;
}

export type DeckAssignmentInsert = Pick<DeckAssignmentRow, 'deck_id' | 'student_profile_id'> &
  Partial<Pick<DeckAssignmentRow, 'assigned_by' | 'message'>>;

export interface SavedSearchRow {
  id: string;
  profile_id: string;
  name: string;
  query: string;
  // FilterChip[] from src/lib/university-search/search-params.ts
  filters: { group: string; value: string }[];
  created_at: string;
  last_used_at: string | null;
}

export type SavedSearchInsert = Pick<SavedSearchRow, 'profile_id' | 'name'> &
  Partial<Pick<SavedSearchRow, 'query' | 'filters'>>;

// ── chat_feedback (migration 20260717120000) ────────────────────────────────

export interface ChatFeedbackRow {
  id: string;
  profile_id: string;
  mode: 'student' | 'counsellor' | 'parent';
  message_hash: string;
  message_excerpt: string | null;
  rating: 1 | -1;
  comment: string | null;
  created_at: string;
}

export type ChatFeedbackUpsert = Pick<
  ChatFeedbackRow,
  'profile_id' | 'mode' | 'message_hash' | 'rating'
> &
  Partial<Pick<ChatFeedbackRow, 'message_excerpt' | 'comment'>>;

// ── chat_conversations / chat_messages (migration 20260718120000) ────────────
// DB-backed history for the full-page Assistant. `action` is the ChatAction
// union from lib/chat/actions (plus an optional sentHelpRequestId stamped on
// successful send); `tool_results` is ProgramHit[] from lib/chat/tools.

export interface ChatConversationRow {
  id: string;
  owner_id: string;
  mode: 'student' | 'counsellor' | 'parent';
  title: string | null;
  pinned: boolean;
  last_message_at: string;
  created_at: string;
}

export type ChatConversationInsert = Pick<ChatConversationRow, 'owner_id' | 'mode'> &
  Partial<Pick<ChatConversationRow, 'title' | 'pinned'>>;

export type ChatMessageActionState = 'pending' | 'sent' | 'cancelled';

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  // ChatAction (lib/chat/actions), optionally with sentHelpRequestId
  action: Record<string, unknown> | null;
  action_state: ChatMessageActionState | null;
  // ProgramHit[] (lib/chat/tools)
  tool_results: Record<string, unknown>[] | null;
  rating: 1 | -1 | null;
  created_at: string;
}

export type ChatMessageInsert = Pick<ChatMessageRow, 'conversation_id' | 'role' | 'content'> &
  Partial<Pick<ChatMessageRow, 'action' | 'action_state' | 'tool_results'>>;
