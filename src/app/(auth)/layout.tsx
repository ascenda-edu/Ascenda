import type { ReactNode } from 'react';
import Image from 'next/image';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Single brand-tinted wash, top-left, very soft. No multi-colour orb soup. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_55%)]"
      />

      <div className="relative grid min-h-screen w-full lg:grid-cols-2">

        {/* Left — brand panel (desktop only) */}
        <section className="hidden flex-col justify-between px-12 py-12 lg:flex xl:px-20">
          <Image
            src="/ascenda-logo.png"
            alt="Ascenda"
            width={200}
            height={200}
            priority
            className="h-auto w-[200px] object-contain"
          />


          <div className="max-w-md space-y-5">
            <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Your shortlist.<br />Your timeline.<br />Your counsellor.
            </h1>
            <p className="text-base text-muted-foreground">
              One place for every university you&apos;re considering, every deadline you&apos;re chasing, and every conversation with the people helping you get in.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Ascenda
          </p>
        </section>

        {/* Right — form panel */}
        <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-sm space-y-8">
            {/* Mobile logo */}
            <div className="flex justify-center lg:hidden">
              <Image
                src="/ascenda-logo.png"
                alt="Ascenda"
                width={160}
                height={160}
                priority
                className="h-auto w-[160px] object-contain"
              />
            </div>

            {children}
          </div>
        </section>

      </div>
    </main>
  );
}
