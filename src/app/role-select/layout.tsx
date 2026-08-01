import type { ReactNode } from 'react';

export default function RoleSelectLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Matches (auth)/layout.tsx: one brand-tinted wash, top-left, very soft. No
          multi-colour orb soup — login → role-select must not cross two visual
          languages. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_55%)]"
      />
      {children}
    </main>
  );
}
