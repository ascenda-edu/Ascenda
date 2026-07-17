'use client';

// WidgetRenderer — the assistant thread's rich-content registry.
//
// SECURITY INVARIANTS (mirrors widgets.ts + program-result-card.tsx):
//   • Widget items are STRUCTURED TOOL OUTPUT — plain data rendered as JSX text
//     only. NEVER dangerouslySetInnerHTML; no field is ever treated as markup.
//   • Every href is built from an item id against a FIXED route pattern in code
//     — never from an item-supplied string. The model cannot inject a link.
//   • Portal link scoping: student links (/course, /university-search,
//     /applications) render only in student mode; /counsellor/* links only in
//     counsellor mode. Each leaf component enforces its own guard.
//
// Dispatch is an exhaustive switch on widget.kind; the `never`-typed default
// makes an unhandled kind a compile error (and returns null at runtime).

import { Component, type ReactNode } from 'react';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ChatWidget } from '@/lib/chat/widgets';
import { ProgramsWidget } from './programs-widget';
import { UniversityWidget } from './university-widget';
import { DeadlinesWidget } from './deadlines-widget';
import { MatchesWidget } from './matches-widget';
import { TasksWidget } from './tasks-widget';
import { CohortStatsWidget } from './cohort-stats-widget';
import { AtRiskWidget } from './at-risk-widget';

// isChatWidget validates every item before data reaches these components, but
// tool_results jsonb is ultimately user-writable (own-only RLS) and future
// field drift is possible — a widget that throws must degrade to "not
// rendered", never unmount the whole workspace.
class WidgetErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[assistant] widget render failed:', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function WidgetRenderer({ widget, mode }: { widget: ChatWidget; mode: ChatMode }) {
  return (
    <WidgetErrorBoundary>
      <WidgetSwitch widget={widget} mode={mode} />
    </WidgetErrorBoundary>
  );
}

function WidgetSwitch({ widget, mode }: { widget: ChatWidget; mode: ChatMode }) {
  switch (widget.kind) {
    case 'programs':
      return <ProgramsWidget items={widget.items} mode={mode} />;
    case 'universities':
      return <UniversityWidget items={widget.items} mode={mode} />;
    case 'deadlines':
      return <DeadlinesWidget items={widget.items} mode={mode} />;
    case 'matches':
      return <MatchesWidget items={widget.items} mode={mode} />;
    case 'tasks':
      return <TasksWidget items={widget.items} mode={mode} />;
    case 'cohort_stats':
      return <CohortStatsWidget items={widget.items} />;
    case 'at_risk':
      return <AtRiskWidget items={widget.items} mode={mode} />;
    default: {
      // Exhaustiveness guard — a new ChatWidget kind must add a case above.
      const _exhaustive: never = widget;
      return _exhaustive ?? null;
    }
  }
}
