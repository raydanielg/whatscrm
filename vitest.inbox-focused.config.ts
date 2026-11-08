import { defineConfig } from "vitest/config";
import path from "node:path";

/** Focused inbox suites that run independently of the full app setup. */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/notification-sounds.test.ts",
      "tests/unit/inbox-reply-link.test.ts",
      "tests/unit/notification-presentation.test.ts",
      "tests/unit/notification-action-url.test.ts",
      "tests/unit/meta-public-origin.test.ts",
      "tests/unit/ai-provider-error.test.ts",
      "tests/unit/ai-byok-migration.test.ts",
      "tests/unit/social-inbox.test.ts",
      "tests/unit/tiktok-dm.test.ts",
      "tests/unit/youtube-token.test.ts",
    ],
  },
});
