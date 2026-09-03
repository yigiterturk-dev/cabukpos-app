import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#16181D",
        canvas: "#F7F8FA",
        surface: "#FFFFFF",
        brand: {
          DEFAULT: "#2F5BEA",
          deep: "#1E3FA8",
          soft: "#EAF0FE",
        },
        mint: "#38BDF8",
        emerald: "#10B981",
        amber: "#F59E0B",
        rose: "#EF4444",
        line: "#E6E9EF",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        lift: "0 8px 24px rgba(16,24,40,0.10)",
        pop: "0 12px 40px rgba(16,24,40,0.16)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      spacing: {
        "4.5": "1.125rem", // 18px — ikon boyutları için
      },
    },
  },
  plugins: [],
};

export default config;
