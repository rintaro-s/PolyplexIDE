/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Y axis
        y: { DEFAULT: "#16a34a", light: "#dcfce7", text: "#15803d" },
        // X axis
        x: { DEFAULT: "#2563eb", light: "#dbeafe", text: "#1d4ed8" },
        // Z axis
        z: { DEFAULT: "#9333ea", light: "#f3e8ff", text: "#7e22ce" },
        // W axis
        w: { DEFAULT: "#d97706", light: "#fef3c7", text: "#b45309" },
      },
    },
  },
  plugins: [],
}

