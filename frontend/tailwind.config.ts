import type { Config } from "tailwindcss";

const config: Config = {
  // components/ was added to the starter's list — Tailwind purges any class it
  // cannot find in `content`.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // Semantic, so a row never has to know which hex means "up".
        up: {
          DEFAULT: "#34d399",
          soft: "rgb(52 211 153 / 0.12)",
        },
        down: {
          DEFAULT: "#fb7185",
          soft: "rgb(251 113 133 / 0.12)",
        },
        brand: {
          DEFAULT: "#6366f1",
          bright: "#a5b4fc",
          soft: "rgb(99 102 241 / 0.12)",
        },
      },
      keyframes: {
        // The flash lands on the number, not on the row. Every instrument ticks
        // twice a second, so a row-sized wash never finishes fading and the whole
        // board ends up permanently tinted — which says nothing at all.
        "tick-up": {
          "0%": { color: "#34d399" },
          "100%": { color: "#fafafa" },
        },
        "tick-down": {
          "0%": { color: "#fb7185" },
          "100%": { color: "#fafafa" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Shorter than the 500ms feed interval, so the number settles back to
        // white between ticks and the flash reads as motion rather than state.
        // Direction *state* is the change pill's job.
        "tick-up": "tick-up 400ms ease-out forwards",
        "tick-down": "tick-down 400ms ease-out forwards",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "rise-in": "rise-in 320ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
