import type { Metadata } from 'next';
import { DEMO_BUILDING_BLOCKS, DEMO_ESSAY_PROMPTS, DEMO_ACTIVITIES } from '@/lib/data/student-demo-data';
import { EssayWorkshopLazy } from '@/components/toolbox/essay-workshop-lazy';

export const metadata: Metadata = { title: 'Essay workshop' };

export default function EssayWorkshopPage() {
  return (
    <EssayWorkshopLazy blocks={DEMO_BUILDING_BLOCKS} prompts={DEMO_ESSAY_PROMPTS} activities={DEMO_ACTIVITIES} />
  );
}
