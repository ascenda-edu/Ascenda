'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isNavActive, type NavItem } from './navigation';

interface NavLinkProps {
    item: NavItem;
    mobile?: boolean;
}

export const NavLink = ({ item, mobile = false }: NavLinkProps) => {
    const pathname = usePathname();
    const active = isNavActive(item, pathname);

    if (mobile) {
        return (
            <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 border border-transparent transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                        ? 'border border-primary bg-primary text-primary-foreground shadow-e-1'
                        : 'hover:bg-foreground/5 hover:text-foreground/90'
                )}
            >
                {item.label}
            </Link>
        );
    }

    return (
        // No hover lift: this is a horizontal bar of pills, and lifting one
        // makes the whole row feel unstable. Colour + background carry the
        // hover state instead, on an explicit transition property list.
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-1 border border-transparent transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                active
                    ? 'border border-primary bg-primary text-primary-foreground shadow-e-1'
                    : 'hover:bg-foreground/5 hover:text-foreground'
            )}
        >
            <span>{item.label}</span>
        </Link>
    );
};
