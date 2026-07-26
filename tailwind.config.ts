import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Form + surface component classes.
//
// Removed here as confirmed dead (zero call sites app-wide): .panel-card (a
// byte-identical duplicate of .panel), .text-glow, .form-panel and its two
// modifiers, .form-flow, .form-touch-target, and .navbar-subtitle. If you need one
// back, prefer the .surface-* family in globals.css — that's the card system of
// record, with 149 consumers.
const customUtilitiesPlugin = plugin(function ({ addComponents }) {
  addComponents({
    // Opaque elevated surface (not actual glassmorphism — no backdrop blur).
    '.panel': {
      '@apply border border-border bg-card shadow-e-1 dark:bg-card dark:border-white/10': {},
    },
    // Form utilities
    '.form-grid': {
      '@apply grid gap-4 sm:gap-6': {},
    },
    '.form-stack': {
      '@apply flex flex-col gap-4': {},
    },
    '.form-field': {
      '@apply flex flex-col gap-2': {},
    },
    '.form-label': {
      '@apply text-sm font-semibold text-foreground': {},
    },
    // THE input treatment. There were ten competing ones — nine hand-rolled in the
    // counsellor area alone, three of which had no focus ring at all. Use this.
    '.form-input': {
      '@apply w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground shadow-e-1 transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background': {},
    },
    '.form-input--multi': {
      '@apply min-h-[120px]': {},
    },
    '.form-input--textarea': {
      '@apply min-h-[140px] resize-y': {},
    },
    '.form-feedback': {
      '@apply text-sm font-medium': {},
    },
    '.form-feedback--error': {
      '@apply text-destructive': {},
    },
    '.form-feedback--success': {
      '@apply text-success': {},
    },
    '.form-action': {
      '@apply w-full sm:w-auto': {},
    },
    // Navbar wordmark. Was raw hex (#0f172a / #334155 / #d1d5db) inside the token
    // system — the config reaching around itself.
    '.navbar-brand': {
      '@apply text-foreground': {},
    },
  })
});

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // `text-primary-ink` — the indigo that is legible as TEXT on neutral
          // surfaces in both themes. Use this for copy, labels, links and icons.
          // `text-primary` fails AA in dark mode (3.58:1) and always will, because
          // --primary is tuned to carry white button text.
          ink: "hsl(var(--primary-ink))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Tone tokens, four values each: DEFAULT is the TEXT colour (>=4.5:1 on
        // neutral surfaces), `fill` is the vivid mark for bars and solid badges
        // (>=3:1 vs card), `foreground` is text on that fill, `subtle` is the tint.
        // DEFAULT and fill are different numbers in light mode on purpose — see
        // globals.css. Using DEFAULT as a fill is what made the charts look muddy.
        success: {
          DEFAULT: "hsl(var(--success))",
          fill: "hsl(var(--success-fill))",
          foreground: "hsl(var(--success-foreground))",
          subtle: "hsl(var(--success-subtle))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          fill: "hsl(var(--warning-fill))",
          foreground: "hsl(var(--warning-foreground))",
          subtle: "hsl(var(--warning-subtle))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          fill: "hsl(var(--danger-fill))",
          foreground: "hsl(var(--danger-foreground))",
          subtle: "hsl(var(--danger-subtle))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          fill: "hsl(var(--info-fill))",
          foreground: "hsl(var(--info-foreground))",
          subtle: "hsl(var(--info-subtle))",
        },
        feature: {
          DEFAULT: "hsl(var(--feature))",
          fill: "hsl(var(--feature-fill))",
          foreground: "hsl(var(--feature-foreground))",
          subtle: "hsl(var(--feature-subtle))",
        },
        // Categorical chart slots, assigned in fixed order — never cycled, and never
        // interchangeable with the tone tokens above. See globals.css for the
        // validation record and why there are five rather than eight.
        "series-1": "hsl(var(--series-1))",
        "series-2": "hsl(var(--series-2))",
        "series-3": "hsl(var(--series-3))",
        "series-4": "hsl(var(--series-4))",
        "series-5": "hsl(var(--series-5))",
      },
      // Elevation ladder. Before this there was no system: `shadow-sm` at rest and
      // `shadow-md` on hover everywhere, plus ~15 files with literal rgba shadows.
      // Named by role so the intent survives; e-1 is a resting card, e-4 a modal.
      boxShadow: {
        "e-1": "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
        "e-2": "0 2px 4px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.06)",
        "e-3": "0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 28px rgba(15, 23, 42, 0.10)",
        "e-4": "0 8px 16px rgba(15, 23, 42, 0.08), 0 24px 60px rgba(15, 23, 42, 0.16)",
        nav: "0 30px 80px rgba(15, 23, 42, 0.08)",
      },
      // One radius ladder, all bound to --radius. Previously only lg/md/sm were
      // token-linked, so --radius governed ~8% of the app's radii while xl/2xl/3xl
      // sat at Tailwind's stock values and 58 sites used arbitrary rounded-[Npx].
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",   /*  6px */
        md: "calc(var(--radius) - 2px)",   /*  8px */
        lg: "var(--radius)",               /* 10px */
        xl: "calc(var(--radius) + 4px)",   /* 14px */
        "2xl": "calc(var(--radius) + 8px)",  /* 18px */
        "3xl": "calc(var(--radius) + 14px)", /* 24px */
        "4xl": "calc(var(--radius) + 18px)", /* 28px */
      },
      // Colour opacity modifiers (`bg-primary/15`) are generated from THIS scale, and
      // Tailwind emits nothing at all for a value that isn't in it — no error, no
      // warning, just a class that does nothing. The default scale is
      // 0/5/10/20/25/30/40/50/60/70/75/80/90/95/100, and the app had accumulated 68
      // uses of /3, /8, /15, /45 and /85 across 26 files — including ui/button.tsx,
      // navbar.tsx and the landing hero — every one of them silently dead.
      //
      // Declaring them here fixes all 68 at once and preserves what each author
      // actually intended, which snapping them to the nearest legal step would not.
      // If you reach for a new fractional step, add it here or it won't render.
      opacity: {
        3: '0.03',
        8: '0.08',
        15: '0.15',
        45: '0.45',
        85: '0.85',
      },
      // Named layers, so "which z-index?" stops being a guess. The chat panel used
      // to sit at z-[60] and paint over modals pinned at z-50.
      zIndex: {
        raised: "10",
        sticky: "20",
        nav: "30",
        docked: "40",
        panel: "60",
        overlay: "100",
        modal: "200",
        toast: "300",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        heading: ["var(--font-outfit)", "sans-serif"],
      },
      // Rich text (DB-sourced course descriptions, essay content) is rendered with
      // `prose`. Bound to our tokens so it inherits the app's colours and heading
      // face instead of Tailwind Typography's own grey ramp — and so dark mode works
      // off `prose-invert` without a second colour definition.
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body": "hsl(var(--foreground))",
            "--tw-prose-headings": "hsl(var(--foreground))",
            "--tw-prose-lead": "hsl(var(--muted-foreground))",
            "--tw-prose-links": "hsl(var(--primary))",
            "--tw-prose-bold": "hsl(var(--foreground))",
            "--tw-prose-counters": "hsl(var(--muted-foreground))",
            "--tw-prose-bullets": "hsl(var(--border))",
            "--tw-prose-hr": "hsl(var(--border))",
            "--tw-prose-quotes": "hsl(var(--foreground))",
            "--tw-prose-quote-borders": "hsl(var(--border))",
            "--tw-prose-captions": "hsl(var(--muted-foreground))",
            "--tw-prose-code": "hsl(var(--foreground))",
            "--tw-prose-pre-code": "hsl(var(--foreground))",
            "--tw-prose-pre-bg": "hsl(var(--muted))",
            "--tw-prose-th-borders": "hsl(var(--border))",
            "--tw-prose-td-borders": "hsl(var(--border))",
            // prose-invert reads the -invert-* set; point it at the same tokens,
            // which already flip under [data-theme='dark'].
            "--tw-prose-invert-body": "hsl(var(--foreground))",
            "--tw-prose-invert-headings": "hsl(var(--foreground))",
            "--tw-prose-invert-lead": "hsl(var(--muted-foreground))",
            "--tw-prose-invert-links": "hsl(var(--primary))",
            "--tw-prose-invert-bold": "hsl(var(--foreground))",
            "--tw-prose-invert-counters": "hsl(var(--muted-foreground))",
            "--tw-prose-invert-bullets": "hsl(var(--border))",
            "--tw-prose-invert-hr": "hsl(var(--border))",
            "--tw-prose-invert-quotes": "hsl(var(--foreground))",
            "--tw-prose-invert-quote-borders": "hsl(var(--border))",
            "--tw-prose-invert-captions": "hsl(var(--muted-foreground))",
            "--tw-prose-invert-code": "hsl(var(--foreground))",
            "--tw-prose-invert-pre-code": "hsl(var(--foreground))",
            "--tw-prose-invert-pre-bg": "hsl(var(--muted))",
            "--tw-prose-invert-th-borders": "hsl(var(--border))",
            "--tw-prose-invert-td-borders": "hsl(var(--border))",
            maxWidth: "none",
            h1: { fontFamily: "var(--font-outfit)" },
            h2: { fontFamily: "var(--font-outfit)" },
            h3: { fontFamily: "var(--font-outfit)" },
            h4: { fontFamily: "var(--font-outfit)" },
          },
        },
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 3.2s linear infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    customUtilitiesPlugin,
  ],
};

export default config;
