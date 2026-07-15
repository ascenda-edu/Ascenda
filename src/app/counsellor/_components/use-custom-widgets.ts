'use client';

import { useCallback, useState } from 'react';
import { readJSON, writeJSON } from '@/lib/utils/local-storage';
import {
  isValidCustomWidgetDef,
  type CustomWidgetDef,
  type CustomWidgetId
} from '@/lib/counsellor/custom-widgets';

// Definitions get their own key; the existing analytics widget prefs keys
// (visibility/order/sizes) are untouched and merely gain `custom:*` ids once
// the feature is used.
const STORAGE_KEY = 'ascenda-counsellor-analytics-custom-defs';

function loadDefs(): CustomWidgetDef[] {
  const parsed = readJSON<unknown>(STORAGE_KEY, []);
  // Drops defs whose source/dimension no longer exists in the registry, so a
  // renamed dimension can never crash the page — the widget just disappears.
  return Array.isArray(parsed) ? parsed.filter(isValidCustomWidgetDef) : [];
}

function saveDefs(defs: CustomWidgetDef[]) {
  writeJSON(STORAGE_KEY, defs);
}

export function useCustomWidgets() {
  // Lazy initializer (not an effect) so definitions exist before the widget
  // grid's hydration effect snapshots which custom ids it already knows about.
  // Server render is guarded to [] and renders no widget markup, so there is
  // no hydration mismatch.
  const [customWidgets, setCustomWidgets] = useState<CustomWidgetDef[]>(() => loadDefs());

  const addCustomWidget = useCallback((def: CustomWidgetDef) => {
    setCustomWidgets((prev) => {
      const next = [...prev.filter((d) => d.id !== def.id), def];
      saveDefs(next);
      return next;
    });
  }, []);

  const deleteCustomWidget = useCallback((id: CustomWidgetId) => {
    setCustomWidgets((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveDefs(next);
      return next;
    });
  }, []);

  return { customWidgets, addCustomWidget, deleteCustomWidget };
}
