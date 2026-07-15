'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    items?: BreadcrumbItem[];
    className?: string;
    homeHref?: string;
}

export const Breadcrumbs = ({ items, className, homeHref = '/dashboard' }: BreadcrumbsProps) => {
    const pathname = usePathname();

    // If no items provided, try to generate them from pathname
    const breadcrumbs = items || generateBreadcrumbs(pathname);

    return (
        <nav aria-label="Breadcrumb" className={cn('flex items-center text-sm text-muted-foreground', className)}>
            <Link
                href={homeHref}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
                aria-label="Home"
            >
                <Home className="h-4 w-4" />
            </Link>

            {breadcrumbs.map((item, index) => {
                const isLast = index === breadcrumbs.length - 1;

                return (
                    <Fragment key={item.label + index}>
                        <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground/50" />
                        {item.href && !isLast ? (
                            <Link
                                href={item.href}
                                className="transition-colors hover:text-foreground"
                            >
                                {item.label}
                            </Link>
                        ) : (
                            <span
                                className={cn('font-medium text-foreground', isLast && 'pointer-events-none')}
                                aria-current={isLast ? 'page' : undefined}
                            >
                                {item.label}
                            </span>
                        )}
                    </Fragment>
                );
            })}
        </nav>
    );
};

// Helper to generate breadcrumbs from pathname
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
    const segments = pathname.split('/').filter(Boolean);

    // Skip the first segment if it's 'dashboard' since we have the home icon
    const startIndex = segments[0] === 'dashboard' ? 1 : 0;

    return segments.slice(startIndex).map((segment, index) => {
        const href = `/${segments.slice(0, startIndex + index + 1).join('/')}`;

        // Format label: replace hyphens with spaces and capitalize
        const label = segment
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());

        return {
            label,
            href
        };
    });
}
