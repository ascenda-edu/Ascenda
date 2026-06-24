'use client';

import { PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';

export function PageWrapper({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const isFullBleed = pathname === '/' || pathname === '/login';

  if (isFullBleed) {
    return children;
  }

  return (
    <div className="w-full">
      <div className="container mx-auto px-4 md:px-6">{children}</div>
    </div>
  );
}
