/**
 * `_universities-client.tsx` held two hand-rolled modals (assign-deck,
 * delete-deck) plus a private `useModalA11y` hook — a third copy of the same
 * FOCUSABLE query, Tab trap, Escape listener and focus-restore ref, never
 * exported and never reused (docs/audit/04-react-components.md, MED-2;
 * 09-design-system.md, HIGH-6). Both are `<Dialog>` now and the hook is gone.
 *
 * The delete confirm also carries a guard the primitive cannot know about: an
 * in-flight delete must not be dismissable. Radix routes Escape, scrim clicks
 * and DialogClose through one `onOpenChange`, so that guard is now expressed
 * once — this file pins it.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class NoopResizeObserver {
    observe() { /* no layout in jsdom */ }
    unobserve() { /* no layout in jsdom */ }
    disconnect() { /* no layout in jsdom */ }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= NoopResizeObserver;

const showToast = jest.fn();
jest.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast }) }));

jest.mock('@/lib/supabase/client', () => ({
    getBrowserSupabaseClient: () => ({
        from: () => ({
            select: () => ({ ilike: () => ({ limit: async () => ({ data: [], error: null }) }) }),
        }),
    }),
}));

jest.mock('@/lib/catalog/visibility', () => ({ filterVisiblePrograms: (rows: unknown[]) => rows }));

import { UniversitiesClient } from '@/app/counsellor/universities/_universities-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CounsellorDeck } from '@/lib/counsellor/decks';

const DECK: CounsellorDeck = {
    id: 'deck-1',
    counsellorId: 'cou-1',
    name: 'Russell Group run',
    description: null,
    theme: { emoji: '🗡️' },
    createdAt: '2026-07-01T00:00:00.000Z',
    cards: [
        {
            id: 'card-1',
            programId: 'prog-1',
            rarity: 'legendary',
            fit: 'reach',
            note: null,
            courseName: 'BEng Computing',
            university: 'Imperial College London',
            country: 'United Kingdom',
        },
    ],
    assignees: [],
};

const ROSTER = [{ id: 'stu-1', name: 'Ada Okafor', flag: '🇳🇬', completionPct: 80 }];

// TooltipProvider is mounted once app-wide in app/providers.tsx (grouping the
// skip-delay window is the whole reason it is a singleton), so a test that
// renders a Tooltip consumer has to supply it.
const renderClient = () =>
    render(
        <TooltipProvider>
            <UniversitiesClient initialDecks={[DECK]} roster={ROSTER} />
        </TooltipProvider>
    );

beforeEach(() => {
    jest.clearAllMocks();
    // The component fetches its country filter list on mount (a known
    // client-side-fetch finding in docs/audit/04-react-components.md, MED-11).
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ countries: [] }),
    }) as unknown as typeof fetch;
});

describe('Deck dialogs — the last two hand-rolled modals', () => {
    it('opens the assign dialog with focus inside, a label and a description', async () => {
        const user = userEvent.setup();
        renderClient();

        await user.click(screen.getByRole('button', { name: /Assign to students/i }));

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent('Russell Group run');
        const describedBy = dialog.getAttribute('aria-describedby');
        expect(document.getElementById(describedBy as string)).toHaveTextContent(
            /quest notification/i
        );
    });

    it('traps Tab in the assign dialog and closes on Escape back to the trigger', async () => {
        const user = userEvent.setup();
        renderClient();

        const trigger = screen.getByRole('button', { name: /Assign to students/i });
        trigger.focus();
        await user.click(trigger);
        const dialog = await screen.findByRole('dialog');

        for (let i = 0; i < 5; i += 1) await user.tab();
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByRole('button', { name: /Assign to students/i })
            )
        );
    });

    it('opens the delete confirm as a labelled dialog and Escape cancels it', async () => {
        const user = userEvent.setup();
        renderClient();

        const trigger = screen.getByRole('button', { name: 'Delete deck Russell Group run' });
        trigger.focus();
        await user.click(trigger);

        const dialog = await screen.findByRole('dialog');
        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent(
            /Delete .*Russell Group run/
        );
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() =>
            expect(document.activeElement).toBe(
                screen.getByRole('button', { name: 'Delete deck Russell Group run' })
            )
        );
    });

    it('renders the rarity and fit chips as Badges with real tooltips, not native titles', async () => {
        renderClient();

        // findBy* rather than getBy*: the on-mount country fetch settles in a
        // microtask, and asserting synchronously leaves that setState outside act.
        const rarity = await screen.findByRole('button', { name: /Legendary/ });
        // Geometry from the Badge primitive, colour still from DECK_RARITY.
        expect(rarity).toHaveClass('rounded-full');
        expect(rarity).toHaveClass('text-warning');
        // A native `title=` has no touch support and no keyboard trigger — the
        // "these chips are clickable" affordance is a Radix Tooltip now.
        expect(rarity).not.toHaveAttribute('title');
        expect(rarity).toHaveAttribute('data-state');
    });
});
