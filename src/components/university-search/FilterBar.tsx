import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MatchTier } from '@/lib/matching/match-tier';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Grid, LayoutList, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IntelligentSearchBar, Suggestion } from '@/components/university-search/IntelligentSearchBar';

type QuickFilters = {
    budgetFriendly: boolean;
    englishOnly: boolean;
    testOptional: boolean;
};

interface FilterBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onSearchSubmit?: () => void;
    onSelectSuggestion?: (item: Suggestion) => void;
    selectedTiers: MatchTier[];
    onTierChange: (tier: MatchTier) => void;
    viewMode: 'grid' | 'list';
    onViewModeChange: (mode: 'grid' | 'list') => void;
    resultCount: number;
    quickFilters?: QuickFilters;
    onQuickFilterChange?: (key: keyof QuickFilters) => void;
    selectedUniversities?: string[];
    selectedPrograms?: string[];
    availableUniversities?: string[];
    availablePrograms?: string[];
    onUniversityToggle?: (name: string) => void;
    onProgramToggle?: (name: string) => void;
    onClearFilters?: () => void;
    isSticky?: boolean;
    showViewToggle?: boolean;
}

const TIERS: MatchTier[] = ['Reach', 'Match', 'Safe'];

type DropdownKind = 'university' | 'program' | null;

function SelectionDropdown({
    id,
    label,
    options,
    selected,
    onToggle,
    isOpen,
    onOpenChange
}: {
    id: DropdownKind;
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
    isOpen: boolean;
    onOpenChange: (open: DropdownKind) => void;
}) {
    const [localQuery, setLocalQuery] = useState('');

    const filtered = useMemo(() => {
        const normalized = localQuery.toLowerCase();
        return options.filter((option) => option.toLowerCase().includes(normalized));
    }, [options, localQuery]);

    return (
        <div className="relative">
            <button
                onClick={() => onOpenChange(isOpen ? null : id)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                className={cn(
                    'flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isOpen ? 'ring-2 ring-primary/70 ring-offset-2 ring-offset-card' : 'hover:bg-muted'
                )}
            >
                <span>{label}</span>
                {selected.length > 0 ? (
                    <span className="flex h-6 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-semibold text-primary">
                        {selected.length}
                    </span>
                ) : null}
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
            </button>

            {isOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-3 shadow-xl sm:w-72">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <Input
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            placeholder={`Search ${label.toLowerCase()}…`}
                            className="h-9 rounded-lg bg-background"
                        />
                        {localQuery ? (
                            <button
                                onClick={() => setLocalQuery('')}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                                aria-label={`Clear ${label} search`}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        ) : null}
                    </div>
                    <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                        {filtered.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">No matches</p>
                        ) : (
                            filtered.map((option) => {
                                const active = selected.includes(option);
                                return (
                                    <button
                                        key={option}
                                        onClick={() => onToggle(option)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                            active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                                        )}
                                    >
                                        <span className="line-clamp-1">{option}</span>
                                        {active ? <Check className="h-4 w-4" /> : null}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function FilterBar({
    searchQuery,
    onSearchChange,
    onSearchSubmit,
    onSelectSuggestion = () => { },
    selectedTiers,
    onTierChange,
    viewMode,
    onViewModeChange,
    resultCount,
    quickFilters,
    onQuickFilterChange,
    selectedUniversities = [],
    selectedPrograms = [],
    availableUniversities = [],
    availablePrograms = [],
    onUniversityToggle = () => { },
    onProgramToggle = () => { },
    onClearFilters,
    isSticky = true,
    showViewToggle = true
}: FilterBarProps) {
    const [openDropdown, setOpenDropdown] = useState<DropdownKind>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hasSelectionFilters =
        availableUniversities.length > 0 ||
        availablePrograms.length > 0 ||
        selectedUniversities.length > 0 ||
        selectedPrograms.length > 0;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpenDropdown(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div
            ref={containerRef}
            className={cn(
                'surface-toolbar mb-6 flex flex-col gap-4 rounded-2xl p-4 md:gap-5',
                {
                    'sticky top-4 z-20': isSticky,
                    'relative z-0': !isSticky
                }
            )}
        >
            <div className="relative z-10 flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <form
                        className="relative w-full sm:max-w-xl lg:max-w-2xl"
                        onSubmit={(event) => {
                            event.preventDefault();
                            onSearchSubmit?.();
                        }}
                    >
                        <IntelligentSearchBar
                            value={searchQuery}
                            onChange={onSearchChange}
                            onSelectSuggestion={onSelectSuggestion}
                            placeholder="Search universities…"
                            variant="minimal"
                        />
                    </form>

                    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                            {resultCount} result{resultCount !== 1 && 's'}
                        </span>
                        {showViewToggle ? (
                            <div className="flex items-center rounded-2xl border border-border/70 bg-background/80 p-1.5 shadow-sm">
                                <button
                                    onClick={() => onViewModeChange('grid')}
                                    aria-pressed={viewMode === 'grid'}
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        viewMode === 'grid' ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    aria-label="Grid view"
                                >
                                    <Grid className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => onViewModeChange('list')}
                                    aria-pressed={viewMode === 'list'}
                                    className={cn(
                                        'flex h-8 w-8 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                        viewMode === 'list' ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                    )}
                                    aria-label="List view"
                                >
                                    <LayoutList className="h-4 w-4" />
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        {TIERS.map((tier) => {
                            const isSelected = selectedTiers.includes(tier);
                            return (
                                <button
                                    key={tier}
                                    onClick={() => onTierChange(tier)}
                                    className={cn(
                                        'flex h-9 items-center rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                                        isSelected
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                                    )}
                                    role="switch"
                                    aria-checked={isSelected}
                                    aria-label={`${tier} tier filter ${isSelected ? 'on' : 'off'}`}
                                >
                                    {tier}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-start lg:justify-end">
                        {quickFilters && onQuickFilterChange
                            ? ([
                                { key: 'budgetFriendly', label: 'Budget' },
                                { key: 'englishOnly', label: 'English' },
                                { key: 'testOptional', label: 'Test-optional' }
                            ] as const).map((filter) => {
                                const active = quickFilters[filter.key];
                                return (
                                    <button
                                        key={filter.key}
                                        onClick={() => onQuickFilterChange(filter.key)}
                                        className={cn(
                                            'flex h-9 items-center rounded-xl border px-3 text-xs font-semibold uppercase tracking-[0.2em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                                            active
                                                ? 'border-primary bg-primary/10 text-primary'
                                                : 'border-border bg-background text-muted-foreground hover:bg-muted'
                                        )}
                                        role="switch"
                                        aria-checked={active}
                                    >
                                        {filter.label}
                                    </button>
                                );
                            })
                            : null}
                        {onClearFilters ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
                                onClick={onClearFilters}
                            >
                                Reset
                            </Button>
                        ) : null}
                    </div>
                </div>

                {hasSelectionFilters ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <SelectionDropdown
                                id="university"
                                label="University"
                                options={availableUniversities}
                                selected={selectedUniversities}
                                onToggle={onUniversityToggle}
                                isOpen={openDropdown === 'university'}
                                onOpenChange={setOpenDropdown}
                            />
                            <SelectionDropdown
                                id="program"
                                label="Course"
                                options={availablePrograms}
                                selected={selectedPrograms}
                                onToggle={onProgramToggle}
                                isOpen={openDropdown === 'program'}
                                onOpenChange={setOpenDropdown}
                            />
                        </div>

                        {(selectedUniversities.length > 0 || selectedPrograms.length > 0) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {[...selectedUniversities.map((v) => ({ v, type: 'university' as const })), ...selectedPrograms.map((v) => ({ v, type: 'program' as const }))].map((item) => (
                                    <button
                                        key={`${item.type}-${item.v}`}
                                        onClick={() => {
                                            if (item.type === 'university') return onUniversityToggle(item.v);
                                            return onProgramToggle(item.v);
                                        }}
                                        className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
                                    >
                                        <span className="line-clamp-1 max-w-[180px]">{item.v}</span>
                                        <X className="h-3 w-3" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
