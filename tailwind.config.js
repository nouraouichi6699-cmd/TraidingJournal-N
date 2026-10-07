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
      borderRadius: {
        card: "16px",
      },
    },
  },
  plugins: [],
};
