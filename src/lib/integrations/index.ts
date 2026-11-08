/**
 * Public entry: registers every provider on module load. Import this once at
 * app boot (or from any file that needs the registry) — providers are
 * self-contained and pluggable.
 */
import { registerProvider } from "./core";
import { ALL_PROVIDERS } from "./providers";

for (const p of ALL_PROVIDERS) registerProvider(p);

export * from "./core";
export * from "./providers";
