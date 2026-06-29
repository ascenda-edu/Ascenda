// Single source of truth lives in the data adapter; re-exported here so the
// chart components can keep importing `CohortStats` from a local path.
// (Type-only re-export — erased from the client bundle.)
export type { CohortStats } from '@/lib/counsellor/data';
