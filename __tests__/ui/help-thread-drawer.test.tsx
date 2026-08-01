/**
 * `help-thread-drawer.tsx` was the largest of the five hand-rolled overlays: 919
 * lines carrying its own FOCUSABLE selector (with a comment saying it "mirrors
 * the query in ui/dialog.tsx" — the tell that it should have been shared code),
 * its own Tab trap, its own document-level Escape listener and its own
 * focus-restore effect (docs/audit/09-design-system.md, HIGH-6).
 *
 * It is a blocking right-edge slide-over — a modal, not a non-blocking drawer —
 * so it moved to `<Dialog align="right">`, an alignment added to the primitive
 * for this shape. The three effects were deleted rather than kept alongside
 * Radix's: a second `document` Escape listener still fires after Radix has
 * closed the drawer, and a second Tab trap fights Radix's focus sentinels.
 *
 * It also keeps a roving-tabindex tablist of its own, which the migration must
 * not have disturbed — hence the last test.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import type { HelpRequest } from '@/lib/types/demo-tables';

const REQUEST: HelpRequest = {
    id: 'req-1',
    student_profile_id: 'stu-1',
    counsellor_profile_id: 'cou-1',
    application_id: null,
    university: 'Imperial College London',
    program: 'BEng Computing',
    subject: 'Help with my personal statement',
    body: 'Could you look at my draft?',
    status: 'accepted',
    initiated_by: 'student',
    student_last_read_at: null,
    counsellor_last_read_at: null,
    created_at: '2026-07-30T10:00:00.000Z',
    accepted_at: null,
    resolved_at: null,
};

jest.mock('@/hooks/use-help-thread', () => ({
    useHelpThread: () => ({
        request: REQUEST,
        messages: [],
        notes: [],
        meetings: [],
        loading: false,
        reply: jest.fn(),
        addNote: jest.fn(),
        proposeMeeting: jest.fn(),
        setMeetingStatus: jest.fn(),
        setStatus: jest.fn(),
    }),
}));

jest.mock('@/hooks/useSupabase', () => ({ useSupabase: () => ({}) }));

jest.mock('@/components/ui/toast', () => ({
    useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/lib/demo/help-request-client', () => ({
    resolveProfileNames: jest.fn().mockResolvedValue(new Map()),
}));

// The behaviour lives in the impl module; `help-thread-drawer.tsx` is now just a
// next/dynamic boundary that keeps @radix-ui/react-dialog out of the root
// layout's critical bundle. Import the impl so these assertions are synchronous.
import { HelpThreadDrawer } from '@/components/help/help-thread-drawer-impl';

function Harness({ side = 'counsellor' as const }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open thread
            </button>
            <button type="button">Inbox row behind the drawer</button>
            <HelpThreadDrawer open={open} requestId="req-1" side={side} onClose={() => setOpen(false)} />
        </div>
    );
}

const opener = () => screen.getByRole('button', { name: 'Open thread' });

describe('HelpThreadDrawer — migrated to <Dialog align="right">', () => {
    it('moves focus into the drawer on open and labels it from the request', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent(
            'Imperial College London'
        );
        expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    });

    it('traps Tab inside the drawer', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(opener());
        const dialog = await screen.findByRole('dialog');

        for (let i = 0; i < 6; i += 1) await user.tab();
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        expect(
            screen.queryByRole('button', { name: 'Inbox row behind the drawer' })
        ).not.toBeInTheDocument();
    });

    it('closes on Escape exactly once and restores focus to the opener', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(opener()));
    });

    it('closes from the header close button and restores focus', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());
        await screen.findByRole('dialog');

        await user.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(opener()));
    });

    it('keeps its own roving-tabindex tablist working inside the dialog', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(opener());
        await screen.findByRole('dialog');

        const tabs = screen.getAllByRole('tab');
        expect(tabs).toHaveLength(3);
        tabs[0].focus();

        // ArrowRight is the drawer's own handler; Radix must not have swallowed it.
        await user.keyboard('{ArrowRight}');
        await waitFor(() => expect(tabs[1]).toHaveAttribute('aria-selected', 'true'));
        expect(document.activeElement).toBe(tabs[1]);
    });
});
