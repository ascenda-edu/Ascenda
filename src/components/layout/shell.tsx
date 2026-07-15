import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Sidebar } from './sidebar';
import { MobileNav } from './mobile-nav';
import { SidebarProvider } from './sidebar-context';
import { CommandPalette } from './command-palette';
import { ChatbotWidgetLazy } from '@/components/chat/chatbot-widget-lazy';

export const DashboardShell = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="relative min-h-screen bg-background pb-24 text-foreground transition-colors md:pb-16">
        <Navbar />
        <div className="flex w-full gap-4 px-3 pt-20 sm:gap-6 sm:px-6 md:pt-28 lg:px-10">
          <Sidebar />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 space-y-4 py-2 sm:space-y-6 sm:p-5 lg:p-6"
          >
            {children}
          </main>
        </div>
        <MobileNav />
        <CommandPalette />
        <ChatbotWidgetLazy />
      </div>
    </SidebarProvider>
  );
};
