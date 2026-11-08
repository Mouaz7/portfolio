/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Mapped to CSS variables so the whole site flips with the theme.
        // Dark defaults and light-mode overrides live in app/global.css.
        white: "var(--fg)",
        black: "var(--bg)",
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
        },
        // Legacy accent name kept so existing cornflowerblue-* utilities flip to teal.
        cornflowerblue: {
          100: "var(--accent)",
          200: "var(--accent-strong)",
        },
        steelblue: "rgba(14, 96, 151, 0)",
        // Tailwind 4 defines these two in oklch(), which Chrome < 111 and
        // Firefox < 113 cannot parse (placeholder and error text lost their
        // colour). These are the exact sRGB equivalents of the defaults.
        gray: { 400: "#99a1af" },
        red: { 400: "#ff6467" },
      },
      fontFamily: {
        urbanist: "var(--font-urbanist)",
      },
    },
  },
};
