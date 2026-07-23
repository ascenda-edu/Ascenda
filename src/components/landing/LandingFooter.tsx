import Link from 'next/link';

/**
 * Minimal landing footer — brand, contact, and copyright. Server component;
 * intentionally link-light (no placeholder legal pages that would 404).
 */
export function LandingFooter() {
    return (
        <footer className="w-full border-t border-border bg-background">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
                {/* Text brand — the PNG wordmark is white-on-transparent and vanishes
                    on the light footer, so we typeset the name instead. */}
                <Link
                    href="/"
                    className="font-heading text-lg font-bold tracking-tight text-foreground"
                    aria-label="Ascenda home"
                >
                    Ascenda
                </Link>
                <p className="text-sm text-muted-foreground">
                    Find universities you&apos;ll actually get into.
                </p>
                <div className="flex items-center gap-5 text-sm text-muted-foreground">
                    <a href="mailto:hello@ascendaedu.com" className="hover:text-foreground transition-colors">
                        hello@ascendaedu.com
                    </a>
                    <span aria-hidden>·</span>
                    <span>© {new Date().getFullYear()} Ascenda</span>
                </div>
            </div>
        </footer>
    );
}
