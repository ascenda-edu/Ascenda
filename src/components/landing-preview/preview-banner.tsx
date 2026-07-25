import Link from 'next/link';

/** Fixed ribbon so nobody mistakes the preview for the live page. */
export function PreviewBanner() {
    return (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-floating backdrop-blur dark:border-white/10">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Design preview — the live landing page is unchanged.
            <Link href="/" className="font-semibold text-primary hover:underline">
                View live
            </Link>
        </div>
    );
}
