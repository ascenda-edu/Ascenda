import { assistantPathForMode, isAssistantRoute, detectMode } from '@/lib/chat/paths';

describe('assistant path helpers', () => {
  it('maps each mode to its portal-scoped assistant path', () => {
    expect(assistantPathForMode('student')).toBe('/assistant');
    expect(assistantPathForMode('counsellor')).toBe('/counsellor/assistant');
    expect(assistantPathForMode('parent')).toBe('/parent/assistant');
  });

  it('detects all three assistant routes (the widget hides on them)', () => {
    expect(isAssistantRoute('/assistant')).toBe(true);
    expect(isAssistantRoute('/counsellor/assistant')).toBe(true);
    expect(isAssistantRoute('/parent/assistant')).toBe(true);
    expect(isAssistantRoute('/dashboard')).toBe(false);
    expect(isAssistantRoute('/counsellor')).toBe(false);
    expect(isAssistantRoute('/assistantship')).toBe(false);
  });

  it('detects the portal mode from the pathname', () => {
    expect(detectMode('/counsellor/inbox')).toBe('counsellor');
    expect(detectMode('/parent/deadlines')).toBe('parent');
    expect(detectMode('/dashboard')).toBe('student');
  });
});
