import type { Config } from "tailwindcss";

/**
 * Tailwind config alineado a la identidad D&C + estética premium
 * tipo Mercury / Ramp / Stripe.
 *
 * Tokens:
 *   - "ink"      : verde oscuro casi negro (heredado de --deep-green)
 *                  → reemplaza el "navy" del mockup manteniendo brand.
 *   - "paper"    : whites + grises premium para fondos.
 *   - "accent"   : sand cálido — acento de marca y CTAs (Brand Board 2026).
 *   - "ring"     : focus + bordes sutiles para forms premium.
 *
 * IMPORTANTE: solo afecta clases tailwind. Los CSS modules + inline
 * styles existentes siguen funcionando sin tocar.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // === INK (texto/fondos oscuros, equivalente "navy" mercury) ===
        ink: {
          DEFAULT: "#0A1A0C",
          900: "#0A1A0C",
          800: "#142318",
          700: "#1E3A28",
          600: "#2C5038",
          500: "#3D6B4D",
          400: "#5A7F66",
          300: "#7A8A7E",
          200: "#A8B1AB",
          100: "#D6DAD7",
          50: "#EEF1EF",
        },
        // === PAPER (backgrounds, white-on-white sutil) ===
        paper: {
          DEFAULT: "#FFFFFF",
          50: "#FFFFFF",
          100: "#FBFBFA",
          200: "#F5F4F1",
          300: "#EDEBE6",
          400: "#E4E1D9",
        },
        // === ACCENT (CTAs, hovers, estados activos) · Brand Board 2026: SAND ===
        accent: {
          DEFAULT: "#C4A882",
          dim: "#9B8259",
          tint: "rgba(196, 168, 130, 0.10)",
          ring: "rgba(196, 168, 130, 0.25)",
        },
        // === SAND (cálido secundario, heredado D&C) ===
        sand: {
          DEFAULT: "#C4A882",
          dark: "#9B8259",
          light: "#E8DFD0",
        },
        // === SEMANTIC ===
        success: "#3A8B5C",
        warn: "#C9A14A",
        danger: "#B04B3A",
        info: "#0A66C2",
        // === RULES & BORDERS ===
        rule: {
          DEFAULT: "rgba(10, 26, 12, 0.08)",
          strong: "rgba(10, 26, 12, 0.14)",
          soft: "rgba(10, 26, 12, 0.04)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: ["Inter", "-apple-system", "Segoe UI", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        // Escala premium: pequeña y compacta tipo Mercury
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.025em" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12px", { lineHeight: "18px" }],
        base: ["13px", { lineHeight: "20px" }],
        md: ["14px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["18px", { lineHeight: "28px" }],
        "2xl": ["22px", { lineHeight: "30px", letterSpacing: "-0.01em" }],
        "3xl": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
        "4xl": ["36px", { lineHeight: "42px", letterSpacing: "-0.025em" }],
        "5xl": ["48px", { lineHeight: "54px", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        "premium-sm": "6px",
        "premium": "10px",
        "premium-lg": "14px",
        "premium-xl": "20px",
      },
      boxShadow: {
        // Shadows muy sutiles tipo Mercury — no tipo material design
        "premium-xs": "0 1px 2px rgba(10, 26, 12, 0.04)",
        "premium-sm": "0 1px 3px rgba(10, 26, 12, 0.05), 0 1px 2px rgba(10, 26, 12, 0.03)",
        "premium": "0 4px 12px -2px rgba(10, 26, 12, 0.05), 0 2px 4px rgba(10, 26, 12, 0.04)",
        "premium-md": "0 8px 24px -4px rgba(10, 26, 12, 0.08), 0 4px 8px rgba(10, 26, 12, 0.04)",
        "premium-lg": "0 16px 48px -8px rgba(10, 26, 12, 0.12)",
        "ring-accent": "0 0 0 3px rgba(196, 168, 130, 0.35)",
        "ring-ink": "0 0 0 3px rgba(10, 26, 12, 0.08)",
      },
      spacing: {
        "px": "1px",
        "0.5": "2px",
        "1.5": "6px",
        "2.5": "10px",
        "3.5": "14px",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "scale-in": "scale-in 0.18s ease-out",
        "shimmer": "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
