import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./context/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        bosch_red: "rgb(var(--color-bosch-red) / <alpha-value>)",
        charcoal: "rgb(var(--color-charcoal) / <alpha-value>)",
        text_dark: "rgb(var(--color-text-dark) / <alpha-value>)",
        text_medium: "rgb(var(--color-text-medium) / <alpha-value>)",
        page_bg: "rgb(var(--color-page-bg) / <alpha-value>)",
        card_bg: "rgb(var(--color-card-bg) / <alpha-value>)",
        border_grey: "rgb(var(--color-border-grey) / <alpha-value>)",
        bosch_blue: "rgb(var(--color-bosch-blue) / <alpha-value>)",
        process_cyan: "rgb(var(--color-process-cyan) / <alpha-value>)",
        success_green: "rgb(var(--color-success-green) / <alpha-value>)",
        warning_yellow: "rgb(var(--color-warning-yellow) / <alpha-value>)",
        master_purple: "rgb(var(--color-master-purple) / <alpha-value>)"
      },
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.05)"
      }
    }
  },
  plugins: []
};

export default config;
