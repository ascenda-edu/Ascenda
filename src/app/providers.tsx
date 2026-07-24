'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { ToastProvider } from '@/components/ui/toast';
import { HelpDrawerProvider } from '@/components/help/help-drawer-provider';

interface ProvidersProps {
  children: ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      {/* reducedMotion="user" makes every framer-motion animation respect the
          OS prefers-reduced-motion setting (transform/opacity animations are
          skipped), which CSS media queries cannot do for JS-driven styles. */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <HelpDrawerProvider>
            {children}
            <AnalyticsBridge />
            {process.env.NODE_ENV === 'development' ? <ReactQueryDevtools initialIsOpen={false} /> : null}
          </HelpDrawerProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
};

const AnalyticsBridge = () => {
  const pathname = usePathname();

  useEffect(() => {
    trackEvent('page_view', { pathname });
  }, [pathname]);

  return null;
};
