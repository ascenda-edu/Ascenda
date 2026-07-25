import { ShortlistSection } from '@/components/landing/ShortlistSection';
import { TeamSection } from '@/components/landing/TeamSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { PreviewNav } from '@/components/landing-preview/preview-nav';
import { PreviewHero } from '@/components/landing-preview/preview-hero';
import { ProofScrub } from '@/components/landing-preview/proof-scrub';
import { ChapterIntro, SceneCatalogue, SceneFit, ScenePlan } from '@/components/landing-preview/scenes';
import { ComparisonSettle } from '@/components/landing-preview/comparison-settle';
import { AltitudeWash } from '@/components/landing-preview/altitude-wash';
import { SectionReveal } from '@/components/landing-preview/section-reveal';
// Statically imported on purpose. `next/dynamic` with `ssr: true` was measured
// and splits NOTHING here: from a Server Component the lazy boundary resolves
// server-side and the client reference still lands in this route's entry chunk,
// so it only added the dynamic loader's ~0.4 kB. A real split would need the
// boundary inside a Client Component, which puts the finale behind a hydration
// suspend — not worth it for the #cta section the nav has to measure.
import { PreviewCta } from '@/components/landing-preview/preview-cta';
import { SmoothScroll } from '@/components/landing-preview/smooth-scroll';

/**
 * "The Ascent" — the landing page. Started life at /landing-preview (branch
 * feat/landing-ascent-preview) and was promoted here after the design sign-off
 * and three audit passes; sections the redesign didn't alter are the original
 * landing components. Metadata comes from the root layout.
 */
export default function HomePage() {
    return (
        <main id="main-content" className="bg-background text-foreground font-sans w-full">
            {/* Page-scoped Lenis glide — destroyed on unmount, rest of the app unaffected. */}
            <SmoothScroll>
            <PreviewNav />
            <PreviewHero />
            <ProofScrub />
            {/* Narrative arc: promise → problem → product (three scrubbed chapters) → how → team → before/after → answers → launch */}
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
                transformed ancestor would fight the sticky pin. */}
            <PreviewCta />
            <LandingFooter />
            <AltitudeWash />
            </SmoothScroll>
        </main>
    );
}
