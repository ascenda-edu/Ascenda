// Single source of truth for the demo counsellor persona. The counsellor side
// runs on real Supabase data, so wherever a real profile id is available the
// resolved `profiles.full_name` must win — this constant is only the fallback
// for drafts, empty states and branding when no counsellor can be resolved.
export const DEMO_COUNSELLOR = {
  firstName: 'Sarah',
  fullName: 'Sarah Mitchell'
} as const;
