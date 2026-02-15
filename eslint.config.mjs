import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // SP-12: Rules downgraded to warn until codebase cleanup is complete.
  // These track pre-existing issues without blocking CI.
  // Promote back to error as each category is cleaned up.
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "import/no-anonymous-default-export": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-production files — separate lint configs or rules apply
    "tests/**",
    "__tests__/**",
    "scripts/**",
    "prompts/**",
  ]),
]);

export default eslintConfig;
