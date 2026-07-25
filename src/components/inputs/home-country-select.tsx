'use client';

import React from 'react';

type CountryOption = {
  code: string;
  label: string;
};

const FALLBACK_COUNTRIES: CountryOption[] = [
  { code: 'AU', label: 'Australia' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'IN', label: 'India' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'SG', label: 'Singapore' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'IE', label: 'Ireland' },
  { code: 'DE', label: 'Germany' }
];

const getCountryOptions = (): CountryOption[] => {
  if (typeof Intl?.supportedValuesOf === 'function' && typeof Intl.DisplayNames === 'function') {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
      const codes = (Intl as any).supportedValuesOf('region').filter((code: string) => /^[A-Z]{2}$/.test(code));
      return codes
        .map((code: string) => ({
          code,
          label: displayNames.of(code) ?? code
        }))
        .filter((option: { code: string; label: string }) => Boolean(option.label))
        .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
    } catch {
      // Intl.supportedValuesOf('region') is not universally implemented; fall
      // through to the hand-maintained fallback list. Nothing to report — the
      // component still renders a usable set of countries.
    }
  }
  return FALLBACK_COUNTRIES;
};

const COUNTRY_OPTIONS = getCountryOptions();
const COUNTRY_CODE_LOOKUP = new Map(COUNTRY_OPTIONS.map((entry) => [entry.code, entry.label]));
const COUNTRY_LABEL_LOOKUP = new Map(COUNTRY_OPTIONS.map((entry) => [entry.label, entry.code]));

interface HomeCountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
}

export const HomeCountrySelect = ({ value, onChange, id, name }: HomeCountrySelectProps) => {
  const normalizedValue = (() => {
    if (COUNTRY_CODE_LOOKUP.has(value)) return value;
    const fallbackCode = COUNTRY_LABEL_LOOKUP.get(value);
    return fallbackCode ?? '';
  })();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  };

  return (
    <select
      id={id}
      name={name}
      value={normalizedValue}
      onChange={handleChange}
      className="form-input"
    >
      <option value="">Select a country</option>
      {COUNTRY_OPTIONS.map((country) => (
        <option key={country.code} value={country.code}>
          {country.label}
        </option>
      ))}
    </select>
  );
};
