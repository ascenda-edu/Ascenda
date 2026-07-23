import type { MatchTier } from '@/lib/matching/match-tier';

// The unified live search page. /university-search/results is a legacy
// redirect kept only so old bookmarked/shared URLs still resolve.
const SEARCH_PATH = '/university-search/search';
const LEGACY_FILTER_KEY = 'filters';

export type SortOption = 'fit' | 'tuition-asc' | 'tuition-desc' | 'ranking' | 'name';
export type RankingBand = 'any' | 'wellKnown' | 'topTier';

export const SORT_OPTIONS: SortOption[] = ['fit', 'tuition-asc', 'tuition-desc', 'ranking', 'name'];
export const ALL_TIERS: MatchTier[] = ['Reach', 'Match', 'Safe'];

// Bounds for the tuition range slider (GBP/year). Values are compared against
// programs.yearly_international_tuition_fee_gbp — the currency-normalised
// column — so a single GBP scale is correct across countries.
export const TUITION_BOUNDS = { min: 0, max: 100_000, step: 1_000 } as const;

/**
 * The single source of truth for everything the search page can filter and
 * sort by. URL params, saved-search chips, and the data hook all speak this
 * shape.
 */
export interface SearchFilters {
  q: string;
  /** universities.country — exact values from /api/search/filter-options */
  countries: string[];
  /** programs.field — exact values from /api/search/filter-options */
  subjects: string[];
  /** programs.study_level — exact values from /api/search/filter-options */
  levels: string[];
  /** GBP/year against yearly_international_tuition_fee_gbp; null = unbounded */
  tuitionMin: number | null;
  tuitionMax: number | null;
  /** wellKnown: recognition_score ≥ 5 · topTier: recognition_score ≥ 8 */
  ranking: RankingBand;
  /** universities.requires_test = false */
  testOptional: boolean;
  /** Client-side fit-tier filter over loaded results (existing behaviour) */
  tiers: MatchTier[];
  sort: SortOption;
  /** Suggestion drill-downs from the autocomplete */
  programId: string | null;
  universityId: string | null;
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  countries: [],
  subjects: [],
  levels: [],
  tuitionMin: null,
  tuitionMax: null,
  ranking: 'any',
  testOptional: false,
  tiers: ALL_TIERS,
  sort: 'fit',
  programId: null,
  universityId: null,
};

/** True when no constraint beyond the defaults is active (q included). */
export const isDefaultFilters = (f: SearchFilters): boolean =>
  !f.q &&
  !f.countries.length &&
  !f.subjects.length &&
  !f.levels.length &&
  f.tuitionMin === null &&
  f.tuitionMax === null &&
  f.ranking === 'any' &&
  !f.testOptional &&
  f.tiers.length === ALL_TIERS.length &&
  f.sort === 'fit' &&
  !f.programId &&
  !f.universityId;

// ---------------------------------------------------------------------------
// Saved-search chips.
//
// saved_searches.filters is a jsonb array of { group, value } and predates the
// facet redesign. Multi-value facets store one chip per value; scalar facets
// store a single chip whose value is the serialised scalar. Legacy groups
// `fitFocus` and `lifestyle` no longer map to anything the search can filter
// by (fitFocus filtered programs.mode, lifestyle never hard-filtered) — they
// parse without error and are dropped.
// ---------------------------------------------------------------------------

export type FilterGroupKey =
  | 'country'
  | 'subject'
  | 'level'
  | 'tuitionMin'
  | 'tuitionMax'
  | 'ranking'
  | 'testOptional'
  | 'sort'
  // Legacy groups — accepted when parsing old rows/URLs, never emitted.
  | 'fitFocus'
  | 'lifestyle';

export interface FilterChip {
  group: FilterGroupKey;
  value: string;
}

const VALID_GROUPS: FilterGroupKey[] = [
  'country',
  'subject',
  'level',
  'tuitionMin',
  'tuitionMax',
  'ranking',
  'testOptional',
  'sort',
  'fitFocus',
  'lifestyle',
];

const TOKEN_SEP = '|';
const PAIR_SEP = ':';

const isRankingBand = (v: string): v is RankingBand =>
  v === 'any' || v === 'wellKnown' || v === 'topTier';

const isSortOption = (v: string): v is SortOption => (SORT_OPTIONS as string[]).includes(v);

const parseBoundedInt = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, TUITION_BOUNDS.max);
};

/** Convert active filters into persistable chips (q/tiers/ids stay out — as before). */
export const filtersToChips = (f: SearchFilters): FilterChip[] => {
  const chips: FilterChip[] = [];
  f.countries.forEach((value) => chips.push({ group: 'country', value }));
  f.subjects.forEach((value) => chips.push({ group: 'subject', value }));
  f.levels.forEach((value) => chips.push({ group: 'level', value }));
  if (f.tuitionMin !== null) chips.push({ group: 'tuitionMin', value: String(f.tuitionMin) });
  if (f.tuitionMax !== null) chips.push({ group: 'tuitionMax', value: String(f.tuitionMax) });
  if (f.ranking !== 'any') chips.push({ group: 'ranking', value: f.ranking });
  if (f.testOptional) chips.push({ group: 'testOptional', value: 'true' });
  if (f.sort !== 'fit') chips.push({ group: 'sort', value: f.sort });
  return chips;
};

/** Inverse of filtersToChips. Unknown/legacy groups are dropped silently. */
export const chipsToFilters = (
  chips: Iterable<FilterChip>,
  base: SearchFilters = DEFAULT_FILTERS
): SearchFilters => {
  const f: SearchFilters = {
    ...base,
    countries: [],
    subjects: [],
    levels: [],
    tuitionMin: null,
    tuitionMax: null,
    ranking: 'any',
    testOptional: false,
    sort: 'fit',
  };
  for (const chip of chips) {
    switch (chip.group) {
      case 'country':
        f.countries.push(chip.value);
        break;
      case 'subject':
        f.subjects.push(chip.value);
        break;
      case 'level':
        f.levels.push(chip.value);
        break;
      case 'tuitionMin':
        f.tuitionMin = parseBoundedInt(chip.value);
        break;
      case 'tuitionMax':
        f.tuitionMax = parseBoundedInt(chip.value);
        break;
      case 'ranking':
        if (isRankingBand(chip.value)) f.ranking = chip.value;
        break;
      case 'testOptional':
        f.testOptional = chip.value === 'true';
        break;
      case 'sort':
        if (isSortOption(chip.value)) f.sort = chip.value;
        break;
      default:
        // fitFocus / lifestyle — legacy, no longer filterable.
        break;
    }
  }
  return f;
};

// ---------------------------------------------------------------------------
// URL serialisation. Discrete params, repeated for multi-value facets
// (facet values can themselves contain commas, e.g. field names).
// ---------------------------------------------------------------------------

type ParamsReader = Pick<URLSearchParams, 'get'> & Partial<Pick<URLSearchParams, 'getAll'>>;

const PARAM = {
  q: 'q',
  country: 'country',
  subject: 'subject',
  level: 'level',
  tuitionMin: 'tmin',
  tuitionMax: 'tmax',
  ranking: 'rank',
  testOptional: 'testopt',
  tiers: 'tiers',
  sort: 'sort',
  programId: 'programId',
  universityId: 'universityId',
} as const;

export const serializeFilters = (f: SearchFilters): URLSearchParams => {
  const params = new URLSearchParams();
  const q = f.q.trim();
  if (q) params.set(PARAM.q, q);
  f.countries.forEach((v) => params.append(PARAM.country, v));
  f.subjects.forEach((v) => params.append(PARAM.subject, v));
  f.levels.forEach((v) => params.append(PARAM.level, v));
  if (f.tuitionMin !== null) params.set(PARAM.tuitionMin, String(f.tuitionMin));
  if (f.tuitionMax !== null) params.set(PARAM.tuitionMax, String(f.tuitionMax));
  if (f.ranking !== 'any') params.set(PARAM.ranking, f.ranking);
  if (f.testOptional) params.set(PARAM.testOptional, 'true');
  if (f.tiers.length && f.tiers.length !== ALL_TIERS.length) {
    params.set(PARAM.tiers, f.tiers.join(','));
  }
  if (f.sort !== 'fit') params.set(PARAM.sort, f.sort);
  if (f.programId) params.set(PARAM.programId, f.programId);
  if (f.universityId) params.set(PARAM.universityId, f.universityId);
  return params;
};

const getAll = (reader: ParamsReader, key: string): string[] => {
  if (typeof reader.getAll === 'function') {
    return reader.getAll(key).map((v) => v.trim()).filter(Boolean);
  }
  const single = reader.get(key)?.trim();
  return single ? [single] : [];
};

const parseTiers = (raw: string | null): MatchTier[] => {
  if (!raw) return ALL_TIERS;
  const tiers = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t): t is MatchTier => (ALL_TIERS as string[]).includes(t));
  // Dedupe — a hand-edited/duplicated URL (`tiers=Reach,Reach`) must not carry
  // repeated values into state.
  return tiers.length ? [...new Set(tiers)] : ALL_TIERS;
};

/** "country:USA" → { group: 'country', value: 'USA' }. Returns null on bad input. */
const parseLegacyToken = (token: string): FilterChip | null => {
  const idx = token.indexOf(PAIR_SEP);
  if (idx < 0) return null;
  const group = token.slice(0, idx) as FilterGroupKey;
  const value = token.slice(idx + 1).trim();
  if (!VALID_GROUPS.includes(group) || !value) return null;
  return { group, value };
};

const readLegacyChips = (reader: ParamsReader): FilterChip[] => {
  const raw = reader.get(LEGACY_FILTER_KEY);
  if (!raw) return [];
  return raw
    .split(TOKEN_SEP)
    .map((token) => token.trim())
    .filter(Boolean)
    .map(parseLegacyToken)
    .filter((chip): chip is FilterChip => chip !== null);
};

/**
 * Read SearchFilters from URL params. Discrete params win; the legacy
 * `filters=group:value|…` token (old shared /results URLs) is the fallback.
 */
export const parseSearchParams = (reader: ParamsReader | null | undefined): SearchFilters => {
  if (!reader) return DEFAULT_FILTERS;

  const legacy = readLegacyChips(reader);
  const base = legacy.length ? chipsToFilters(legacy) : { ...DEFAULT_FILTERS };

  const countries = getAll(reader, PARAM.country);
  const subjects = getAll(reader, PARAM.subject);
  const levels = getAll(reader, PARAM.level);
  const rankRaw = reader.get(PARAM.ranking) ?? '';
  const sortRaw = reader.get(PARAM.sort) ?? '';

  // Swap an inverted tuition range (min > max) rather than propagating a range
  // that can never match — a shared/hand-edited URL with the bounds reversed
  // still resolves to the intended window.
  let tuitionMin = parseBoundedInt(reader.get(PARAM.tuitionMin)) ?? base.tuitionMin;
  let tuitionMax = parseBoundedInt(reader.get(PARAM.tuitionMax)) ?? base.tuitionMax;
  if (tuitionMin !== null && tuitionMax !== null && tuitionMin > tuitionMax) {
    [tuitionMin, tuitionMax] = [tuitionMax, tuitionMin];
  }

  return {
    ...base,
    q: reader.get(PARAM.q)?.trim() ?? '',
    countries: countries.length ? countries : base.countries,
    subjects: subjects.length ? subjects : base.subjects,
    levels: levels.length ? levels : base.levels,
    tuitionMin,
    tuitionMax,
    ranking: isRankingBand(rankRaw) ? rankRaw : base.ranking,
    testOptional: reader.get(PARAM.testOptional) === 'true' ? true : base.testOptional,
    tiers: parseTiers(reader.get(PARAM.tiers)),
    sort: isSortOption(sortRaw) ? sortRaw : base.sort,
    // Trim + null-empty so a whitespace-only id (`?programId=%20`) doesn't pin a
    // bogus drill-down.
    programId: reader.get(PARAM.programId)?.trim() || null,
    universityId: reader.get(PARAM.universityId)?.trim() || null,
  };
};

/** Canonical URL for a filter state. */
export const buildSearchUrl = (filters: SearchFilters): string => {
  const suffix = serializeFilters(filters).toString();
  return suffix ? `${SEARCH_PATH}?${suffix}` : SEARCH_PATH;
};

// ---------------------------------------------------------------------------
// Compat wrappers — existing callers (saved-searches row, save button, course
// back-links) keep their signatures; both now emit discrete-param /search URLs.
// ---------------------------------------------------------------------------

export const buildSearchResultsUrl = (query?: string, chips?: Iterable<FilterChip>) => {
  const filters = chipsToFilters(chips ?? []);
  filters.q = query?.trim() ?? '';
  return buildSearchUrl(filters);
};

/** Read persistable filter chips from URL params (SaveSearchButton). */
export const readFiltersFromParams = (reader: ParamsReader | null | undefined): FilterChip[] => {
  if (!reader) return [];
  return filtersToChips(parseSearchParams(reader));
};
