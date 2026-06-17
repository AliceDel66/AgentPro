import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        agent: {
          bg: "#F6F9FD",
          ink: "#0B1220",
          text: "#344054",
          muted: "#5A6B82",
          subtle: "#8B9BB5",
          primary: "#155EEF",
          primaryHover: "#1350D4",
          pale: "#EAF3FF",
          paleHover: "#D6E8FF",
          border: "#D9E6F5",
          divider: "#E8EFF8",
          input: "#FAFCFE",
          cyan: "#2BB3D6",
          success: "#10B981",
          warning: "#F59E0B",
          danger: "#EF4444",
          purple: "#7C5CFC",
          claude: "#D97757"
        }
      },
      boxShadow: {
        agent: "0 4px 32px rgba(11,18,32,0.06)",
        "agent-sm": "0 1px 4px rgba(11,18,32,0.04)"
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["SF Mono", "Fira Code", "ui-monospace", "monospace"]
      },
      animation: {
        "agent-pulse": "agent-pulse 3s ease-in-out infinite",
        "agent-spin": "agent-spin 1s linear infinite"
      }
    }
  },
  darkMode: "class",
  plugins: [heroui()]
};

export default config;
