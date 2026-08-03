// Legacy redirect. The unified live search now lives at
// /university-search/search — this route exists ONLY so old bookmarked or
// shared /results URLs still resolve. We forward every query param verbatim
// (including the legacy `filters=group:value|…` token); parseSearchParams on
// the destination understands both the new discrete params and the old token,
// so nothing is lost in the hop.
//
// This is a SERVER component on purpose. It used to be a 'use client' page that
// mounted Suspense + useSearchParams + a spinner just to call router.replace,
// which meant shipping a client chunk and paying a render before the browser
// was told to go anywhere. `redirect()` issues the hop server-side instead —
// no client JS, no spinner frame. See docs/audit/08-performance.md.

import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function UniversitySearchResultsRedirect({
  searchParams,
}: {
  // Next 15: searchParams is a Promise on dynamic pages.
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Rebuild the query string verbatim, preserving repeated keys
  // (?country=UK&country=US) exactly as URLSearchParams.toString() did on the
  // client. Undefined values are dropped, matching the old behaviour.
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) forwarded.append(key, entry);
    } else {
      forwarded.append(key, value);
    }
  }

  const qs = forwarded.toString();
  redirect(qs ? `/university-search/search?${qs}` : '/university-search/search');
}
