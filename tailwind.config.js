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
        "primary-2": "var(--primary-2)",
        accent: "var(--accent)",
        profit: "var(--profit)",
        loss: "var(--loss)",
        "primary-tint": "var(--primary-tint)",
        "skeleton": "var(--skeleton)",
      },
      fontFamily: {
        body: ['"IBM Plex Sans Arabic"', "Tajawal", "system-ui", "sans-serif"],
        heading: ['"Readex Pro"', '"Cairo"', '"IBM Plex Sans Arabic"', "sans-serif"],
      },
      fontSize: {
        h1: ["36px", { lineHeight: "1.3", fontWeight: "700" }],
        h2: ["26px", { lineHeight: "1.35", fontWeight: "700" }],
        h3: ["19px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["16px", { lineHeight: "1.8", fontWeight: "400" }],
        small: ["13px", { lineHeight: "1.6", fontWeight: "500" }],
        kpi: ["32px", { lineHeight: "1.2", fontWeight: "700" }],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        "soft-light": "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "soft-cream": "0 1px 3px rgba(43,33,24,0.08), 0 1px 2px rgba(43,33,24,0.04)",
      },
    },
  },
  plugins: [],
};
