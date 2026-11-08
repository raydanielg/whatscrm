/**
 * One-off migration: copy each chatbot's appearance (`chatbots.widget_config`)
 * into its linked Chat Widgets (`chat_widgets.config`).
 *
 * Safety rules:
 *  - Dry run by default. Pass --apply to write.
 *  - Only widgets whose config is still the untouched default are overwritten.
 *    A widget someone already customised is reported and skipped.
 *  - Before writing, a JSON backup of every affected widget is saved to
 *    scripts/.backups/ so the change can be reverted.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-bot-appearance-to-widgets.mjs
 *   ... node scripts/migrate-bot-appearance-to-widgets.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Mirrors DEFAULT_WIDGET_CONFIG in src/lib/widget/widget-config.ts.
// Keep these in sync if the defaults change.
const DEFAULT_WIDGET_CONFIG = {
  logoUrl: null, agentAvatarUrl: null, agentName: "Assistant",
  brandColor: "#075E54", brandTextColor: "#FFFFFF", theme: "light",
  radius: 16, bubbleStyle: "rounded", launcherPosition: "bottom-right",
  launcherIcon: "chat", launcherIconUrl: null, launcherLabel: null,
  welcomeTitle: "Hi there 👋", welcomeSubtitle: "How can we help?",
  welcomeMessage: "Ask us anything — a real human is one message away.",
  inputPlaceholder: "Type your message",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif", fontSizeBase: 14,
  width: 380, height: 620, animation: "slide", customCss: "", customJs: "",
  showBrandingFooter: true, soundEnabled: false,
};

const merge = (raw) =>
  !raw || typeof raw !== "object" ? { ...DEFAULT_WIDGET_CONFIG } : { ...DEFAULT_WIDGET_CONFIG, ...raw };

const isDefault = (raw) => {
  const m = merge(raw);
  return JSON.stringify(m, Object.keys(m).sort()) === JSON.stringify(DEFAULT_WIDGET_CONFIG, Object.keys(DEFAULT_WIDGET_CONFIG).sort());
};

const { data: widgets, error: wErr } = await db
  .from("chat_widgets")
  .select("id, name, chatbot_id, config")
  .not("chatbot_id", "is", null);
if (wErr) throw wErr;

const botIds = [...new Set(widgets.map((w) => w.chatbot_id))];
const { data: bots, error: bErr } = await db
  .from("chatbots")
  .select("id, name, widget_config")
  .in("id", botIds);
if (bErr) throw bErr;
const botById = new Map(bots.map((b) => [b.id, b]));

const plan = [];
const skipped = [];
for (const w of widgets) {
  const bot = botById.get(w.chatbot_id);
  if (!bot) { skipped.push({ widget: w.name, reason: "bot not found" }); continue; }
  if (!isDefault(w.config)) { skipped.push({ widget: w.name, reason: "already customised" }); continue; }
  if (isDefault(bot.widget_config)) { skipped.push({ widget: w.name, reason: "bot has default appearance" }); continue; }
  plan.push({ widgetId: w.id, widgetName: w.name, botName: bot.name, before: w.config, after: merge(bot.widget_config) });
}

console.log(`Widgets scanned: ${widgets.length}`);
console.log(`To update:       ${plan.length}`);
for (const p of plan) console.log(`  + ${p.widgetName}  <-  bot "${p.botName}"`);
console.log(`Skipped:         ${skipped.length}`);
for (const s of skipped) console.log(`  - ${s.widget}: ${s.reason}`);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to write changes.");
  process.exit(0);
}
if (plan.length === 0) { console.log("Nothing to update."); process.exit(0); }

const here = dirname(fileURLToPath(import.meta.url));
const backupDir = join(here, ".backups");
mkdirSync(backupDir, { recursive: true });
const backupFile = join(backupDir, `appearance-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(backupFile, JSON.stringify(plan, null, 2));
console.log(`Backup written: ${backupFile}`);

let ok = 0;
for (const p of plan) {
  const { error } = await db.from("chat_widgets").update({ config: p.after }).eq("id", p.widgetId);
  if (error) console.error(`FAILED ${p.widgetName}: ${error.message}`);
  else ok++;
}
console.log(`Updated ${ok}/${plan.length} widgets.`);
