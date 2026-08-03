/**
 * The shared modal contract.
 *
 * Five hand-rolled `role="dialog"` overlays used to carry `aria-modal="true"`
 * with no focus trap, no Escape handling and no focus restore — which is worse
 * than no attribute at all: it tells assistive tech the rest of the page is
 * inert while the keyboard walks straight out of it
 * (docs/audit/09-design-system.md, HIGH-6).
 *
 * All of them now route through `ui/dialog.tsx`, so these assertions are the
 * behaviour every one of them inherits. They are deliberately written against
 * the PRIMITIVE rather than each call site: if this file goes red, all five
 * overlays are broken at once, and per-overlay tests would only tell you the
 * same thing five times.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';

/** Every alignment shares one focus/Escape implementation — prove it for each. */
const ALIGNMENTS = ['center', 'left', 'right', 'top'] as const;

function Harness({ align }: { align?: (typeof ALIGNMENTS)[number] }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open dialog
            </button>
            {/* A second control outside the dialog: if the trap leaks, Tab lands here. */}
            <button type="button">Outside control</button>
            <Dialog open={open} onOpenChange={setOpen} align={align}>
                <DialogContent>
                    <DialogTitle>Assign deck</DialogTitle>
                    <DialogDescription>Students get a quest notification.</DialogDescription>
                    <button type="button">First action</button>
                    <button type="button">Second action</button>
                    <DialogClose>Dismiss</DialogClose>
                </DialogContent>
            </Dialog>
        </div>
    );
}

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    return screen.findByRole('dialog');
};

describe('ui/dialog — the behaviour the five hand-rolled overlays were missing', () => {
    it.each(ALIGNMENTS)('moves focus into the dialog on open (align=%s)', async (align) => {
        const user = userEvent.setup();
        render(<Harness align={align} />);

        const opener = screen.getByRole('button', { name: 'Open dialog' });
        opener.focus();
        await openDialog(user);

        // Focus must be inside the dialog, not left behind on the trigger.
        const dialog = screen.getByRole('dialog');
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        expect(document.activeElement).not.toBe(opener);
    });

    it('announces itself as a modal and is labelled by its title and description', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const dialog = await openDialog(user);

        expect(dialog).toHaveAttribute('role', 'dialog');

        // NOTE — `aria-modal` is deliberately ABSENT, and that is an upgrade.
        // The hand-rolled overlays set `aria-modal="true"` on a container that
        // trapped nothing, which tells assistive tech the page is inert while the
        // keyboard walks out of it. Radix asserts modality the stronger way
        // instead: it puts `aria-hidden` on everything outside the dialog (see the
        // last test in this file), which is what `aria-modal` only *claims*. Radix
        // omits the attribute on purpose — VoiceOver/Safari has a long-standing bug
        // where `aria-modal="true"` stops the virtual cursor reaching the dialog's
        // own content. Do not "fix" this by adding it back.
        expect(dialog).not.toHaveAttribute('aria-modal');

        // The label/description are wired by id, not copied — assert the link, so a
        // renamed title can never leave a dangling aria-labelledby behind.
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(document.getElementById(labelledBy as string)).toHaveTextContent('Assign deck');

        const describedBy = dialog.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy as string)).toHaveTextContent(
            'Students get a quest notification.'
        );
    });

    it('traps Tab inside the dialog instead of leaking to the page behind it', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const dialog = await openDialog(user);

        const first = screen.getByRole('button', { name: 'First action' });
        first.focus();

        // Walk past the last control. A trapped dialog wraps; an untrapped one
        // hands focus to "Outside control" behind the scrim.
        await user.tab();
        await user.tab();
        await user.tab();

        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        expect(document.activeElement).not.toBe(
            screen.queryByRole('button', { name: 'Outside control', hidden: true })
        );
    });

    it('traps Shift+Tab backwards as well', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        const dialog = await openDialog(user);

        screen.getByRole('button', { name: 'First action' }).focus();
        await user.tab({ shift: true });
        await user.tab({ shift: true });

        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it.each(ALIGNMENTS)('closes on Escape and returns focus to the opener (align=%s)', async (align) => {
        const user = userEvent.setup();
        render(<Harness align={align} />);

        const opener = screen.getByRole('button', { name: 'Open dialog' });
        opener.focus();
        await openDialog(user);

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        // Focus restore: without it the caret drops to <body> and a keyboard user
        // restarts from the top of the page.
        await waitFor(() => expect(document.activeElement).toBe(opener));
    });

    it('returns focus to the opener when dismissed by a close button', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        const opener = screen.getByRole('button', { name: 'Open dialog' });
        opener.focus();
        await openDialog(user);

        await user.click(screen.getByRole('button', { name: 'Dismiss' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(opener));
    });

    it('hides the rest of the page from assistive tech while open', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await openDialog(user);

        // The "worse than nothing" case the audit called out: aria-modal claiming
        // the page is inert while it is still exposed. Radix really does hide it.
        expect(screen.queryByRole('button', { name: 'Outside control' })).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Outside control', hidden: true })
        ).toBeInTheDocument();
    });
});
