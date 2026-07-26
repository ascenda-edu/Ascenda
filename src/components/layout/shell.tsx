import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { SidebarProvider } from './sidebar-context';
import { CommandPalette } from './command-palette';
import { ChatbotWidgetLazy } from '@/components/chat/chatbot-widget-lazy';
import { PageTransition } from './page-transition';

export const DashboardShell = ({ children }: { children: ReactNode }) => {
  return (
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
            className="min-w-0 flex-1 py-2 sm:py-5 lg:py-6"
          >
            {/* space-y lives on PageTransition, not here: this wrapper is <main>'s only
                child, and `space-y-*` needs siblings to do anything. */}
            <PageTransition className="space-y-4 sm:space-y-6">{children}</PageTransition>
          </main>
        </div>
        <MobileNav />
        <CommandPalette />
        <ChatbotWidgetLazy />
      </div>
    </SidebarProvider>
  );
};
