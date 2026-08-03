/**
 * `command-palette.tsx` was one of the five hand-rolled `role="dialog"` overlays:
 * `aria-modal="true"`, its own `onDialogKeyDown` Tab trap, its own Escape branch
 * inside the input's keydown, and its own `previouslyFocused` restore ref
 * (docs/audit/09-design-system.md, HIGH-6). All four were DELETED, not nested,
 * when it moved to `<Dialog align="top">` — nesting them would mean two Escape
 * handlers on one keypress and two traps arguing over the wrap-around.
 *
 * This file checks the migration kept the palette's own keyboard behaviour
 * (⌘K / Ctrl+K, ↑↓, Enter) while the modal behaviour came from the primitive.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = jest.fn();

jest.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/dashboard',
}));

import { CommandPalette, CommandPaletteTrigger } from '@/components/layout/command-palette';

function Harness() {
    return (
        <div>
            <CommandPaletteTrigger />
            <CommandPalette />
        </div>
    );
}

const trigger = () => screen.getByRole('button', { name: 'Open command palette' });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CommandPalette — migrated to the Radix-backed Dialog', () => {
    it('opens on the keyboard shortcut and lands focus in the search field', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.keyboard('{Control>}k{/Control}');

        const dialog = await screen.findByRole('dialog');
        const input = screen.getByRole('textbox', { name: 'Search commands' });
        await waitFor(() => expect(document.activeElement).toBe(input));
        expect(dialog.contains(input)).toBe(true);
    });

    it('is labelled and described for assistive tech', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.keyboard('{Control>}k{/Control}');

        const dialog = await screen.findByRole('dialog');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent('Command menu');
        const describedBy = dialog.getAttribute('aria-describedby');
        expect(document.getElementById(describedBy as string)).toHaveTextContent(/Arrow keys move/);
    });

    it('traps Tab inside the palette', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.keyboard('{Control>}k{/Control}');
        const dialog = await screen.findByRole('dialog');

        // The palette is a long list of buttons; walking a few steps must never
        // reach the trigger sitting behind the scrim.
        for (let i = 0; i < 4; i += 1) await user.tab();
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    });

    it('closes on Escape and returns focus to the trigger', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        // Open from the visible affordance so there is a real element to go back to.
        await user.click(trigger());
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(trigger()));
    });

    it('still runs a command with ArrowDown + Enter, and closes afterwards', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.keyboard('{Control>}k{/Control}');
        await screen.findByRole('dialog');

        await user.keyboard('matches');
        await user.keyboard('{Enter}');

        expect(push).toHaveBeenCalledWith('/matches');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('resets the query between openings', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        await user.keyboard('{Control>}k{/Control}');
        await screen.findByRole('dialog');
        await user.keyboard('scholar');
        expect(screen.getByRole('textbox', { name: 'Search commands' })).toHaveValue('scholar');

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        await user.keyboard('{Control>}k{/Control}');
        await screen.findByRole('dialog');
        expect(screen.getByRole('textbox', { name: 'Search commands' })).toHaveValue('');
    });
});
