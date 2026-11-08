import { lazy, Suspense, type ComponentProps } from "react";
import type { DemoCredentials as DemoCredentialsComponent } from "./demo-credentials";
import { DEMO_MODE_ENABLED } from "@/lib/demo/mode";

/**
 * Demo credentials picker, present only in demo builds.
 *
 * `demo-credentials.tsx` pulls in the published demo passwords, so it must not
 * exist in a production artifact at all. `React.lazy` alone is not enough: the
 * chunk would still be emitted and its filename listed in the entry chunk's
 * preload map, so anyone could fetch it.
 *
 * `IS_DEMO_BUILD` is written purely in terms of `import.meta.env.*` reads
 * compared with string literals. Vite inlines those at build time, so in a
 * production build the whole condition folds to `false`, the `import()` below
 * is dead code, and Rollup drops the chunk. It mirrors the precedence in
 * `lib/demo/mode.ts` (VITE_APP_MODE wins; VITE_DEMO_MODE is the legacy alias).
 * Keep it as literal comparisons — wrapping it in a helper defeats the folding.
 */
const IS_DEMO_BUILD =
  import.meta.env.VITE_APP_MODE === "demo" ||
  (import.meta.env.VITE_APP_MODE !== "production" &&
    (import.meta.env.VITE_DEMO_MODE === "true" ||
      import.meta.env.VITE_DEMO_MODE === "1" ||
      import.meta.env.VITE_DEMO_MODE === "yes" ||
      import.meta.env.VITE_DEMO_MODE === "on"));

const DemoCredentials = IS_DEMO_BUILD
  ? lazy(() => import("./demo-credentials").then((m) => ({ default: m.DemoCredentials })))
  : null;

export function LazyDemoCredentials(props: ComponentProps<typeof DemoCredentialsComponent>) {
  // Runtime check kept as well: the server can be started with a different
  // APP_MODE than the client bundle was built with.
  if (!DEMO_MODE_ENABLED || !DemoCredentials) return null;
  return (
    <Suspense fallback={null}>
      <DemoCredentials {...props} />
    </Suspense>
  );
}
