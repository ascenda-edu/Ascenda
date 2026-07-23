import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { ShortlistSection } from '@/components/landing/ShortlistSection';
import { ComparisonSection } from '@/components/landing/ComparisonSection';
import { ProofPointsSection } from '@/components/landing/ProofPointsSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { StickyNav } from '@/components/landing/StickyNav';

export default function HomePage() {
  return (
    <main
      id="main-content"
      className="bg-background text-foreground font-sans w-full"
    >
      {/* Slim companion bar — appears only after the hero's own header scrolls away */}
      <StickyNav />
      {/* Narrative arc: promise → problem → product → how it works → before/after → answers → CTA */}
      <HeroSection />
      <ProofPointsSection />
      <FeaturesSection />
      <ShortlistSection />
      <ComparisonSection />
      <FAQSection />
      <CTASection />
      <LandingFooter />
    </main>
  );
}
