import { HeartHandshake } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

// Rendered by every /parent route when the signed-in account has no active
// guardian_links rows. Deliberately a dead end — the portal never falls back
// to showing unlinked students.
export function NoLinkedChildren() {
  return (
    <EmptyState
      icon={HeartHandshake}
      title="No linked student yet"
      description="Your account isn't linked to a student. Once your school's counsellor links you to your child, their progress, deadlines, and costs will appear here."
      hint="Ask your counsellor to set up the link — it only takes a moment."
    />
  );
}
