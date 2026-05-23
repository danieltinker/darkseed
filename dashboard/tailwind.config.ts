import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      colors: {
        category: {
          riskware: "#f59e0b", // amber-500
          toll_fraud: "#a855f7", // purple-500
          phishing: "#ef4444", // red-500
        },
        tactic: {
          initial: "#22d3ee",
          execute: "#60a5fa",
          persist: "#a78bfa",
          evade: "#fbbf24",
          escalate: "#fb923c",
          creds: "#f472b6",
          collect: "#34d399",
          c2: "#818cf8",
          exfil: "#fb7185",
          impact: "#ef4444",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
