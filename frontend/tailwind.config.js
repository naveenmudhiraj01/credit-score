/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: {
        brand: { DEFAULT: "#1a6df0", dark: "#1558c8", soft: "#eaf2ff" },
        navy: { 900: "#0c2140", 800: "#14305c", 700: "#1d3f73" },
        ink: "#0b1f44", // headings (deep navy, as in the reference)
        surface: "#f4f8fb", // page background
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)",
        soft: "0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(30,64,120,.07)",
        cta: "0 6px 14px rgba(26,109,240,.28)",
      },
    },
  },
  plugins: [],
};
