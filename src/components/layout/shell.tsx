import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { SidebarProvider } from './sidebar-context';
import { CommandPalette } from './command-palette';
import { ChatbotWidgetLazy } from '@/components/chat/chatbot-widget-lazy';
import { PageTransition } from './page-transition';
import { RoleProvider } from '@/lib/auth/role-context';

export const DashboardShell = ({
  children,
  nav,
  role
}: {
  children: ReactNode;
  /**
   * Section nav, rendered ABOVE the page-transition wrapper.
   *
   * This slot exists because `PageTransition` is keyed on the pathname, so anything
   * inside it remounts on every navigation. A section nav passed through `children`
   * therefore remounted too — which is precisely what left the nav's `layoutId`
   * indicator inert, since framer needs the outgoing and incoming pill in the SAME
   * commit to animate between them. Passed here it lives outside the keyed subtree
   * and survives, so the indicator slides.
   */
  nav?: ReactNode;
  /**
   * The server-resolved `profiles.role`, from `getIdentity()` in the owning
   * layout/page. Feeds `RoleProvider`, which is what `navbar`, `sidebar`,
   * `mobile-nav` and `side-switcher` read — so the browser never re-derives it
   * (docs/audit/11-security-authz.md F8).
   *
   * OPTIONAL, and it has to stay optional for two reasons. Surfaces are being
   * migrated incrementally, and `src/app/appointment/page.tsx` is a CLIENT
   * component that renders this shell, so it has no server identity to pass at
   * all. Omitting it leaves `useRole()` on its legacy client derivation — the
   * behaviour every mount had before this change. When every server mount
   * passes one, that fallback and its two round trips can be deleted.
   *
   * NOT an authorisation input; it decides which nav items are listed.
   * The shell deliberately does NOT resolve this itself: it is imported by a
   * client component (above) and by seven `loading.tsx` files, where an `await`
   * would put a suspending server component inside a Suspense FALLBACK.
   */
  role?: string | null;
}) => {
  return (
    <RoleProvider role={role}>
      <SidebarProvider>
        <div className="relative min-h-screen bg-background pb-24 text-foreground transition-colors md:pb-16">
          <Navbar />
          {/* sm:pt-28 (not md:): the navbar is already ~100px tall from `sm` up
              (60px logo), so clearing it at md only underlapped 640–767px. */}
          {/* max-w-[120rem]: sidebar+content stretch to ~2160px then center as a
              unit — past that, unbounded width just degrades PageHero and
              single-column pages (rem-based so it tracks the fluid root clamp). */}
          <div className="shell-gutter mx-auto flex w-full max-w-[120rem] gap-4 pt-20 sm:gap-6 sm:pt-28">
            <Sidebar />
            <main
              id="main-content"
              tabIndex={-1}
              className="min-w-0 flex-1 space-y-4 py-2 sm:space-y-6 sm:py-5 lg:py-6"
            >
              {/* space-y appears on BOTH elements deliberately: here it spaces the nav
                  from the content below it (two siblings), and on PageTransition it
                  spaces the page's own top-level blocks. Neither is redundant — a
                  `space-y-*` rule only ever applies to an element's own children. */}
              {nav}
              <PageTransition className="space-y-4 sm:space-y-6">{children}</PageTransition>
            </main>
          </div>
          <MobileNav />
          <CommandPalette />
          <ChatbotWidgetLazy />
        </div>
      </SidebarProvider>
    </RoleProvider>
  );
};
