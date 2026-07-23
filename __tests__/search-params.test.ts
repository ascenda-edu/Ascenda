/**
 * Round-trip tests for the unified search page's filter serialization
 * (src/lib/university-search/search-params.ts):
 *   - SearchFilters → URL params → SearchFilters (discrete-param path)
 *   - SearchFilters → chips → SearchFilters (saved-search persistence path)
 *   - legacy `filters=group:value|…` token URLs (old shared /results links)
 */
import {
  ALL_TIERS,
  DEFAULT_FILTERS,
  TUITION_BOUNDS,
  buildSearchResultsUrl,
  buildSearchUrl,
  chipsToFilters,
  filtersToChips,
  isDefaultFilters,
  parseSearchParams,
  readFiltersFromParams,
  serializeFilters,
  type SearchFilters,
} from '@/lib/university-search/search-params';

const FULL_FILTERS: SearchFilters = {
  q: 'artificial intelligence',
  countries: ['United Kingdom', 'Singapore'],
  subjects: ['Computer Science', 'Business, Management'], // comma in value must survive
  levels: ['Bachelor'],
  tuitionMin: 10_000,
  tuitionMax: 40_000,
  ranking: 'wellKnown',
  testOptional: true,
  tiers: ['Reach', 'Match'],
  sort: 'tuition-asc',
  programId: null,
  universityId: null,
};

describe('search-params URL round-trip', () => {
  it('round-trips a fully-populated filter state through URL params', () => {
    const params = serializeFilters(FULL_FILTERS);
    expect(parseSearchParams(params)).toEqual(FULL_FILTERS);
  });

  it('round-trips defaults as an empty query string', () => {
    const params = serializeFilters(DEFAULT_FILTERS);
    expect(params.toString()).toBe('');
    expect(parseSearchParams(params)).toEqual(DEFAULT_FILTERS);
    expect(isDefaultFilters(parseSearchParams(params))).toBe(true);
  });

  it('round-trips drill-down ids', () => {
    const f: SearchFilters = { ...DEFAULT_FILTERS, programId: 'p-1', q: 'Medicine' };
    expect(parseSearchParams(serializeFilters(f))).toEqual(f);
  });

  it('builds /university-search/search URLs', () => {
    expect(buildSearchUrl(DEFAULT_FILTERS)).toBe('/university-search/search');
    expect(buildSearchUrl(FULL_FILTERS)).toContain('/university-search/search?');
  });

  it('clamps and rejects bad numeric params instead of propagating them', () => {
    const params = new URLSearchParams({ tmin: '-5', tmax: '999999999' });
    const parsed = parseSearchParams(params);
    expect(parsed.tuitionMin).toBeNull(); // negative → rejected
    expect(parsed.tuitionMax).toBe(TUITION_BOUNDS.max); // clamped
  });

  it('falls back to defaults on unknown enum values', () => {
    const params = new URLSearchParams({ rank: 'bogus', sort: 'bogus', tiers: 'bogus' });
    const parsed = parseSearchParams(params);
    expect(parsed.ranking).toBe('any');
    expect(parsed.sort).toBe('fit');
    expect(parsed.tiers).toEqual(ALL_TIERS);
  });
});

describe('saved-search chip round-trip', () => {
  it('round-trips every persistable facet through chips (q/tiers/ids excluded by design)', () => {
    const chips = filtersToChips(FULL_FILTERS);
    const restored = chipsToFilters(chips);
    expect(restored).toEqual({
      ...FULL_FILTERS,
      q: '', // chips deliberately exclude q — SaveSearchButton stores it separately
      tiers: ALL_TIERS,
      programId: null,
      universityId: null,
    });
  });

  it('readFiltersFromParams reads the NEW discrete params (SaveSearchButton forward path)', () => {
    const chips = readFiltersFromParams(serializeFilters(FULL_FILTERS));
    expect(chips).toEqual(filtersToChips(FULL_FILTERS));
    expect(chips.some((c) => c.group === 'tuitionMin' && c.value === '10000')).toBe(true);
  });

  it('drops legacy fitFocus/lifestyle chips without error', () => {
    const restored = chipsToFilters([
      { group: 'country', value: 'USA' },
      { group: 'fitFocus', value: 'On-campus' },
      { group: 'lifestyle', value: 'Big city' },
    ]);
    expect(restored.countries).toEqual(['USA']);
    expect(isDefaultFilters({ ...restored, countries: [] })).toBe(true);
  });
});

describe('parse hardening (F17)', () => {
  it('falls back to reader.get when getAll is unavailable (single-value reader)', () => {
    // Some param readers expose only `.get` (no `.getAll`) — the helper must
    // still resolve a single repeated-facet value.
    const singleValueReader = {
      get: (key: string) => (key === 'country' ? 'United Kingdom' : null),
    };
    const parsed = parseSearchParams(singleValueReader);
    expect(parsed.countries).toEqual(['United Kingdom']);
    expect(parsed.subjects).toEqual([]);
  });

  it('round-trips facet values containing % and & unscathed', () => {
    const f: SearchFilters = {
      ...DEFAULT_FILTERS,
      countries: ['Foo & Bar', '100% Online'],
      subjects: ['R&D, Applied'],
    };
    const parsed = parseSearchParams(serializeFilters(f));
    expect(parsed.countries).toEqual(f.countries);
    expect(parsed.subjects).toEqual(f.subjects);
  });

  it('treats empty-string params as absent', () => {
    const params = new URLSearchParams({ q: '', country: '', programId: '', universityId: '' });
    const parsed = parseSearchParams(params);
    expect(parsed.q).toBe('');
    expect(parsed.countries).toEqual([]);
    expect(parsed.programId).toBeNull();
    expect(parsed.universityId).toBeNull();
  });

  it('null-empties a whitespace-only drill-down id', () => {
    const params = new URLSearchParams({ programId: '   ' });
    expect(parseSearchParams(params).programId).toBeNull();
  });

  it('swaps an inverted tuition range (tmin > tmax)', () => {
    const params = new URLSearchParams({ tmin: '40000', tmax: '10000' });
    const parsed = parseSearchParams(params);
    expect(parsed.tuitionMin).toBe(10_000);
    expect(parsed.tuitionMax).toBe(40_000);
  });

  it('dedupes repeated tier values', () => {
    const params = new URLSearchParams({ tiers: 'Reach,Reach,Match,Reach' });
    expect(parseSearchParams(params).tiers).toEqual(['Reach', 'Match']);
  });
});

describe('legacy token URLs (old shared /results links)', () => {
  it('parses filters=group:value|… as a fallback', () => {
    const params = new URLSearchParams({
      q: 'engineering',
      filters: 'country:USA|country:Canada|subject:Engineering|lifestyle:Coastal',
    });
    const parsed = parseSearchParams(params);
    expect(parsed.q).toBe('engineering');
    expect(parsed.countries).toEqual(['USA', 'Canada']);
    expect(parsed.subjects).toEqual(['Engineering']);
    expect(parsed.levels).toEqual([]); // lifestyle dropped
  });

  it('discrete params win over the legacy token when both present', () => {
    const params = new URLSearchParams({ filters: 'country:USA' });
    params.append('country', 'Singapore');
    expect(parseSearchParams(params).countries).toEqual(['Singapore']);
  });

  it('legacy compat wrapper still emits working URLs from chips', () => {
    const url = buildSearchResultsUrl('physics', [{ group: 'country', value: 'USA' }]);
    expect(url).toContain('/university-search/search?');
    const parsed = parseSearchParams(new URLSearchParams(url.split('?')[1]));
    expect(parsed.q).toBe('physics');
    expect(parsed.countries).toEqual(['USA']);
  });
});
