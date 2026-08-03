/**
 * The worst of the six overlays: `assistant-workspace.tsx:782-793` was a bare
 * `fixed inset-0 z-modal` backdrop with **no `role`, no `aria-modal`, no focus
 * trap and no Escape handler at all** (docs/audit/04-react-components.md, HIGH-7;
 * 09-design-system.md flags the same site). Tab walked straight out behind the
 * scrim and a screen reader was never told a dialog had opened.
 *
 * It is `<Dialog align="left">` now. These tests are the regression guard for
 * the specific defect: the rail must announce itself, hold focus, and close on
 * Escape back to the button that opened it.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/assistant',
    useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/hooks/useSupabase', () => ({ useSupabase: () => ({}) }));

jest.mock('@/hooks/use-chat-stream', () => ({
    useChatStream: () => ({
        run: jest.fn(),
        runActionExecute: jest.fn(),
        stop: jest.fn(),
        isStreaming: false,
        cooldownRemaining: 0,
        coolingDown: false,
    }),
}));

jest.mock('@/hooks/use-realtime-poll', () => ({ useRealtimePoll: () => undefined }));

jest.mock('@/lib/chat/history', () => ({
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    listActionHistory: jest.fn().mockResolvedValue([]),
    listConversations: jest.fn().mockResolvedValue([]),
    listMessages: jest.fn().mockResolvedValue([]),
    renameConversation: jest.fn(),
    setMessageRating: jest.fn(),
    togglePin: jest.fn(),
    updateMessageAction: jest.fn(),
}));

jest.mock('@/lib/demo/help-request-client', () => ({ insertHelpRequest: jest.fn() }));

// The rail and thread panes are not what is under test — stub them so this file
// stays about the overlay contract.
jest.mock('@/components/assistant/conversation-rail', () => ({
    ConversationRail: () => (
        <div>
            <button type="button">Conversation one</button>
        </div>
    ),
}));

jest.mock('@/components/assistant/thread-pane', () => ({
    ThreadPane: () => <div>Thread pane</div>,
}));

import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

const railTrigger = () => screen.getByRole('button', { name: 'Show conversations' });

beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ suggestions: [] }),
    }) as unknown as typeof fetch;
    // The rail is mobile-only and closes itself at the lg breakpoint; jsdom's
    // matchMedia is not implemented, so pretend we are below it.
    Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            addListener: jest.fn(),
            removeListener: jest.fn(),
            dispatchEvent: jest.fn(),
        }),
    });
});

describe('Assistant mobile rail — was an overlay with no dialog semantics at all', () => {
    it('announces itself as a labelled dialog when opened', async () => {
        const user = userEvent.setup();
        render(<AssistantWorkspace mode="student" userId="u-1" />);

        await user.click(railTrigger());

        const dialog = await screen.findByRole('dialog');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent('Conversations');
        expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    });

    it('moves focus into the rail and holds it there', async () => {
        const user = userEvent.setup();
        render(<AssistantWorkspace mode="student" userId="u-1" />);

        await user.click(railTrigger());
        const dialog = await screen.findByRole('dialog');

        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        // The exact defect: Tab used to escape to the page behind the scrim.
        for (let i = 0; i < 4; i += 1) await user.tab();
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('closes on Escape and returns focus to the rail button', async () => {
        const user = userEvent.setup();
        render(<AssistantWorkspace mode="student" userId="u-1" />);

        const trigger = railTrigger();
        trigger.focus();
        await user.click(trigger);
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(railTrigger()));
    });

    it('closes from its own close button', async () => {
        const user = userEvent.setup();
        render(<AssistantWorkspace mode="student" userId="u-1" />);

        await user.click(railTrigger());
        await screen.findByRole('dialog');

        await user.click(screen.getByRole('button', { name: 'Close conversations' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
