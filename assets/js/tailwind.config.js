// Tailwind Play CDN configuration. Colors point at CSS variables (see styles.css)
// so the light/dark theme switches without regenerating any classes.
tailwind.config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: { bg: "var(--bg)", fg: "var(--fg)", muted: "var(--muted)", soft: "var(--soft)" },
      fontFamily: {
        sans: ["Archivo", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { DEFAULT: "0", sm: "0", md: "0", lg: "0", xl: "0", "2xl": "0", full: "0" },
    },
  },
};
