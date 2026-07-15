'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type Suggestion = {
    id: string;
    name: string;
    university?: string | null;
    location?: string | null;
    score: number;
    type: 'program' | 'university';
};

export type SuggestionGroups = {
    programs: Suggestion[];
    universities: Suggestion[];
};

interface IntelligentSearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onSelectSuggestion: (item: Suggestion) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    variant?: 'default' | 'minimal';
    inputId?: string;
    inputName?: string;
}

export function IntelligentSearchBar({
    value,
    onChange,
    onSelectSuggestion,
    placeholder = 'Search universities or courses…',
    className,
    inputClassName,
    variant = 'default',
    inputId,
    inputName
}: IntelligentSearchBarProps) {
    const [suggestions, setSuggestions] = useState<SuggestionGroups>({ programs: [], universities: [] });
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [isLoadingPrefill, setIsLoadingPrefill] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [recentSearches, setRecentSearches] = useState<Suggestion[]>([]);
    const [trendingSuggestions, setTrendingSuggestions] = useState<SuggestionGroups>({ programs: [], universities: [] });
    const [suggestionsError, setSuggestionsError] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const debounceRef = useRef<number | null>(null);
    const latestRequestRef = useRef<number>(0);
    const activeRequests = useRef<AbortController[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();
    const hasTypedQuery = value.trim().length > 0;

    const optionId = (index: number) => `${listboxId}-option-${index}`;

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const controller = new AbortController();

        const validateAndLoadRecents = async () => {
            try {
                const stored = window.localStorage.getItem('ascenda-recent-searches');
                if (!stored) return;
                const parsed = JSON.parse(stored) as Suggestion[];

                // Normalize legacy entries that may not have a type.
                const normalized = parsed.map((item) => ({
                    ...item,
                    type: item.type ?? (item.university ? 'program' : 'university')
                })) as Suggestion[];

                const results = await Promise.all(
                    normalized.map(async (entry) => {
                        if (controller.signal.aborted) return null;
                        try {
                            const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(entry.name)}`, {
                                signal: controller.signal
                            });
                            if (!response.ok) return null;
                            const payload = (await response.json()) as { programs: any[]; universities: any[] };
                            const exists =
                                entry.type === 'program'
                                    ? (payload.programs || []).some((p) => p.id === entry.id)
                                    : (payload.universities || []).some((u) => u.id === entry.id);
                            return exists ? entry : null;
                        } catch {
                            return null;
                        }
                    })
                );
                const validated = results.filter((r): r is Suggestion => r !== null);

                if (!controller.signal.aborted) {
                    setRecentSearches(validated);
                    window.localStorage.setItem('ascenda-recent-searches', JSON.stringify(validated));
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.warn('Unable to load recent searches', err);
            }
        };

        void validateAndLoadRecents();

        return () => {
            controller.abort();
        };
    }, []);

    useEffect(() => {
        const fetchSuggestions = async (query: string) => {
            const trimmed = query.trim();
            if (trimmed.length < 2) {
                setSuggestions({ programs: [], universities: [] });
                setSuggestionsError(false);
                setIsLoadingSuggestions(false);
                return;
            }
            setIsLoadingSuggestions(true);
            setSuggestionsError(false);
            const requestId = Date.now();
            latestRequestRef.current = requestId;
            activeRequests.current.forEach((controller) => controller.abort());
            const controller = new AbortController();
            activeRequests.current = [controller];
            try {
                const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(trimmed)}`, {
                    signal: controller.signal
                });
                if (!response.ok) {
                    throw new Error(`Search failed: ${response.status}`);
                }
                const payload = (await response.json()) as { programs: any[]; universities: any[] };

                const normalizedQuery = trimmed.toLowerCase();

                const scoreText = (text: string | null | undefined) => {
                    if (!text) return 0;
                    const lower = text.toLowerCase();
                    if (lower === normalizedQuery) return 100;
                    if (lower.startsWith(normalizedQuery)) return 90;
                    if (lower.includes(` ${normalizedQuery}`)) return 80;
                    if (lower.includes(normalizedQuery)) return 60;
                    return 0;
                };

                const programSuggestions = (payload.programs || []).map((program: any) => {
                    const uni = program.universities as { name?: string | null; city?: string | null; region?: string | null; country?: string | null } | null;
                    const location = [uni?.city, uni?.region, uni?.country].filter(Boolean).join(', ') || null;
                    const nameScore = scoreText(program.course_name);
                    const levelScore = scoreText(program.study_level);
                    const uniScore = scoreText(uni?.name) * 0.5;
                    const score = Math.max(nameScore, levelScore) + uniScore;

                    return {
                        id: program.id,
                        name: program.course_name,
                        university: uni?.name ?? null,
                        location,
                        score,
                        type: 'program' as const
                    };
                });

                const universitySuggestions = (payload.universities || []).map((uni: any) => {
                    const location = [uni.city, uni.region, uni.country].filter(Boolean).join(', ') || null;
                    const score = scoreText(uni.name);
                    return {
                        id: uni.id,
                        name: uni.name,
                        location,
                        score,
                        type: 'university' as const
                    };
                });

                const sortByScore = (items: Suggestion[]) => [...items].sort((a, b) => b.score - a.score).slice(0, 5);

                if (latestRequestRef.current === requestId) {
                    setSuggestions({
                        programs: sortByScore(programSuggestions),
                        universities: sortByScore(universitySuggestions)
                    });
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.error('Failed to load suggestions', err);
                if (latestRequestRef.current === requestId) {
                    setSuggestions({ programs: [], universities: [] });
                    setSuggestionsError(true);
                }
            } finally {
                if (latestRequestRef.current === requestId) {
                    setIsLoadingSuggestions(false);
                    activeRequests.current = [];
                }
            }
        };

        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => fetchSuggestions(value), 250);

        return () => {
            if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [value]);

    useEffect(() => {
        if (!isDropdownOpen || hasTypedQuery || trendingSuggestions.programs.length + trendingSuggestions.universities.length > 0) {
            return;
        }
        let isActive = true;
        const loadTrending = async () => {
            setIsLoadingPrefill(true);
            try {
                const response = await fetch('/api/search/suggestions?trending=true');
                if (!response.ok) throw new Error('Trending fetch failed');
                const payload = (await response.json()) as { programs: any[]; universities: any[] };

                if (!isActive) return;

                const formatLocation = (city?: string | null, region?: string | null, country?: string | null) =>
                    [city, region, country].filter(Boolean).join(', ') || null;

                const programs = (payload.programs || []).map((program: any) => {
                    const uni = program.universities as { name?: string | null; city?: string | null; region?: string | null; country?: string | null } | null;
                    return {
                        id: program.id,
                        name: program.course_name,
                        university: uni?.name ?? null,
                        location: formatLocation(uni?.city ?? null, uni?.region ?? null, uni?.country ?? null),
                        score: 0,
                        type: 'program' as const
                    };
                });

                const universities = (payload.universities || []).map((uni: any) => ({
                    id: uni.id,
                    name: uni.name,
                    location: formatLocation(uni.city, uni.region, uni.country),
                    score: 0,
                    type: 'university' as const
                }));

                setTrendingSuggestions({ programs, universities });
            } catch (err) {
                console.warn('Unable to load trending suggestions', err);
            } finally {
                if (isActive) setIsLoadingPrefill(false);
            }
        };

        loadTrending();

        return () => {
            isActive = false;
        };
    }, [hasTypedQuery, isDropdownOpen, trendingSuggestions.programs.length, trendingSuggestions.universities.length]);

    const hasSuggestions = useMemo(
        () => suggestions.programs.length > 0 || suggestions.universities.length > 0,
        [suggestions]
    );

    // Flat, in-render-order list of every selectable option so keyboard
    // navigation can address them by a single index.
    const flatOptions = useMemo<Suggestion[]>(() => {
        if (hasTypedQuery) {
            if (isLoadingSuggestions) return [];
            return [...suggestions.programs, ...suggestions.universities];
        }
        return [...recentSearches, ...trendingSuggestions.programs, ...trendingSuggestions.universities];
    }, [hasTypedQuery, isLoadingSuggestions, suggestions, recentSearches, trendingSuggestions]);

    // Reset the active option whenever the option list changes or the
    // dropdown closes — a stale index would point at the wrong item.
    useEffect(() => {
        setActiveIndex(-1);
    }, [flatOptions, isDropdownOpen]);

    // Keep the active option visible while arrowing through a long list.
    useEffect(() => {
        if (activeIndex < 0) return;
        document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex]);

    const persistRecentSearch = (item: Suggestion) => {
        setRecentSearches((prev) => {
            const filtered = prev.filter((entry) => entry.id !== item.id);
            const next = [item, ...filtered].slice(0, 6);
            try {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('ascenda-recent-searches', JSON.stringify(next));
                }
            } catch (err) {
                console.warn('Unable to save recent search', err);
            }
            return next;
        });
    };

    // Close only when focus actually leaves the composite widget (input +
    // dropdown). Blur events bubble in React, so this fires for any child.
    const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
        const nextFocus = event.relatedTarget as Node | null;
        if (!containerRef.current || !containerRef.current.contains(nextFocus)) {
            setIsDropdownOpen(false);
        }
    };

    const handleFocus = () => {
        setIsDropdownOpen(true);
    };

    const handleSelect = (item: Suggestion) => {
        onChange(item.name);
        setIsDropdownOpen(false);
        persistRecentSearch(item);
        onSelectSuggestion(item);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isDropdownOpen) {
                setIsDropdownOpen(true);
                return;
            }
            if (flatOptions.length === 0) return;
            setActiveIndex((prev) => {
                if (prev === -1) {
                    return event.key === 'ArrowDown' ? 0 : flatOptions.length - 1;
                }
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                return (prev + delta + flatOptions.length) % flatOptions.length;
            });
        } else if (event.key === 'Enter') {
            if (isDropdownOpen && activeIndex >= 0 && activeIndex < flatOptions.length) {
                event.preventDefault();
                handleSelect(flatOptions[activeIndex]);
            }
        } else if (event.key === 'Escape') {
            if (isDropdownOpen) {
                event.preventDefault();
                setIsDropdownOpen(false);
            }
        }
    };

    const hasPrefill = recentSearches.length > 0 || trendingSuggestions.programs.length > 0 || trendingSuggestions.universities.length > 0;
    const shouldShowDropdown = isDropdownOpen && (hasSuggestions || isLoadingSuggestions || suggestionsError || !hasTypedQuery);

    return (
        <div ref={containerRef} onBlur={handleContainerBlur} className={cn("relative w-full", className)}>
            <div className={cn(
                "relative flex w-full items-center gap-3",
                variant === 'default'
                    ? "rounded-full border border-border bg-background px-6 py-3 shadow-[0_18px_35px_rgba(15,23,42,0.08)] focus-within:border-foreground/60"
                    : "relative"
            )}>
                <Search className={cn(
                    "text-muted-foreground",
                    variant === 'default' ? "h-5 w-5" : "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                )} aria-hidden />
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    id={inputId}
                    name={inputName}
                    placeholder={placeholder}
                    spellCheck={false}
                    role="combobox"
                    aria-expanded={shouldShowDropdown}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    className={cn(
                        variant === 'default'
                            ? "h-16 flex-1 border-0 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
                            : "h-10 w-full rounded-xl border-border bg-background pl-9 pr-8",
                        inputClassName
                    )}
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label="Clear search"
                        className={cn(
                            "rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            variant === 'default' ? "" : "absolute right-3 top-1/2 -translate-y-1/2"
                        )}
                    >
                        <X className={cn(variant === 'default' ? "h-5 w-5" : "h-3 w-3")} aria-hidden />
                    </button>
                )}
            </div>

            {shouldShowDropdown && (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Search suggestions"
                    className={cn(
                        "absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl",
                        variant === 'default' ? "top-full" : "top-full"
                    )}
                >
                    {hasTypedQuery ? (
                        isLoadingSuggestions ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">Finding matches…</p>
                        ) : suggestionsError && !hasSuggestions ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">Suggestions unavailable — try again in a moment.</p>
                        ) : (
                            <div className="max-h-72 divide-y divide-border overflow-y-auto">
                                {suggestions.programs.length > 0 && (
                                    <div role="group" aria-label="Programs">
                                        <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Programs</p>
                                        <ul className="p-1" role="presentation">
                                            {suggestions.programs.map((item, index) => (
                                                <li key={`program-${item.id}`} role="presentation">
                                                    <button
                                                        type="button"
                                                        role="option"
                                                        id={optionId(index)}
                                                        aria-selected={activeIndex === index}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onMouseEnter={() => setActiveIndex(index)}
                                                        onClick={() => handleSelect(item)}
                                                        className={cn(
                                                            "flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted",
                                                            activeIndex === index && "bg-muted"
                                                        )}
                                                    >
                                                        <span className="font-semibold text-foreground">{item.name}</span>
                                                        {item.university && (
                                                            <span className="text-xs text-muted-foreground">{item.university}</span>
                                                        )}
                                                        {item.location && <span className="text-xs text-muted-foreground">{item.location}</span>}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {suggestions.universities.length > 0 && (
                                    <div role="group" aria-label="Universities">
                                        <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Universities</p>
                                        <ul className="p-1" role="presentation">
                                            {suggestions.universities.map((item, index) => {
                                                const flatIndex = suggestions.programs.length + index;
                                                return (
                                                    <li key={`university-${item.id}`} role="presentation">
                                                        <button
                                                            type="button"
                                                            role="option"
                                                            id={optionId(flatIndex)}
                                                            aria-selected={activeIndex === flatIndex}
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onMouseEnter={() => setActiveIndex(flatIndex)}
                                                            onClick={() => handleSelect(item)}
                                                            className={cn(
                                                                "flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted",
                                                                activeIndex === flatIndex && "bg-muted"
                                                            )}
                                                        >
                                                            <span className="font-semibold text-foreground">{item.name}</span>
                                                            {item.location && <span className="text-xs text-muted-foreground">{item.location}</span>}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <div className="space-y-2 p-3">
                            {isLoadingPrefill ? (
                                <p className="px-1 py-1 text-xs text-muted-foreground">Loading ideas…</p>
                            ) : hasPrefill ? (
                                <div className="space-y-3">
                                    {recentSearches.length > 0 && (
                                        <div role="group" aria-label="Recent searches">
                                            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Recent searches</p>
                                            <ul className="mt-1 grid gap-1 md:grid-cols-2" role="presentation">
                                                {recentSearches.map((item, index) => (
                                                    <li key={`recent-${item.id}`} role="presentation">
                                                        <button
                                                            type="button"
                                                            role="option"
                                                            id={optionId(index)}
                                                            aria-selected={activeIndex === index}
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onMouseEnter={() => setActiveIndex(index)}
                                                            onClick={() => handleSelect(item)}
                                                            className={cn(
                                                                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted",
                                                                activeIndex === index && "bg-muted"
                                                            )}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-foreground">{item.name}</span>
                                                                {item.university && (
                                                                    <span className="text-xs text-muted-foreground">{item.university}</span>
                                                                )}
                                                                {item.location && <span className="text-xs text-muted-foreground">{item.location}</span>}
                                                            </div>
                                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Recent</span>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(trendingSuggestions.programs.length > 0 || trendingSuggestions.universities.length > 0) && (
                                        <div role="group" aria-label="Trending">
                                            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Trending</p>
                                            <div className="grid gap-2 md:grid-cols-2" role="presentation">
                                                {trendingSuggestions.programs.map((item, index) => {
                                                    const flatIndex = recentSearches.length + index;
                                                    return (
                                                        <button
                                                            key={`trending-program-${item.id}`}
                                                            type="button"
                                                            role="option"
                                                            id={optionId(flatIndex)}
                                                            aria-selected={activeIndex === flatIndex}
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onMouseEnter={() => setActiveIndex(flatIndex)}
                                                            onClick={() => handleSelect(item)}
                                                            className={cn(
                                                                "flex w-full flex-col rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-left text-sm transition hover:border-foreground/60 hover:bg-muted",
                                                                activeIndex === flatIndex && "border-foreground/60 bg-muted"
                                                            )}
                                                        >
                                                            <span className="font-semibold text-foreground">{item.name}</span>
                                                            {item.university && (
                                                                <span className="text-xs text-muted-foreground">{item.university}</span>
                                                            )}
                                                            {item.location && <span className="text-[11px] text-muted-foreground">{item.location}</span>}
                                                            <span className="mt-1 inline-flex w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Program</span>
                                                        </button>
                                                    );
                                                })}
                                                {trendingSuggestions.universities.map((item, index) => {
                                                    const flatIndex = recentSearches.length + trendingSuggestions.programs.length + index;
                                                    return (
                                                        <button
                                                            key={`trending-university-${item.id}`}
                                                            type="button"
                                                            role="option"
                                                            id={optionId(flatIndex)}
                                                            aria-selected={activeIndex === flatIndex}
                                                            onMouseDown={(e) => e.preventDefault()}
                                                            onMouseEnter={() => setActiveIndex(flatIndex)}
                                                            onClick={() => handleSelect(item)}
                                                            className={cn(
                                                                "flex w-full flex-col rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-left text-sm transition hover:border-foreground/60 hover:bg-muted",
                                                                activeIndex === flatIndex && "border-foreground/60 bg-muted"
                                                            )}
                                                        >
                                                            <span className="font-semibold text-foreground">{item.name}</span>
                                                            {item.location && <span className="text-[11px] text-muted-foreground">{item.location}</span>}
                                                            <span className="mt-1 inline-flex w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">University</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="px-1 py-1 text-xs text-muted-foreground">Start typing to search, or pick from trending results.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
