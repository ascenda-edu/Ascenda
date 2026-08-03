/**
 * `notification-bell.tsx` was listed alongside the four modals in
 * docs/audit/09-design-system.md HIGH-6, but it is NOT a modal — it is a
 * popover: anchored to the bell, not covering the page, and the page behind it
 * stays live. Porting it to `ui/dialog.tsx` would have trapped focus, locked
 * body scroll and marked the whole app `aria-hidden` for a dropdown.
 *
 * So it keeps `role="dialog"` WITHOUT `aria-modal` — the audit's real complaint
 * was `aria-modal` on something that traps nothing — and gains the three
 * non-modal behaviours it was missing: focus moved into the panel on open,
 * Escape restoring focus to the bell, and the panel closing when focus leaves
 * it so it can never sit open and orphaned behind the caret.
 *
 * These tests are the contract for that decision. If a Popover primitive ever
 * lands (@radix-ui/react-popover is not currently a dependency), it must keep
 * every assertion below true.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';


const markRead = jest.fn();
const markAllRead = jest.fn();
const openRequest = jest.fn();

let items: Array<Record<string, unknown>> = [];
let unreadCount = 0;

jest.mock('@/hooks/use-notifications', () => ({
    useNotifications: () => ({ items, unreadCount, loading: false, markRead, markAllRead, refresh: jest.fn() }),
}));

jest.mock('@/components/help/help-drawer-provider', () => ({
    useHelpDrawer: () => ({ openRequest }),
}));

import { NotificationBell } from '@/components/notifications/notification-bell';

const NOTIF = {
    id: 'n-1',
    profile_id: 'p-1',
    kind: 'help_accepted',
    title: 'Your counsellor accepted the request',
    body: 'They will reply shortly.',
    href: '/inbox',
    read_at: null,
    created_at: new Date().toISOString(),
};

function Harness() {
    return (
        <div>
            <NotificationBell />
            <button type="button">Next navbar control</button>
        </div>
    );
}

const bell = () => screen.getByRole('button', { name: /Notifications/ });

beforeEach(() => {
    jest.clearAllMocks();
    items = [];
    unreadCount = 0;
});

describe('NotificationBell — a popover, deliberately not a Dialog', () => {
    it('is a non-modal dialog: role, but no aria-modal claim it cannot keep', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        const panel = await screen.findByRole('dialog');

        expect(panel).toHaveAttribute('aria-label', 'Notifications');
        expect(panel).not.toHaveAttribute('aria-modal');
        // The page behind stays reachable — that is the whole point of a popover.
        expect(screen.getByRole('button', { name: 'Next navbar control' })).toBeInTheDocument();
    });

    it('wires the trigger to the panel it controls', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        expect(bell()).toHaveAttribute('aria-haspopup', 'dialog');
        expect(bell()).toHaveAttribute('aria-expanded', 'false');

        await user.click(bell());
        const panel = await screen.findByRole('dialog');

        expect(bell()).toHaveAttribute('aria-expanded', 'true');
        expect(bell()).toHaveAttribute('aria-controls', panel.id);
    });

    it('moves focus into the panel on open', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        const panel = await screen.findByRole('dialog');

        await waitFor(() => expect(document.activeElement).toBe(panel));
    });

    it('closes on Escape and returns focus to the bell', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(bell()));
    });

    it('closes when focus leaves the popover entirely', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        await screen.findByRole('dialog');

        // Tabbing away must not leave an open panel behind the caret — the failure
        // mode a non-modal popover has instead of a broken focus trap.
        act(() => {
            screen.getByRole('button', { name: 'Next navbar control' }).focus();
        });

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('renders the notification kind through the Badge primitive', async () => {
        items = [NOTIF];
        unreadCount = 1;
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        await screen.findByRole('dialog');

        // `help_accepted` maps to the semantic `success` variant, not a class bundle.
        const badge = screen.getByText('help accepted');
        expect(badge).toHaveClass('rounded-full');
        expect(badge).toHaveClass('text-success');
    });

    it('uses the shared EmptyState when there is nothing to show', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.click(bell());
        await screen.findByRole('dialog');

        expect(screen.getByRole('heading', { name: 'No notifications yet' })).toBeInTheDocument();
    });
});
