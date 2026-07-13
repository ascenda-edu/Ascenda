// Maps a free-text nationality (or country) to a flag emoji.
//
// The counsellor UI shows a per-student flag. Real student rows store a free-text
// `nationality` ("Indian", "Nigerian") and a `resident_country` ("India", "UK").
// We resolve either to an ISO-3166 alpha-2 code, then to a regional-indicator
// emoji. Falls back to 🎓 when unknown.

const ISO_BY_NAME: Record<string, string> = {
  // nationalities (adjective form)
  indian: 'IN', chinese: 'CN', 'hong kong': 'HK', 'hong kong sar': 'HK',
  japanese: 'JP', korean: 'KR', singaporean: 'SG', malaysian: 'MY',
  thai: 'TH', vietnamese: 'VN', indonesian: 'ID', filipino: 'PH', pakistani: 'PK',
  bangladeshi: 'BD', emirati: 'AE', saudi: 'SA', qatari: 'QA', kuwaiti: 'KW',
  lebanese: 'LB', turkish: 'TR', egyptian: 'EG', nigerian: 'NG', ghanaian: 'GH',
  kenyan: 'KE', 'south african': 'ZA', moroccan: 'MA', american: 'US',
  canadian: 'CA', mexican: 'MX', brazilian: 'BR', argentine: 'AR', argentinian: 'AR',
  chilean: 'CL', colombian: 'CO', peruvian: 'PE', british: 'GB', english: 'GB',
  irish: 'IE', scottish: 'GB', french: 'FR', german: 'DE', italian: 'IT',
  spanish: 'ES', portuguese: 'PT', dutch: 'NL', belgian: 'BE', swiss: 'CH',
  austrian: 'AT', swedish: 'SE', norwegian: 'NO', danish: 'DK', finnish: 'FI',
  polish: 'PL', greek: 'GR', russian: 'RU', ukrainian: 'UA', romanian: 'RO',
  czech: 'CZ', hungarian: 'HU', australian: 'AU', 'new zealander': 'NZ', kiwi: 'NZ',
  // country names
  india: 'IN', china: 'CN', japan: 'JP', 'south korea': 'KR', korea: 'KR',
  singapore: 'SG', malaysia: 'MY', thailand: 'TH', vietnam: 'VN', indonesia: 'ID',
  philippines: 'PH', pakistan: 'PK', bangladesh: 'BD', uae: 'AE',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', qatar: 'QA', kuwait: 'KW',
  lebanon: 'LB', turkey: 'TR', egypt: 'EG', nigeria: 'NG', ghana: 'GH', kenya: 'KE',
  'south africa': 'ZA', morocco: 'MA', usa: 'US', 'united states': 'US',
  'united states of america': 'US', canada: 'CA', mexico: 'MX', brazil: 'BR',
  argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE', uk: 'GB',
  'united kingdom': 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB',
  ireland: 'IE', france: 'FR', germany: 'DE', italy: 'IT', spain: 'ES',
  portugal: 'PT', netherlands: 'NL', belgium: 'BE', switzerland: 'CH',
  austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  poland: 'PL', greece: 'GR', russia: 'RU', ukraine: 'UA', romania: 'RO',
  'czech republic': 'CZ', czechia: 'CZ', hungary: 'HU', australia: 'AU',
  'new zealand': 'NZ',
};

const isoToEmoji = (iso: string): string =>
  iso
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + (c.charCodeAt(0) - 65)))
    .join('');

const lookup = (value?: string | null): string | null => {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  if (ISO_BY_NAME[key]) return ISO_BY_NAME[key];
  // last-ditch: an explicit 2-letter ISO code
  if (/^[a-z]{2}$/.test(key)) return key.toUpperCase();
  return null;
};

export const flagEmoji = (nationality?: string | null, fallbackCountry?: string | null): string => {
  const iso = lookup(nationality) ?? lookup(fallbackCountry);
  return iso ? isoToEmoji(iso) : '🎓';
};
