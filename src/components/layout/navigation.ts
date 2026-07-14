import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Inbox,
  LayoutDashboard,
  Search,
  Settings,
  Sparkles,
  UserCircle,
  Users,
  Target,
  MessageSquare,
  Layers
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  matchers?: Array<(pathname: string) => boolean>;
  segment: 'home' | 'explore' | 'planner' | 'inbox' | 'scholarships' | 'profile' | 'toolbox' | 'admin' | 'counsellor';
};

export type SectionNavItem = {
  label: string;
  href: string;
  matchParam?: { key: string; value: string };
  exact?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  // Student items
  {
    label: 'Home',
    href: '/dashboard',
    icon: LayoutDashboard,
    segment: 'home'
  },
  {
    label: 'Explore',
    href: '/university-search/search',
    icon: Search,
    segment: 'explore',
    matchers: [
      (pathname) => pathname.startsWith('/university-search'),
      (pathname) => pathname.startsWith('/matches'),
      (pathname) => pathname.startsWith('/course/'),
      (pathname) => pathname.startsWith('/shortlist')
    ]
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardCheck,
    segment: 'planner',
    matchers: [(pathname) => pathname.startsWith('/applications')]
  },
  {
    label: 'Inbox',
    href: '/inbox',
    icon: Inbox,
    segment: 'inbox'
  },
  {
    label: 'Scholarships',
    href: '/scholarships',
    icon: Award,
    segment: 'scholarships'
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: UserCircle,
    segment: 'profile'
  },
  {
    label: 'Toolbox',
    href: '/toolbox',
    icon: Sparkles,
    segment: 'toolbox',
    matchers: [(pathname) => pathname.startsWith('/toolbox')]
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: Settings,
    segment: 'admin'
  },
  // Counsellor items (only shown when session role is 'counsellor')
  {
    label: 'Overview',
    href: '/counsellor',
    icon: LayoutDashboard,
    segment: 'counsellor',
    exact: true
  },
  {
    label: 'Inbox',
    href: '/counsellor/inbox',
    icon: Inbox,
    segment: 'counsellor'
  },
  {
    label: 'Students',
    href: '/counsellor/students',
    icon: Users,
    segment: 'counsellor',
    matchers: [(pathname) => pathname.startsWith('/counsellor/students')]
  },
  {
    label: 'Universities',
    href: '/counsellor/universities',
    icon: Layers,
    segment: 'counsellor',
    matchers: [(pathname) => pathname.startsWith('/counsellor/universities')]
  },
  {
    label: 'Analytics',
    href: '/counsellor/analytics',
    icon: BarChart2,
    segment: 'counsellor'
  },
  {
    label: 'Deadlines',
    href: '/counsellor/deadlines',
    icon: CalendarClock,
    segment: 'counsellor'
  },
  {
    label: 'Documents',
    href: '/counsellor/documents',
    icon: FileText,
    segment: 'counsellor'
  },
  {
    label: 'Outcomes',
    href: '/counsellor/outcomes',
    icon: Target,
    segment: 'counsellor'
  },
  {
    label: 'Applications',
    href: '/counsellor/applications',
    icon: ClipboardCheck,
    segment: 'counsellor'
  },
  {
    label: 'Parents',
    href: '/counsellor/parents',
    icon: MessageSquare,
    segment: 'counsellor'
  }
];

export const EXPLORE_SECTION_ITEMS: SectionNavItem[] = [
  { label: 'Search', href: '/university-search/search' },
  { label: 'Matches', href: '/matches' },
  { label: 'Shortlist', href: '/university-search/shortlist' },
  { label: 'Quests', href: '/university-search/quests' }
];

export const PLANNER_SECTION_ITEMS: SectionNavItem[] = [
  { label: 'Applications', href: '/applications', exact: true },
  { label: 'Tasks', href: '/applications/tasks' },
  { label: 'Documents', href: '/applications/documents' }
];

export const TOOLBOX_SECTION_ITEMS: SectionNavItem[] = [
  { label: 'Hub', href: '/toolbox', exact: true },
  { label: 'Essay Workshop', href: '/toolbox/essay-workshop' },
  { label: 'Chances', href: '/toolbox/chances' },
  { label: 'Requirements', href: '/toolbox/requirements' },
  { label: 'Timeline', href: '/toolbox/timeline' },
];

export const COUNSELLOR_SECTION_ITEMS: SectionNavItem[] = [
  { label: 'Overview', href: '/counsellor', exact: true },
  { label: 'Inbox', href: '/counsellor/inbox' },
  { label: 'Students', href: '/counsellor/students' },
  { label: 'Universities', href: '/counsellor/universities' },
  { label: 'Analytics', href: '/counsellor/analytics' },
  { label: 'Deadlines', href: '/counsellor/deadlines' },
  { label: 'Documents', href: '/counsellor/documents' },
  { label: 'Outcomes', href: '/counsellor/outcomes' },
  { label: 'Applications', href: '/counsellor/applications' },
  { label: 'Parents', href: '/counsellor/parents' },
];

export const isNavActive = (item: NavItem, pathname: string) => {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  if (pathname.startsWith(`${item.href}/`)) return true;
  return item.matchers?.some((matcher) => matcher(pathname)) ?? false;
};

export const filterNavByRole = (items: NavItem[], role: string | null | undefined, pathname?: string) => {
  // Demo mode: determine active section from the current route so that
  // a single profile can navigate both student and counsellor views.
  const inCounsellor = pathname?.startsWith('/counsellor');

  if (inCounsellor) {
    return items.filter((item) => item.segment === 'counsellor');
  }

  return items.filter(
    (item) => item.segment !== 'counsellor' && (item.segment !== 'admin' || role === 'admin')
  );
};

// ── Top-bar navigation ────────────────────────────────────────────────────
// The horizontal top bar can only fit a handful of pills. The counsellor IA
// has 10 sections, so on that side we collapse related destinations into
// dropdowns — the full set stays reachable, the bar stays uncrowded and
// visually consistent with the ~7-item student bar. The sidebar is unchanged
// (it still lists all 10 flat). Student/admin bars stay a flat link list.

export type TopNavEntry =
  | { type: 'link'; item: NavItem }
  | { type: 'group'; label: string; icon: LucideIcon; items: NavItem[] };

// Counsellor top-bar layout, expressed as hrefs into NAV_ITEMS so labels and
// icons stay defined in one place. Groups appear as dropdowns; bare hrefs as
// direct links. Reorder / regroup here to reshape the bar.
type CounsellorTopSpec =
  | { href: string }
  | { group: string; icon: LucideIcon; hrefs: string[] };

const COUNSELLOR_TOP_NAV: CounsellorTopSpec[] = [
  { href: '/counsellor' },
  { href: '/counsellor/inbox' },
  { href: '/counsellor/students' },
  {
    group: 'Applications',
    icon: ClipboardCheck,
    hrefs: [
      '/counsellor/applications',
      '/counsellor/deadlines',
      '/counsellor/documents',
      '/counsellor/outcomes'
    ]
  },
  { href: '/counsellor/analytics' },
  { href: '/counsellor/universities' },
  { href: '/counsellor/parents' }
];

// Build the ordered top-bar entries for the current context. Student/admin get
// their role-filtered items as flat links; counsellor gets the grouped layout.
export const getTopNavEntries = (
  items: NavItem[],
  role: string | null | undefined,
  pathname?: string
): TopNavEntry[] => {
  const filtered = filterNavByRole(items, role, pathname);

  if (!pathname?.startsWith('/counsellor')) {
    return filtered.map((item) => ({ type: 'link', item }));
  }

  const byHref = new Map(filtered.map((item) => [item.href, item]));
  return COUNSELLOR_TOP_NAV.reduce<TopNavEntry[]>((entries, spec) => {
    if ('group' in spec) {
      const groupItems = spec.hrefs
        .map((href) => byHref.get(href))
        .filter((item): item is NavItem => Boolean(item));
      if (groupItems.length > 0) {
        entries.push({ type: 'group', label: spec.group, icon: spec.icon, items: groupItems });
      }
    } else {
      const item = byHref.get(spec.href);
      if (item) entries.push({ type: 'link', item });
    }
    return entries;
  }, []);
};
