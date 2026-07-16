'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Home, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
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

const TIER_STYLES: Record<string, string> = {
  Reach: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
  Match: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Safe: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
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
        icon={Wallet}
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Home currency
          </p>
          <p className="text-xs text-muted-foreground">
            Approximate conversion for budgeting — universities bill in their local currency.
          </p>
        </div>
        <label className="sr-only" htmlFor="parent-home-currency">
          Home currency
        </label>
        <select
          id="parent-home-currency"
          value={hydrated ? currency : DEFAULT_HOME_CURRENCY}
          onChange={(e) => changeCurrency(e.target.value as HomeCurrencyCode)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {HOME_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Yearly cost-of-attendance summary */}
      {cheapest !== null && priciest !== null ? (
        <div className="surface-card surface-card--static">
          <div className="relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Yearly cost of attendance
            </p>
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
              className="surface-card surface-card--static"
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
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TIER_STYLES[line.tier])}>
                      {line.tier}
                    </span>
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
