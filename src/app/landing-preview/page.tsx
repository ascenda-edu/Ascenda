import type { Metadata } from 'next';
import { ShortlistSection } from '@/components/landing/ShortlistSection';
import { TeamSection } from '@/components/landing/TeamSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { PreviewNav } from '@/components/landing-preview/preview-nav';
import { PreviewHero } from '@/components/landing-preview/preview-hero';
import { ProofScrub } from '@/components/landing-preview/proof-scrub';
import { ChapterIntro, SceneCatalogue, SceneFit, ScenePlan } from '@/components/landing-preview/scenes';
import { ComparisonSettle } from '@/components/landing-preview/comparison-settle';
import { PreviewBanner } from '@/components/landing-preview/preview-banner';
import { AltitudeWash } from '@/components/landing-preview/altitude-wash';
import { SectionReveal } from '@/components/landing-preview/section-reveal';
// Statically imported on purpose. `next/dynamic` with `ssr: true` was measured
// here and splits NOTHING: from a Server Component the lazy boundary resolves
// server-side and the client reference still lands in this route's entry chunk
// (verified: the finale's strings stay in chunks/app/landing-preview/page-*.js),
// so it only added the dynamic loader's ~0.4 kB. A real split would need the
// boundary inside a Client Component, which puts the finale behind a hydration
// suspend — not worth it for the #cta section the nav has to measure.
import { PreviewCta } from '@/components/landing-preview/preview-cta';
import { SmoothScroll } from '@/components/landing-preview/smooth-scroll';

export const metadata: Metadata = {
    title: 'Ascenda — landing redesign preview',
    robots: { index: false, follow: false },
};

/**
 * "The Ascent" — design-preview build of the landing redesign. Lives at
 * /landing-preview so the real landing page (/) stays untouched; sections the
 * redesign doesn't alter are imported from the live page verbatim.
 */
export default function LandingPreviewPage() {
    return (
        <main id="main-content" className="bg-background text-foreground font-sans w-full">
            {/* Page-scoped Lenis glide — destroyed on unmount, rest of the app unaffected. */}
            <SmoothScroll>
            <PreviewNav />
            <PreviewHero />
            <ProofScrub />
            {/* Narrative arc unchanged: promise → problem → product (three scrubbed chapters) → how → team → before/after → answers → CTA */}
            <ChapterIntro />
            <SceneFit />
            <SceneCatalogue />
            <ScenePlan />
            <SectionReveal>
                <ShortlistSection />
            </SectionReveal>
            <SectionReveal>
                <TeamSection />
            </SectionReveal>
            <ComparisonSettle />
            <SectionReveal>
                <FAQSection />
            </SectionReveal>
            {/* No SectionReveal: the launch finale is its own entrance, and a
                transformed ancestor would fight the 220vh sticky pin. */}
            <PreviewCta />
            <LandingFooter />
            <AltitudeWash />
            <PreviewBanner />
            </SmoothScroll>
        </main>
    );
}
