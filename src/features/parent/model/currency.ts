// Home-currency conversion for the parent portal.
//
// Programme money fields are GBP-native (`*_gbp` columns). Parents sit in
// other currencies, so /parent/finances converts for display: "£24,500
// (≈ $31,100)". Rates are a static snapshot — good enough for the demo's
// order-of-magnitude budgeting. TODO: replace with a live FX feed (Phase 3).

export const HOME_CURRENCIES = [
  { code: 'GBP', label: 'British Pound', symbol: '£', perGbp: 1 },
  { code: 'USD', label: 'US Dollar', symbol: '$', perGbp: 1.27 },
  { code: 'EUR', label: 'Euro', symbol: '€', perGbp: 1.17 },
  { code: 'CNY', label: 'Chinese Yuan', symbol: '¥', perGbp: 9.2 },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹', perGbp: 106 },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ', perGbp: 4.66 },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$', perGbp: 1.71 },
  { code: 'HKD', label: 'Hong Kong Dollar', symbol: 'HK$', perGbp: 9.9 },
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦', perGbp: 1960 },
  { code: 'KRW', label: 'South Korean Won', symbol: '₩', perGbp: 1740 },
] as const;

export type HomeCurrencyCode = (typeof HOME_CURRENCIES)[number]['code'];

export const DEFAULT_HOME_CURRENCY: HomeCurrencyCode = 'USD';

/** localStorage key for the parent's chosen home currency. */
export const HOME_CURRENCY_STORAGE_KEY = 'ascenda-parent-home-currency';

export const isHomeCurrencyCode = (value: unknown): value is HomeCurrencyCode =>
  HOME_CURRENCIES.some((c) => c.code === value);

export const convertFromGbp = (amountGbp: number, code: HomeCurrencyCode): number => {
  const currency = HOME_CURRENCIES.find((c) => c.code === code) ?? HOME_CURRENCIES[0];
  return amountGbp * currency.perGbp;
};

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export const formatGbp = (amountGbp: number): string => gbpFormatter.format(amountGbp);

/** "£24,500" for GBP; "£24,500 (≈ $31,100)" for anything else. */
export const formatWithHomeCurrency = (amountGbp: number, code: HomeCurrencyCode): string => {
  if (code === 'GBP') return formatGbp(amountGbp);
  const converted = convertFromGbp(amountGbp, code);
  const home = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(converted);
  return `${formatGbp(amountGbp)} (≈ ${home})`;
};

/** Just the home-currency figure, e.g. "$31,100" (GBP falls back to £). */
export const formatHomeOnly = (amountGbp: number, code: HomeCurrencyCode): string => {
  if (code === 'GBP') return formatGbp(amountGbp);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(convertFromGbp(amountGbp, code));
};
