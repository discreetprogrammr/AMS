import type { Config } from "tailwindcss";

// Colors below reference CSS custom properties (defined per-theme in
// globals.css: `:root` = dark defaults, `.light` = light overrides) via
// Tailwind's `rgb(var(--x) / <alpha-value>)` pattern. That means every
// variant Tailwind generates from these tokens — hover:, focus:, opacity
// modifiers like bg-surface-2/50 — flips with the theme automatically,
// without needing a `dark:`-prefixed twin for every single class.
const withOpacity = (cssVar: string) => `rgb(var(${cssVar}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        base: withOpacity("--c-base"),
        surface: {
          DEFAULT: withOpacity("--c-surface"),
          hover: withOpacity("--c-surface-2"),
          2: withOpacity("--c-surface-2"),
        },
        hairline: {
          DEFAULT: withOpacity("--c-hairline"),
          strong: withOpacity("--c-hairline-strong"),
        },
        // Theme-aware text tokens — replace what used to be literal
        // text-white / text-slate-200 (-> ink) and text-slate-300/400
        // (-> ink-soft) throughout the app.
        ink: {
          DEFAULT: withOpacity("--c-ink"),
          soft: withOpacity("--c-ink-soft"),
        },
        // Override just the "400" shade of each status color — that's the
        // one shade used as text/dot color on top of a translucent status
        // pill (bg-amber-500/15, etc). Other shades (500, 600, 700...)
        // keep Tailwind's normal defaults, deep-merged in below this.
        amber: { 400: withOpacity("--c-status-amber") },
        emerald: { 400: withOpacity("--c-status-emerald") },
        red: { 400: withOpacity("--c-status-red") },
        blue: { 400: withOpacity("--c-status-blue") },
      },
    },
  },
  plugins: [],
};

export default config;
