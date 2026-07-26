import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Plugin to add the glass and form utilities
const customUtilitiesPlugin = plugin(function ({ addComponents }) {
  addComponents({
    // Opaque elevated surface (not actual glassmorphism — no backdrop blur).
    '.panel': {
      '@apply border border-border bg-card shadow-sm dark:bg-card dark:border-white/10': {},
    },
    '.panel-card': {
      '@apply border border-border bg-card shadow-sm dark:bg-card dark:border-white/10': {},
    },
    '.text-glow': {
      'text-shadow': '0 0 20px rgba(90, 88, 238, 0.35)',
    },
    // Form utilities
    '.form-grid': {
      '@apply grid gap-4 sm:gap-6': {},
    },
    '.form-flow': {
      '@apply gap-6': {},
    },
    '.form-stack': {
      '@apply flex flex-col gap-4': {},
    },
    '.form-panel': {
      '@apply rounded-2xl border border-border bg-card text-foreground shadow-sm transition-colors': {},
    },
    '.form-panel--roomy': {
      '@apply gap-6 p-6 sm:p-8': {},
    },
    '.form-panel--quiet': {
      '@apply gap-4 p-5 sm:p-6 bg-muted/60': {},
    },
    '.form-field': {
      '@apply flex flex-col gap-2': {},
    },
    '.form-label': {
      '@apply text-sm font-semibold text-foreground': {},
    },
    '.form-input': {
      '@apply w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground shadow-sm transition-all duration-300 placeholder:text-muted-foreground/80 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring': {},
    },
    '.form-input--multi': {
      '@apply min-h-[120px]': {},
    },
    '.form-input--textarea': {
      '@apply min-h-[140px] resize-y': {},
    },
    '.form-touch-target': {
      '@apply rounded-xl bg-muted/40 px-3 py-2 transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring': {},
    },
    '.form-feedback': {
      '@apply text-sm font-medium': {},
    },
    '.form-feedback--error': {
      '@apply text-destructive': {},
    },
    '.form-feedback--success': {
      '@apply text-emerald-500': {},
    },
    '.form-action': {
      '@apply w-full sm:w-auto': {},
    },
    // Navbar utilities
    '.navbar-brand': {
      color: '#0f172a',
    },
    '[data-theme="dark"] .navbar-brand': {
      color: '#ffffff',
    },
    '.navbar-subtitle': {
      color: '#334155',
    },
    '[data-theme="dark"] .navbar-subtitle': {
      color: '#d1d5db',
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      boxShadow: {
        soft: "0 2px 10px rgba(0, 0, 0, 0.05)",
        floating: "0 10px 30px -10px rgba(0, 0, 0, 0.1)",
        glow: "0 0 20px rgba(99, 102, 241, 0.15)",
        nav: "0 30px 80px rgba(15, 23, 42, 0.08)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.2s ease-out forwards",
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
