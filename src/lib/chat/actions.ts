// In-chat actions the model can PROPOSE (never execute). An action function
// call is intercepted by the route, converted to a payload here, and emitted
// as a single `action` SSE event; the widget renders an editable confirm card
// and executes the send client-side through the existing write paths
// (insertHelpRequest / POST /api/parent/messages) only when the user confirms.

export type ChatAction =
  | { kind: 'help_request'; subject: string; body: string; applicationId?: string }
  | { kind: 'counsellor_message'; body: string; contactId: string };

export const HELP_REQUEST_TOOL = 'propose_help_request';
export const COUNSELLOR_MESSAGE_TOOL = 'propose_counsellor_message';

const ACTION_TOOL_NAMES = new Set<string>([HELP_REQUEST_TOOL, COUNSELLOR_MESSAGE_TOOL]);

export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 2_000;

export function isActionCall(name: string | undefined): boolean {
  return Boolean(name && ACTION_TOOL_NAMES.has(name));
}

/** Runtime guard for action payloads arriving over the wire or from storage —
 * never trust the shape. */
export function isChatAction(value: unknown): value is ChatAction {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  if (a.kind === 'help_request') return typeof a.subject === 'string' && typeof a.body === 'string';
  if (a.kind === 'counsellor_message')
    return typeof a.body === 'string' && typeof a.contactId === 'string';
  return false;
}

const clampText = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Convert a model function call into a validated action payload. Returns
 * null when required fields are missing or the action isn't executable
 * (parent message without a counsellor contact thread). */
export function toActionPayload(
  call: { name?: string; args?: Record<string, unknown> },
  meta: { parentContactId?: string } = {}
): ChatAction | null {
  const args = call.args ?? {};

  if (call.name === HELP_REQUEST_TOOL) {
    const subject = clampText(args.subject, MAX_SUBJECT_LENGTH);
    const body = clampText(args.body, MAX_BODY_LENGTH);
    if (!subject || !body) return null;
    const applicationId = typeof args.application_id === 'string' ? args.application_id : undefined;
    return { kind: 'help_request', subject, body, ...(applicationId ? { applicationId } : {}) };
  }

  if (call.name === COUNSELLOR_MESSAGE_TOOL) {
    const body = clampText(args.body, MAX_BODY_LENGTH);
    if (!body || !meta.parentContactId) return null;
    return { kind: 'counsellor_message', body, contactId: meta.parentContactId };
  }

  return null;
}
