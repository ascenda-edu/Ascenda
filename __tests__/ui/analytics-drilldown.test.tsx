/**
 * `analytics-drilldown.tsx` carried its own copy of the focus trap
 * (`onTrapKeyDown` + a duplicated FOCUSABLE selector), its own Escape listener,
 * its own `document.body.style.overflow` scroll lock and its own
 * `previouslyFocused` ref — none of which the audit could find a Tab handler for
 * on the *outer* container, so `aria-modal="true"` was a claim the component
 * could not keep (docs/audit/09-design-system.md, HIGH-6).
 *
 * It is a `<Dialog>` now. These tests pin the four behaviours at the call site,
 * because this overlay's `open` state is a nullable DATA object rather than a
 * boolean — the exit animation reads a retained snapshot, and getting that wrong
 * blanks the panel a frame before it leaves.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { DrilldownPanel, type DrilldownState } from '@/app/counsellor/_components/analytics-drilldown';
import type { CounsellorStudent } from '@/lib/counsellor/types';

const student = (id: string, firstName: string): CounsellorStudent => ({
    id,
    personal: {
        firstName,
        lastName: 'Okafor',
        nationality: 'Nigeria',
        flagEmoji: '🇳🇬',
        school: 'Lagos International',
        schoolCity: 'Lagos',
        schoolCountry: 'Nigeria',
        email: `${firstName.toLowerCase()}@example.test`,
    },
    academic: {
        programmeType: 'IB',
        ibPoints: 38,
        subjects: ['Maths AA HL', 'Physics HL'],
        clusters: ['engineering'],
        careerAspiration: 'Engineer',
        englishStatus: 'met',
        admissionsTests: [],
        graduationYear: 2027,
    },
    lifestyle: {
        teachingStyle: 'academic',
        locationPreference: 'city',
        campusSize: 'large',
        interests: ['robotics'],
    },
    profile: { completionPct: 80, stepsComplete: ['personal', 'academic'] },
    matches: [],
    applications: [],
    deadlines: [],
    notes: [],
    flags: [],
    lastActive: '2026-07-30T10:00:00.000Z',
});

const DATA: DrilldownState = {
    title: 'High achievers',
    subtitle: '38+ predicted points',
    accentColor: 'bg-success-fill',
    items: [
        { student: student('s-1', 'Ada'), detail: 'Predicted 38', badge: { label: '38 pts', color: 'bg-info-subtle text-info' } },
        { student: student('s-2', 'Bola') },
    ],
};

function Harness({ data = DATA }: { data?: DrilldownState }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                Open drilldown
            </button>
            <button type="button">Chart bar behind the modal</button>
            <DrilldownPanel data={open ? data : null} onClose={() => setOpen(false)} />
        </div>
    );
}

const opener = () => screen.getByRole('button', { name: 'Open drilldown' });

describe('DrilldownPanel — migrated to the Radix-backed Dialog', () => {
    it('moves focus into the panel on open and labels it from the drilldown title', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());

        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

        const labelledBy = dialog.getAttribute('aria-labelledby');
        expect(document.getElementById(labelledBy as string)).toHaveTextContent('High achievers');
        const describedBy = dialog.getAttribute('aria-describedby');
        expect(document.getElementById(describedBy as string)).toHaveTextContent('38+ predicted points');
    });

    it('traps Tab inside the panel rather than reaching the chart behind it', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(opener());
        const dialog = await screen.findByRole('dialog');

        for (let i = 0; i < 5; i += 1) await user.tab();
        await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
        expect(screen.queryByRole('button', { name: 'Chart bar behind the modal' })).not.toBeInTheDocument();
    });

    it('closes on Escape and restores focus to the element that opened it', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(opener()));
    });

    it('closes from its own Close button and restores focus', async () => {
        const user = userEvent.setup();
        render(<Harness />);

        opener().focus();
        await user.click(opener());
        await screen.findByRole('dialog');

        await user.click(screen.getByRole('button', { name: 'Close' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(document.activeElement).toBe(opener()));
    });

    it('always exposes a description, even when the caller supplies no subtitle', async () => {
        const user = userEvent.setup();
        render(<Harness data={{ ...DATA, subtitle: undefined }} />);
        await user.click(opener());

        const dialog = await screen.findByRole('dialog');
        const describedBy = dialog.getAttribute('aria-describedby');
        expect(document.getElementById(describedBy as string)).toHaveTextContent('2 students');
    });

    it('renders the per-student badge through the Badge primitive', async () => {
        const user = userEvent.setup();
        render(<Harness />);
        await user.click(opener());
        await screen.findByRole('dialog');

        // `variant="bare"` keeps the caller's tone bundle and takes only geometry.
        const badge = screen.getByText('38 pts');
        expect(badge).toHaveClass('rounded-full');
        expect(badge).toHaveClass('text-info');
    });
});
