/**
 * Icons for the wizard's choice cards.
 *
 * ── WHY THIS EXISTS: it replaces emoji ───────────────────────────────────────
 * Every one of these was an emoji in the markup (💻 for computer science, ⚖️ for
 * law, 🏛 for a large campus). That was the single least premium thing on the
 * surface, and the reasons are mechanical rather than aesthetic:
 *
 *   - Emoji are rendered by the OS. The same card is a flat glyph on Windows, a
 *     glossy 3D blob on Apple platforms and a different hue again on Android, so
 *     the set can never be art-directed and never matches the icon weight used
 *     everywhere else in the product.
 *   - They do not inherit `currentColor`. A selected card tints its tile and its
 *     label; an emoji inside it stayed the same colour, so selection read as a
 *     border switching on rather than one object changing state.
 *   - They carry unintended tone. 🩺 next to "Medicine & dentistry" is fine; 🎨
 *     next to a student's career decision is not.
 *
 * ── WHY LUCIDE RATHER THAN HAND-DRAWN PATHS ─────────────────────────────────
 * `lucide-react` is already a dependency (pinned at 0.577.0 — 1.x drops the
 * deprecated aliases this codebase uses) and is tree-shaken per icon, so this
 * costs only the glyphs actually named here. It also gets consistent stroke weight
 * and optical sizing BY CONSTRUCTION.
 *
 * A hand-drawn set was tried first and three of its glyphs failed at the size they
 * actually render: a drafting compass resolved as a capital "A", a palette with
 * four dots read as a face, and a DNA helix was indistinguishable from scissors
 * below about 32px. That is the work Lucide has already done properly.
 */

import {
  Award,
  Blend,
  BookOpen,
  Brush,
  Building,
  Building2,
  CircleDashed,
  CodeXml,
  Cog,
  Dna,
  FlaskConical,
  Globe,
  House,
  Landmark,
  Presentation,
  Scale,
  School,
  Shapes,
  Sigma,
  Sparkles,
  Stethoscope,
  Trees,
  TrendingUp,
  type LucideIcon
} from 'lucide-react';

import type { IntendedCluster, ProgrammeType } from '@/lib/profile/intake-types';

/**
 * One icon per subject cluster. Keyed off `IntendedCluster` so a new cluster in
 * `intake-types.ts` is a type error here rather than a silently missing glyph.
 */
export const CLUSTER_ICONS: Record<IntendedCluster, LucideIcon> = {
  computer_science: CodeXml,
  // `Sigma`, not a compass or a protractor: summation is unambiguous at 20px and
  // does not collide with the ascending line used for economics.
  maths: Sigma,
  engineering: Cog,
  life_sciences_biochem: Dna,
  medicine_dentistry: Stethoscope,
  economics_quant: TrendingUp,
  business_non_quant: Building2,
  law: Scale,
  humanities: BookOpen,
  creative: Brush
};

/**
 * `ProgrammeType` carries a third member, `ACT`, which the wizard never offers as a
 * choice — the qualification question renders IB and A-levels only. It is covered
 * here anyway so the `Record` stays exhaustive: a `Partial` would compile while
 * quietly allowing a real gap if the option list ever grows.
 */
export const PROGRAMME_ICONS: Record<ProgrammeType, LucideIcon> = {
  IB: Globe,
  A_LEVEL: Award,
  ACT: Award
};

/**
 * The lifestyle groups. Keys are the values the form actually submits — checked
 * against the `<Chip>` option tables in the wizard and the enums in
 * `intake-schema.ts`, NOT invented. `''` is the "No preference" option for
 * teaching style, which is stored as an empty string rather than a sentinel.
 */
export const TEACHING_ICONS: Record<string, LucideIcon> = {
  academic: Presentation,
  practical: FlaskConical,
  mixed: Blend,
  '': CircleDashed
};

export const LOCATION_ICONS: Record<string, LucideIcon> = {
  capital_city: Landmark,
  major_city: Building2,
  smaller_city: Building,
  suburban: Trees,
  no_preference: CircleDashed
};

export const CAMPUS_ICONS: Record<string, LucideIcon> = {
  small: House,
  medium: School,
  large: Building2,
  no_preference: CircleDashed
};

/**
 * Group icon lookups are BY VALUE and the tables above are keyed by string rather
 * than a union, because two of these groups accept `''` / `no_preference`. A missing
 * key falls back rather than rendering nothing, so an option added to the form
 * without an icon degrades to a neutral glyph instead of a hole in the card.
 */
export const iconFor = (
  table: Record<string, LucideIcon>,
  value: string
): LucideIcon => table[value] ?? Shapes;

/** Marks something the app filled in or inferred, never something the student typed. */
export const INFERRED_ICON = Sparkles;
