// Active-child selection for the /parent section.
//
// The choice is stored in a cookie (not localStorage) so server components
// can read it. pickActiveChild (lib/parent/data.ts) guarantees the resolved
// child is one of the parent's guardian_links — an unknown/stale cookie value
// silently falls back to the first linked child.

export const ACTIVE_CHILD_COOKIE = 'ascenda-parent-child';
