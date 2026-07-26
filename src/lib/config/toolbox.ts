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
// kinds — not a status scale, so the tone tokens are being used for their hue
// rather than their meaning. `interest: danger` in particular reads oddly: it is
// the rose this UI already used, not an assertion that interests are a problem.
//
// The chart --series-N tokens would be the semantically correct family, but there
// are only five validated slots (a sixth distinguishable hue doesn't exist in the
// lightness band — see chart-palette.ts), and there are six categories here. Six
// tones with the right hues beat five with the right names.
//
// The previous values had no `dark:` variants on the borders and hardcoded
// indigo/sky/amber/rose/emerald/violet; the tokens carry both themes.
export const CATEGORY_CONFIG: Record<BlockCategory, { icon: typeof Globe; label: string; color: string; bg: string }> = {
  identity: { icon: User, label: 'Identity', color: 'text-primary-ink', bg: 'bg-primary/10 border-primary/25' },
  experience: { icon: Globe, label: 'Experience', color: 'text-info', bg: 'bg-info-subtle border-info/25' },
  strength: { icon: Star, label: 'Strengths', color: 'text-warning', bg: 'bg-warning-subtle border-warning/25' },
  interest: { icon: Heart, label: 'Interests', color: 'text-danger', bg: 'bg-danger-subtle border-danger/25' },
  achievement: { icon: Trophy, label: 'Achievements', color: 'text-success', bg: 'bg-success-subtle border-success/25' },
  counsellor_insight: { icon: MessageSquare, label: 'Counsellor', color: 'text-feature', bg: 'bg-feature-subtle border-feature/25' },
};

export const CATEGORY_ORDER: BlockCategory[] = ['identity', 'experience', 'strength', 'interest', 'achievement', 'counsellor_insight'];
