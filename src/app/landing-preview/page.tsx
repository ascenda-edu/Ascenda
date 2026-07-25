import type { Metadata } from 'next';
import { ShortlistSection } from '@/components/landing/ShortlistSection';
import { TeamSection } from '@/components/landing/TeamSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { PreviewNav } from '@/components/landing-preview/preview-nav';
import { PreviewHero } from '@/components/landing-preview/preview-hero';
import { ProofScrub } from '@/components/landing-preview/proof-scrub';
import { ChapterIntro, SceneCatalogue, SceneFit, ScenePlan } from '@/components/landing-preview/scenes';
import { ComparisonSettle } from '@/components/landing-preview/comparison-settle';
import { PreviewBanner } from '@/components/landing-preview/preview-banner';
import { AltitudeWash } from '@/components/landing-preview/altitude-wash';
import { SectionReveal } from '@/components/landing-preview/section-reveal';

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
            <SectionReveal>
                <CTASection />
            </SectionReveal>
            <LandingFooter />
            <AltitudeWash />
            <PreviewBanner />
        </main>
    );
}
