/**
 * `ui/badge.tsx` is 79 lines of well-built `cva` that had **2 usages** against 44
 * hand-rolled pills (docs/audit/09-design-system.md, HIGH-4). Raising adoption
 * needed two API additions; this file is the contract for both, plus the
 * tailwind-merge hazard the primitive's own docstring records.
 */
import { render, screen } from '@testing-library/react';

import { Badge } from '@/components/ui/badge';

describe('ui/badge — the two variants added to raise adoption', () => {
    it('size="sm" is the 11px chip, using the NAMED step rather than an arbitrary value', () => {
        render(<Badge size="sm">help accepted</Badge>);
        const badge = screen.getByText('help accepted');

        // `.text-label` is registered in tailwind-merge's font-size group
        // (lib/utils.ts), which is what makes it safe beside a tone colour and
        // able to override `text-xs`. `text-[0.6875rem]` gets no such treatment.
        expect(badge).toHaveClass('text-label');
        expect(badge).not.toHaveClass('text-xs');
        expect(badge).toHaveClass('rounded-full');
    });

    it('variant="bare" contributes geometry only, so a legacy tone bundle survives intact', () => {
        // The case this exists for: DECK_RARITY / DECK_FIT / the analytics
        // `{label,color}` payloads hand out a whole class bundle, not a variant
        // name. Pinning a real variant underneath would make tailwind-merge
        // arbitrate three colour groups for nothing.
        render(
            <Badge variant="bare" className="border-warning/40 bg-warning-subtle text-warning">
                Legendary
            </Badge>
        );
        const badge = screen.getByText('Legendary');

        expect(badge).toHaveClass('rounded-full');
        expect(badge).toHaveClass('text-warning');
        expect(badge).toHaveClass('bg-warning-subtle');
        // None of the default `neutral` colours leaked through.
        expect(badge).not.toHaveClass('bg-muted/60');
        expect(badge).not.toHaveClass('text-foreground');
    });

    it('keeps the semantic tone variants intact', () => {
        render(<Badge variant="success">Resolved</Badge>);
        const badge = screen.getByText('Resolved');
        expect(badge).toHaveClass('text-success');
        expect(badge).toHaveClass('bg-success-subtle');
    });

    it('asChild renders the caller element, so a chip can be a real button', () => {
        render(
            <Badge asChild variant="bare" className="text-label">
                <button type="button">Change rarity</button>
            </Badge>
        );
        const badge = screen.getByRole('button', { name: 'Change rarity' });
        expect(badge.tagName).toBe('BUTTON');
        expect(badge).toHaveClass('rounded-full');
        expect(badge).toHaveClass('text-label');
    });
});
