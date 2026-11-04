import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import testingLibrary from "eslint-plugin-testing-library";

// ESLint 9 (flat config) вместо eslint-config-react-app из CRA — те же по смыслу правила:
// рекомендованные JS + React, правила хуков, testing-library в тестах. `npm run lint` / `make lint`.
const TESTS = ["src/**/__tests__/**/*.{js,jsx}", "src/**/*.test.{js,jsx}", "src/setupTests.js"];

export default [
  // supabase/functions — Deno, у них свой `deno lint` (CI).
  { ignores: ["build/", "coverage/", "public/", "supabase/functions/"] },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      // Только классические правила хуков: остальной recommended v7 — правила React Compiler,
      // а компилятор в проекте не используется (паттерн saveRef.current = … в рендере — §18).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Пропсы без PropTypes (TypeScript нет — см. §2).
      "react/prop-types": "off",
      // Как в CRA: неиспользуемые аргументы и «...rest»-отбрасывание — не ошибка.
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
    },
  },

  {
    files: TESTS,
    ...testingLibrary.configs["flat/react"],
    // Тесты идут в Node (Vitest): фикстуры читаются через fs и __dirname.
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.vitest } },
    rules: {
      ...testingLibrary.configs["flat/react"].rules,
      // fireEvent в React Testing Library и userEvent 13 — синхронные; правило — для userEvent 14
      // (там события нужно await). При переходе на userEvent 14 — включить и расставить await.
      "testing-library/await-async-events": "off",
    },
  },

  {
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
