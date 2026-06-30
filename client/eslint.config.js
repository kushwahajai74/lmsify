import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Flat config (ESLint 9+). Ignores the usual build artifacts and
 * the Vite config files (they're not source).
 */
export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "*.config.js",
      "*.config.ts",
      "src/components/ui/**", // shadcn-generated; don't lint third-party code
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
);
