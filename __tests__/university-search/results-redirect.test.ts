/**
 * Guards the legacy /university-search/results → /university-search/search hop.
 *
 * This route used to be a `'use client'` page that mounted Suspense +
 * useSearchParams + a spinner purely to call `router.replace`. It is now a
 * server component calling `redirect()`, which ships no client JS at all
 * (measured: 635 B → 279 B page-specific, and the route drops out of the
 * client manifest entirely).
 *
 * The behaviour that MUST NOT change is query-param forwarding. Old shared and
 * bookmarked links carry the legacy `filters=group:value|…` token, which
 * parseSearchParams on the destination still understands — but only if the hop
 * preserves it byte-for-byte, including the `:` / `|` percent-encoding that
 * URLSearchParams applies. These assertions pin exactly what the old
 * `useSearchParams().toString()` produced.
 */
import { redirect } from 'next/navigation';
import UniversitySearchResultsRedirect from '@/app/university-search/results/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const redirectMock = redirect as unknown as jest.Mock;

/** Runs the page with a given query object and returns the redirect target. */
const targetFor = async (params: Record<string, string | string[] | undefined>) => {
  redirectMock.mockClear();
  await UniversitySearchResultsRedirect({ searchParams: Promise.resolve(params) });
  expect(redirectMock).toHaveBeenCalledTimes(1);
  return redirectMock.mock.calls[0][0] as string;
};

describe('/university-search/results legacy redirect', () => {
  it('redirects to the bare search page when there are no params', async () => {
    expect(await targetFor({})).toBe('/university-search/search');
  });

  it('forwards discrete params', async () => {
    expect(await targetFor({ q: 'law', tier: 'safety' })).toBe(
      '/university-search/search?q=law&tier=safety'
    );
  });

  it('preserves repeated keys as repeated keys, not as a comma-joined string', async () => {
    // Next parses ?country=UK&country=US into an array. Joining it would
    // silently corrupt the filter into a single value named "UK,US".
    expect(await targetFor({ country: ['UK', 'US'] })).toBe(
      '/university-search/search?country=UK&country=US'
    );
  });

  it('preserves the legacy filters token with its encoding intact', async () => {
    expect(await targetFor({ filters: 'country:UK|subject:Law' })).toBe(
      '/university-search/search?filters=country%3AUK%7Csubject%3ALaw'
    );
  });

  it('keeps a value that needs escaping escaped exactly once', async () => {
    expect(await targetFor({ q: 'computer science & ai' })).toBe(
      '/university-search/search?q=computer+science+%26+ai'
    );
  });

  it('drops undefined values rather than emitting the string "undefined"', async () => {
    expect(await targetFor({ q: 'law', tier: undefined })).toBe(
      '/university-search/search?q=law'
    );
  });

  it('keeps a valueless key as an empty-valued key', async () => {
    // ?debug alone parses to '' — matching what URLSearchParams.toString()
    // produced on the client.
    expect(await targetFor({ debug: '' })).toBe('/university-search/search?debug=');
  });
});
