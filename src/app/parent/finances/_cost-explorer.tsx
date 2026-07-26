'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Home, TrendingUp, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TIER_VISUAL, type FitTier } from '@/lib/theme/categories';
import {
  DEFAULT_HOME_CURRENCY,
  HOME_CURRENCIES,
  HOME_CURRENCY_STORAGE_KEY,
  formatHomeOnly,
  formatWithHomeCurrency,
  isHomeCurrencyCode,
  type HomeCurrencyCode,
} from '@/lib/parent/currency';
import type { ProgrammeCostLine } from '@/lib/parent/types';

// Per-programme cost cards + a yearly cost-of-attendance estimate, all
// convertible to the parent's home currency. Amounts are GBP-native; the
// conversion is a static-rate approximation (see lib/parent/currency.ts).

// Tier tone comes from TIER_VISUAL (lib/theme/categories) — the single source of
// truth for Reach/Match/Safety. Only the label→key mapping lives here, because the
// parent payload spells the safety tier 'Safe'.
const TIER_KEY: Record<string, FitTier> = {
  Reach: 'reach',
  Match: 'match',
  Safe: 'safety',
};

const tierChip = (label: string): string | undefined => {
  const key = TIER_KEY[label];
  return key ? TIER_VISUAL[key].chip : undefined;
};

/** Estimated yearly cost of attendance: tuition + housing (dorm, else rent×12). */
const yearlyTotal = (line: ProgrammeCostLine): number | null => {
  if (line.tuitionGbp === null) return null;
  const housing = line.dormGbp ?? (line.rentMonthlyGbp !== null ? line.rentMonthlyGbp * 12 : 0);
  return line.tuitionGbp + housing;
};

export function CostExplorer({
  costLines,
  childFirstName,
}: {
  costLines: ProgrammeCostLine[];
  childFirstName: string;
}) {
  const [currency, setCurrency] = useState<HomeCurrencyCode>(DEFAULT_HOME_CURRENCY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HOME_CURRENCY_STORAGE_KEY);
      if (isHomeCurrencyCode(stored)) setCurrency(stored);
    } catch {
      // localStorage can throw in private mode — keep the default.
    }
    setHydrated(true);
  }, []);

  const changeCurrency = (code: HomeCurrencyCode) => {
    setCurrency(code);
    try {
      localStorage.setItem(HOME_CURRENCY_STORAGE_KEY, code);
    } catch {
      // Non-fatal — the selection just won't persist.
    }
  };

  const totals = useMemo(() => costLines.map(yearlyTotal).filter((v): v is number => v !== null), [costLines]);
  const cheapest = totals.length > 0 ? Math.min(...totals) : null;
  const priciest = totals.length > 0 ? Math.max(...totals) : null;

  if (costLines.length === 0) {
    return (
      <EmptyState
        icon={<Wallet />}
        title="No cost data yet"
        description={`Once ${childFirstName} is tracking applications, each programme's tuition, living costs, and graduate outcomes will appear here.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Home-currency selector */}
      <div className="surface-toolbar flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Home currency</p>
          <p className="text-xs text-muted-foreground">
            Approximate conversion for budgeting — universities bill in their local currency.
          </p>
        </div>
        <label className="sr-only" htmlFor="parent-home-currency">
          Home currency
        </label>
        {/* `w-auto` keeps the toolbar layout — the trigger is `w-full` by default,
            and tailwind-merge lets the utility win. The sr-only label above still
            names it via htmlFor → the trigger's id. */}
        <Select
          value={hydrated ? currency : DEFAULT_HOME_CURRENCY}
          onValueChange={(value) => changeCurrency(value as HomeCurrencyCode)}
        >
          <SelectTrigger id="parent-home-currency" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOME_CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Yearly cost-of-attendance summary */}
      {cheapest !== null && priciest !== null ? (
        <div className="surface-card">
          <div className="relative z-10">
            <p className="eyebrow">Yearly cost of attendance</p>
            <p className="mb-1 text-lg font-semibold text-foreground">
              {cheapest === priciest
                ? formatHomeOnly(cheapest, currency)
                : `${formatHomeOnly(cheapest, currency)} – ${formatHomeOnly(priciest, currency)}`}{' '}
              <span className="text-sm font-normal text-muted-foreground">per year</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Tuition plus housing (university dorm where known, otherwise typical rent). Food, travel, and
              personal costs come on top.
            </p>
          </div>
        </div>
      ) : null}

      {/* Per-programme cost cards */}
      <ul className="grid gap-4 md:grid-cols-2">
        {costLines.map((line, index) => {
          const total = yearlyTotal(line);
          return (
            <motion.li
              key={`${line.programId}-${index}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.04 }}
              className="surface-card"
            >
              <div className="relative z-10">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{line.university}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {line.program} · {line.country}
                    </p>
                  </div>
                  {line.tier ? (
                    <span className={tierChip(line.tier)}>{line.tier}</span>
                  ) : null}
                </div>

                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" aria-hidden /> Tuition / year
                    </dt>
                    <dd className="text-right font-medium text-foreground">
                      {line.tuitionGbp !== null
                        ? formatWithHomeCurrency(line.tuitionGbp, currency)
                        : line.tuitionRaw ?? 'Not published'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Home className="h-3.5 w-3.5" aria-hidden /> Housing
                    </dt>
                    <dd className="text-right font-medium text-foreground">
                      {line.dormGbp !== null
                        ? `${formatWithHomeCurrency(line.dormGbp, currency)} / yr dorm`
                        : line.rentMonthlyGbp !== null
                          ? `${formatWithHomeCurrency(line.rentMonthlyGbp, currency)} / mo rent`
                          : 'Not published'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Starting salary
                    </dt>
                    <dd className="text-right font-medium text-foreground">
                      {line.startingSalaryGbp !== null
                        ? formatWithHomeCurrency(line.startingSalaryGbp, currency)
                        : 'Not published'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden /> Graduate employment
                    </dt>
                    <dd className="text-right font-medium text-foreground">
                      {line.graduateEmploymentPct !== null ? `${Math.round(line.graduateEmploymentPct)}%` : 'Not published'}
                    </dd>
                  </div>
                </dl>

                {total !== null ? (
                  <div className="mt-3 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Est. yearly total{' '}
                    <span className="font-semibold text-foreground">{formatHomeOnly(total, currency)}</span>
                    {' '}(tuition + housing)
                  </div>
                ) : null}
              </div>
            </motion.li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Figures come from each university&apos;s published data and are per-year estimates in GBP, converted at a
        recent snapshot rate — always confirm against the university&apos;s official fee schedule before committing.
      </p>
    </div>
  );
}
