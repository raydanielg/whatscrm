import { APP_MODE } from "@/lib/demo/mode";

/** Keep resource shortcuts in development and demo builds, but not production. */
export const SHOW_RESOURCE_LINKS = import.meta.env.DEV || APP_MODE !== "production";
