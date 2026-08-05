import {
  Globe,
  Star,
  Heart,
  Trophy,
  User,
  MessageSquare,
} from 'lucide-react';
import type { BlockCategory } from '@/lib/data/student-demo-data';

// Essay building-block categories. These are CATEGORICAL — six mutually exclusive
// kinds — not a status scale.
//
// This carried six distinct status hues, and the note that used to sit here had
// already spotted why that was wrong ("the tone tokens are being used for their
// hue rather than their meaning; `interest: danger` reads oddly"), then kept
// them anyway on the grounds that the --series-N ramp only has five slots for
// six categories.
//
// That traded away the wrong thing. The premise — that six categories need six
// distinguishable colours — doesn't hold here: essay-workshop.tsx renders these
// GROUPED, one collapsible section per category with its own label and icon
// (CATEGORY_ORDER.map → filter by category). Nothing is interleaved, so there is
// nothing for colour to disambiguate. The heading does that work already.
//
// So all six share the brand tint, except counsellor_insight, which keeps
// `feature` because "this came from your counsellor" is a real distinction the
// app makes everywhere (see globals.css: feature = counsellor-flavoured) — and
// it now actually stands out, which it could not when all six were coloured.
export const CATEGORY_CONFIG: Record<BlockCategory, { icon: typeof Globe; label: string; color: string; bg: string }> = {
  identity: { icon: User, label: 'Identity', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  experience: { icon: Globe, label: 'Experience', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  strength: { icon: Star, label: 'Strengths', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  interest: { icon: Heart, label: 'Interests', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  achievement: { icon: Trophy, label: 'Achievements', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  counsellor_insight: { icon: MessageSquare, label: 'Counsellor', color: 'text-feature', bg: 'bg-feature-subtle border-feature/25' },
};

export const CATEGORY_ORDER: BlockCategory[] = ['identity', 'experience', 'strength', 'interest', 'achievement', 'counsellor_insight'];
