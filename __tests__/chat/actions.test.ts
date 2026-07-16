import {
  isActionCall,
  toActionPayload,
  MAX_SUBJECT_LENGTH,
  MAX_BODY_LENGTH,
} from '@/lib/chat/actions';

describe('chat actions', () => {
  describe('isActionCall', () => {
    it('recognises only the two action tool names', () => {
      expect(isActionCall('propose_help_request')).toBe(true);
      expect(isActionCall('propose_counsellor_message')).toBe(true);
      expect(isActionCall('search_programs')).toBe(false);
      expect(isActionCall(undefined)).toBe(false);
      expect(isActionCall('')).toBe(false);
    });
  });

  describe('toActionPayload', () => {
    it('maps a help request call to a payload', () => {
      const payload = toActionPayload({
        name: 'propose_help_request',
        args: { subject: 'Oxford reference', body: 'Can we talk about my reference?' },
      });
      expect(payload).toEqual({
        kind: 'help_request',
        subject: 'Oxford reference',
        body: 'Can we talk about my reference?',
      });
    });

    it('carries an optional application id through', () => {
      const payload = toActionPayload({
        name: 'propose_help_request',
        args: { subject: 'S', body: 'B', application_id: 'app-1' },
      });
      expect(payload).toEqual({
        kind: 'help_request',
        subject: 'S',
        body: 'B',
        applicationId: 'app-1',
      });
    });

    it('rejects a help request missing subject or body', () => {
      expect(toActionPayload({ name: 'propose_help_request', args: { subject: 'S' } })).toBeNull();
      expect(toActionPayload({ name: 'propose_help_request', args: { body: 'B' } })).toBeNull();
      expect(toActionPayload({ name: 'propose_help_request', args: { subject: '  ', body: 'B' } })).toBeNull();
    });

    it('clamps overlong subject and body', () => {
      const payload = toActionPayload({
        name: 'propose_help_request',
        args: { subject: 'x'.repeat(500), body: 'y'.repeat(5000) },
      });
      expect(payload?.kind).toBe('help_request');
      if (payload?.kind === 'help_request') {
        expect(payload.subject).toHaveLength(MAX_SUBJECT_LENGTH);
        expect(payload.body).toHaveLength(MAX_BODY_LENGTH);
      }
    });

    it('injects the contact id into a counsellor message', () => {
      const payload = toActionPayload(
        { name: 'propose_counsellor_message', args: { body: 'Hello' } },
        { parentContactId: 'contact-9' }
      );
      expect(payload).toEqual({ kind: 'counsellor_message', body: 'Hello', contactId: 'contact-9' });
    });

    it('refuses a counsellor message without a contact thread', () => {
      const payload = toActionPayload({
        name: 'propose_counsellor_message',
        args: { body: 'Hello' },
      });
      expect(payload).toBeNull();
    });

    it('returns null for non-action calls', () => {
      expect(toActionPayload({ name: 'search_programs', args: { query: 'cs' } })).toBeNull();
    });
  });
});
