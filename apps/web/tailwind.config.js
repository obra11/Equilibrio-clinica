/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F2EEE4",
        olive: {
          DEFAULT: "#585E45",
          muted: "#6B705C",
        },
        gold: "#B5A478",
        charcoal: "#2F2F2A",
        borderEq: "#E4DFD3",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
