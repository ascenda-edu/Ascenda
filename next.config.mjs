/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the tracing root to this repo — a stray lockfile in the home directory
  // otherwise makes Next guess the workspace root and warn on every build.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // NO `optimizePackageImports` HERE — ON PURPOSE. It was tried and MEASURED.
    //
    // docs/audit/08-performance.md F9 predicts "4-8 kB gz from barrel
    // optimisation alone". That prediction does not hold for this repo. Four
    // production builds, gzip via `npm run check:bundle --report`, everything
    // else held constant:
    //
    //   config                      /      /dashboard  /counsellor  /assistant
    //   (none)                    198 kB    260 kB      263 kB       329 kB
    //   framer-motion             199 kB    261 kB      264 kB       329 kB   ← WORSE
    //   6 × @radix-ui/react-*     198 kB    260 kB      263 kB       329 kB   ← identical
    //   framer-motion + radix     199 kB    261 kB      264 kB       329 kB   ← WORSE
    //
    // framer-motion@12 already ships tree-shakeable ESM; the modularizeImports
    // rewrite just fragments it into more module boundaries, which costs ~1 kB
    // gz of lost chunk sharing on ~40 routes. Radix is exactly neutral — each
    // `@radix-ui/react-*` is a single flat primitive, so there is no barrel to
    // optimise. `lucide-react` and `date-fns` are ALREADY in Next's built-in
    // default list (see next/dist/esm/server/config.js), so listing them does
    // nothing at all.
    //
    // If you are here to add this option back: rebuild and diff the numbers
    // first. The real framer-motion win is F9's structural half — un-anchoring
    // MotionConfig from the root layout — not the config flag.

    // Client Router Cache. Next 15 defaults to `dynamic: 0`, which means every
    // back/forward navigation refetches the full RSC payload — and nearly every
    // route here is dynamic, so each bounce costs a server render plus an auth
    // round-trip. 30s is short enough that no screen can show meaningfully
    // stale data (the inbox has its own realtime poll on top) and long enough
    // to make back-navigation within a task instant.
    // `static: 180` is BELOW Next's 300s default — deliberately conservative.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
        ]
      }
    ];
  }
};

export default nextConfig;
