// @ts-check
/**
 * ESLint flat configuration.
 *
 * Authority: PRD 12.2 - "No `any`, disabled lint rule, skipped test, blanket
 * accessibility suppression, or catch-and-ignore error without a reviewed
 * exception." A prohibition is only real if something checks it, so the rules
 * below encode that clause rather than restating it in prose.
 *
 * Type-aware linting is enabled (projectService). It costs a slower run but is
 * the only way to catch floating promises and unsafe `any` flow, which are the
 * failure modes that actually matter in a build pipeline.
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Generated artifacts are never hand-edited (PRD 8.3, rule GEN-FIELD-001),
    // so linting them would report on output nobody may fix by hand.
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "coverage/**",
      "content/schema/**",
      "content/projects/**",
      "fixtures/**",
      "*.tsbuildinfo",
      // Next build output. Bundled, minified, and regenerated on every build —
      // linting it reports thousands of violations in code nobody wrote.
      "**/.next/**",
      "apps/web/out/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      // A disable comment that no longer suppresses anything is stale
      // permission to break a rule. Fail on it.
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // -- PRD 12.2: no `any` ------------------------------------------------
      "@typescript-eslint/no-explicit-any": "error",

      // -- PRD 12.2: no catch-and-ignore -------------------------------------
      // Empty catches are allowed ONLY where the code documents why, so this
      // stays an error and exceptions are justified inline and reviewed.
      "no-empty": ["error", { allowEmptyCatch: false }],

      // -- Correctness -------------------------------------------------------
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],

      // Unused code is either a mistake or dead weight. A leading underscore is
      // the deliberate opt-out for genuinely unused bindings.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // -- Style that carries meaning ----------------------------------------
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // verbatimModuleSyntax is on, so extensionless relative imports break at
      // runtime under NodeNext. Catch it at lint time, not in production.
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },

  {
    // Plain JS config files (this file included) are not in any tsconfig
    // project, and enabling allowJs just to lint them would change how the
    // compiler treats the whole workspace. Lint them without type information.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    // CLI entry points legitimately write to stdout and read argv.
    files: ["**/cli/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  {
    // Tests assert on shapes that are deliberately malformed, so the
    // type-aware unsafe-* rules produce noise rather than signal here.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },

  // Must stay last: turns off every rule that would fight Prettier.
  prettier,
);
