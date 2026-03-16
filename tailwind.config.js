/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        display: ["Inter", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        soft: "0 14px 32px -16px rgb(var(--ocean) / 0.44), 0 8px 20px -16px rgb(var(--ink) / 0.24)",
        glow: "0 0 0 1px rgb(var(--ocean) / 0.34), 0 16px 34px rgb(var(--ocean) / 0.24)",
        float: "0 20px 44px -18px rgb(var(--ocean) / 0.4), 0 12px 24px -16px rgb(var(--ink) / 0.24)",
      },
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        mist: "rgb(var(--mist) / <alpha-value>)",
        ocean: "rgb(var(--ocean) / <alpha-value>)",
        aurora: "rgb(var(--aurora) / <alpha-value>)",
        clay: "rgb(var(--clay) / <alpha-value>)",
        sand: "rgb(var(--sand) / <alpha-value>)",
        cream: "rgb(var(--cream) / <alpha-value>)",
        sunset: "rgb(var(--sunset) / <alpha-value>)",
        rose: "rgb(var(--rose) / <alpha-value>)",
      },
      borderRadius: {
        xl: "1.25rem",
        '2xl': "1.75rem",
      },
    },
  },
  plugins: [],
}
