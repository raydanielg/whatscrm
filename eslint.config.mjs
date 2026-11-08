import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Header/chrome height enforcement.
 *
 * The app-shell chrome (topbar, footer, sidebar header/footer, sub-headers) MUST
 * resolve its vertical size through the design token `--height-header`
 * (Tailwind: `h-header` / `h-15`). Hardcoded values like `h-14`, `h-16`,
 * `top-14`, `top-16`, literal `60px`, or `3.75rem` in className strings drift
 * away from the token and break the layout-height regression tests.
 */
const HEADER_HEIGHT_MESSAGE =
  "Hardcoded chrome height. Use `h-header` / `h-15` (or `var(--height-header)` in CSS) instead of `h-14`, `h-16`, `top-14`, `top-16`, `60px`, or `3.75rem`.";

// Matches forbidden Tailwind utilities: h-14, h-16, min-h-14, max-h-16, top-14, top-16, etc.
const FORBIDDEN_UTILITY_RE = String.raw`\b(?:min-|max-)?(?:h|top)-(?:14|16)\b`;
// Matches literal pixel/rem values for the header height.
const FORBIDDEN_VALUE_RE = String.raw`(?:^|[\s'"\`\[(:;,])(?:60px|3\.75rem)(?:$|[\s'"\`\])};,])`;

/**
 * Global rules — apply everywhere. Literal `60px` / `3.75rem` inside a `style`
 * attribute is almost always a leaked chrome height; use `var(--height-header)`
 * instead. We deliberately do NOT flag `[60px]` / `[3.75rem]` inside a
 * className arbitrary-value bracket, since `min-h-[60px]` on unrelated
 * components (textareas, cards) is a legitimate size and not chrome.
 */
const noHardcodedHeaderValueGlobal = [
  {
    selector:
      "JSXAttribute[name.name='style'] Literal[value=/(?:^|[\\s'\"`(:;,])(?:60px|3\\.75rem)(?:$|[\\s'\"`);,])/]",
    message: HEADER_HEIGHT_MESSAGE,
  },
  {
    selector:
      "JSXAttribute[name.name='style'] TemplateElement[value.raw=/(?:^|[\\s'\"`(:;,])(?:60px|3\\.75rem)(?:$|[\\s'\"`);,])/]",
    message: HEADER_HEIGHT_MESSAGE,
  },
  {
    // `style={{ height: "60px" }}` / `style={{ top: "3.75rem" }}`
    selector:
      "JSXAttribute[name.name='style'] Property[key.name=/^(height|minHeight|maxHeight|top)$/] Literal[value=/^(?:60px|3\\.75rem)$/]",
    message: HEADER_HEIGHT_MESSAGE,
  },
];


/**
 * Strict rules — apply only to files that OWN the app shell chrome (topbar,
 * sidebar, footer, root layout). Mirrors the CHROME_FILES allowlist in
 * tests/e2e/layout-height-regression.spec.ts. In these files, `h-14`, `h-16`,
 * `top-14`, `top-16`, and their min/max variants ARE forbidden — chrome must
 * resolve every height through `--height-header`.
 */
const CHROME_FILES = [
  "src/components/app/app-sidebar.tsx",
  "src/components/app/app-topbar.tsx",
  "src/components/app/app-footer.tsx",
  "src/components/app/app-shell.tsx",
  "src/components/app/mobile-nav.tsx",
  "src/components/app/marketing-shell.tsx",
  "src/components/admin/admin-shell.tsx",
  "src/components/admin/admin-sidebar.tsx",
  "src/components/admin/admin-topbar.tsx",
  "src/routes/__root.tsx",
  "src/routes/_authenticated.tsx",
  "src/routes/_super-admin.tsx",
];

const noHardcodedHeaderUtilityChrome = [
  {
    selector:
      "JSXAttribute[name.name='className'] Literal[value=/\\b(?:min-|max-)?(?:h|top)-(?:14|16)\\b/]",
    message: HEADER_HEIGHT_MESSAGE,
  },
  {
    selector:
      "JSXAttribute[name.name='className'] TemplateElement[value.raw=/\\b(?:min-|max-)?(?:h|top)-(?:14|16)\\b/]",
    message: HEADER_HEIGHT_MESSAGE,
  },
];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...noHardcodedHeaderValueGlobal],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // App-shell chrome: forbid raw h-14 / h-16 / top-14 / top-16 utilities on
    // top of the global literal-value rule.
    files: CHROME_FILES,
    rules: {
      "no-restricted-syntax": [
        "error",
        ...noHardcodedHeaderValueGlobal,
        ...noHardcodedHeaderUtilityChrome,
      ],
    },
  },
  {
    // The header-height utility, its probe route, and the regression tests
    // legitimately reference the raw values while asserting the token resolves
    // to them. Exempt them from the hardcoded-height rule only.
    files: [
      "src/lib/layout/header-height.tsx",
      "src/routes/header-height-probe.tsx",
      "tests/e2e/header-height.spec.ts",
      "tests/e2e/layout-height-regression.spec.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },

  eslintPluginPrettier,
);

