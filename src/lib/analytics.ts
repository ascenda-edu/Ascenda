export type AnalyticsEvent = {
  name: string;
  payload?: Record<string, unknown>;
  timestamp: number;
};

type Listener = (event: AnalyticsEvent) => void;

const listeners = new Set<Listener>();

export const trackEvent = (name: string, payload?: Record<string, unknown>) => {
  const event: AnalyticsEvent = { name, payload, timestamp: Date.now() };

  if (process.env.NODE_ENV !== 'production') {
    // Surface events locally without needing an external analytics vendor.
    console.info('[analytics]', name, payload ?? {});
  }

  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      // Keep individual listener failures from breaking the rest.
      console.error('Analytics listener error', error);
    }
  });

  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (endpoint) {
    try {
      const body = JSON.stringify(event);
      if (typeof window !== 'undefined' && typeof window.navigator?.sendBeacon === 'function') {
        window.navigator.sendBeacon(endpoint, body);
      } else {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
      }
    } catch (error) {
      // Fail silently to avoid blocking user flows.
      console.error('Analytics dispatch failed', error);
    }
  }
};

export const subscribeToAnalytics = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
