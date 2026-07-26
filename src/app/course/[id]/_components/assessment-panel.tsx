'use client';

import { RichText } from './rich-text';
import { SectionCard } from './tiles';

export function AssessmentPanel({ assessment }: { assessment?: string | null }) {
  return (
    <SectionCard title="Assessment Methods" headingAs="h2">
      {assessment ? (
        <RichText text={assessment} />
      ) : (
        <p className="text-sm text-muted-foreground">No assessment information available.</p>
      )}
    </SectionCard>
  );
}
