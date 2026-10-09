/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "on-primary": "var(--on-primary)",
        "primary-2": "var(--primary-2)",
        accent: "var(--accent)",
        profit: "var(--profit)",
        loss: "var(--loss)",
        "primary-tint": "var(--primary-tint)",
        "skeleton": "var(--skeleton)",
      },
      fontFamily: {
        body: ['"Inter"', '"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
        heading: ['"Readex Pro"', '"IBM Plex Sans Arabic"', "sans-serif"],
        wordmark: ['"Tinos"', '"Times New Roman"', '"Amiri"', "serif"],
        "wordmark-ar": ['"Amiri"', '"Tinos"', "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
};
