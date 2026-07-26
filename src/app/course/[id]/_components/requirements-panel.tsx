'use client';

import { HEADLINE_REQUIREMENT_LABELS } from './course-data';
import { RequirementRenderer } from './requirement-renderer';
import { PanelEmpty, PanelHeading } from './tiles';
import type { Requirement } from './types';

/**
 * Splits a headline requirement ("36 points, HL 6,6,5 including Maths") into the
 * number you scan for and the conditions underneath it.
 */
const splitHeadline = (value: string) => {
  const separator = value.match(/[,;]/);
  const splitIndex = separator?.index ?? -1;
  if (splitIndex === -1) return { headline: value, items: [] as string[] };

  const headline = value.substring(0, splitIndex);
  const items = value
    .substring(splitIndex + 1)
    .trim()
    .split(/;|(?<=\w), /)
    .map((s) => s.trim())
    .filter(Boolean);

  return { headline, items };
};

export function RequirementsPanel({ requirements }: { requirements: Requirement[] }) {
  const headline = requirements.filter((r) => HEADLINE_REQUIREMENT_LABELS.includes(r.label));
  const detailed = requirements.filter((r) => !HEADLINE_REQUIREMENT_LABELS.includes(r.label));

  return (
    <div className="space-y-6">
      <PanelHeading>Entry Requirements</PanelHeading>

      {headline.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {headline.map((req, idx) => {
            const { headline: figure, items } = splitHeadline(req.value);
            return (
              <div key={idx} className="surface-stat bg-gradient-to-br from-primary/5 to-transparent">
                <p className="eyebrow text-primary-ink">{req.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{figure}</p>
                {items.length ? (
                  <ul className="mt-2 space-y-1">
                    {items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs font-medium leading-snug text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {detailed.length ? (
        <div className="space-y-4">
          {detailed.map((req, idx) => (
            <section key={idx} className="surface-card p-0">
              <h3 className="border-b border-border/40 bg-muted/30 px-6 py-4 text-lg font-semibold text-foreground">
                {req.label}
              </h3>
              <div className="p-6">
                <RequirementRenderer value={req.value} />
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {requirements.length === 0 ? <PanelEmpty>No specific entry requirements listed.</PanelEmpty> : null}
    </div>
  );
}
