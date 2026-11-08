/**
 * Plugin Manager — the orchestrator.
 *
 * Owns the lifecycle: install → resolve deps → validate license → load
 * module → activate → run. Supports hot install / update / disable /
 * remove without a full page reload.
 *
 * Everything routes through server functions from `plugins.functions.ts`
 * for persistence and RLS; this module wires the runtime.
 */
import {
  installPlugin as srvInstall,
  uninstallPlugin as srvUninstall,
  listMyInstalledPlugins,
} from "./plugins.functions";
import { activatePlugin, deactivatePlugin, isPluginActive, activePlugins } from "./module-loader";
import { resolveDependencies, topologicalOrder, satisfies, type DepSpec } from "./semver";
import { validateLicense, type LicenseStatus } from "./license";
import type { Permission } from "./permissions";
import { doAction } from "./hooks";

export type InstalledPlugin = {
  installationId: string;
  pluginId: string;
  slug: string;
  version: string;
  entryUrl?: string | null;
  grantedPermissions: Permission[];
  dependencies?: DepSpec[];
  licenseKey?: string | null;
  licenseServerUrl?: string | null;
  pluginName: string;
  status: "active" | "disabled" | "error" | "pending";
};

type Snapshot = {
  installed: InstalledPlugin[];
  errors: Record<string, string>;
  licenses: Record<string, LicenseStatus>;
  loadedAt: number;
};

class PluginManager {
  private snap: Snapshot = { installed: [], errors: {}, licenses: {}, loadedAt: 0 };
  private subscribers = new Set<(s: Snapshot) => void>();
  private currentWorkspaceId: string | null = null;

  subscribe(fn: (s: Snapshot) => void): () => void {
    this.subscribers.add(fn);
    fn(this.snap);
    return () => this.subscribers.delete(fn);
  }

  private emit() {
    for (const fn of this.subscribers) fn(this.snap);
  }

  get snapshot(): Snapshot {
    return this.snap;
  }

  /** Load installed plugins from server, then hot-activate. */
  async bootstrap(workspaceId: string): Promise<void> {
    this.currentWorkspaceId = workspaceId;
    const { installations } = await listMyInstalledPlugins({});
    const installed = (installations ?? [])
      .map((i: any): InstalledPlugin => ({
        installationId: i.id,
        pluginId: i.plugin_id,
        slug: i.plugins?.slug ?? "",
        version: i.plugin_versions?.version ?? i.plugins?.latest_version ?? "0.0.0",
        entryUrl: i.plugin_versions?.entry_url,
        grantedPermissions: (i.granted_permissions ?? []) as Permission[],
        dependencies: (i.plugin_versions?.dependencies ?? []) as DepSpec[],
        licenseKey: i.license_key,
        licenseServerUrl: i.plugins?.license_server_url,
        pluginName: i.plugins?.name ?? "",
        status: i.status === "active" ? "active" : "disabled",
      }))
      .filter((p: any) => p.slug);

    const ordered = topologicalOrder(installed);
    const errors: Record<string, string> = {};
    const licenses: Record<string, LicenseStatus> = {};

    for (const p of ordered) {
      if (p.status !== "active") continue;
      // Dep check
      const dep = resolveDependencies({ dependencies: p.dependencies }, ordered);
      if (!dep.ok) {
        errors[p.slug] = "Missing or incompatible dependencies";
        continue;
      }
      // License check
      if (p.licenseKey) {
        const status = await validateLicense({
          licenseKey: p.licenseKey,
          pluginSlug: p.slug,
          workspaceId,
          licenseServerUrl: p.licenseServerUrl,
        });
        licenses[p.slug] = status;
        if (status.state === "invalid" || status.state === "expired") {
          errors[p.slug] =
            status.state === "expired" ? "License expired" : `License invalid: ${status.reason}`;
          continue;
        }
      } else {
        licenses[p.slug] = { state: "not_required" };
      }
      // Activate
      try {
        await activatePlugin({
          slug: p.slug,
          version: p.version,
          entryUrl: p.entryUrl,
          grantedPermissions: p.grantedPermissions,
        });
      } catch (err) {
        errors[p.slug] = err instanceof Error ? err.message : "Activation failed";
      }
    }

    this.snap = { installed: ordered, errors, licenses, loadedAt: Date.now() };
    this.emit();
    await doAction("app.plugins.ready", { count: ordered.length });
  }

  /** Hot install — call server, then dynamic-activate without reload. */
  async install(
    pluginId: string,
    opts?: { versionId?: string; grantedPermissions?: Permission[]; licenseKey?: string },
  ): Promise<void> {
    await srvInstall({
      data: { pluginId, versionId: opts?.versionId, grantedPermissions: opts?.grantedPermissions },
    });
    if (this.currentWorkspaceId) {
      await this.bootstrap(this.currentWorkspaceId);
      const plugin = this.snap.installed.find((item) => item.pluginId === pluginId);
      if (plugin && this.snap.errors[plugin.slug]) {
        throw new Error(`Plugin saved but could not start: ${this.snap.errors[plugin.slug]}`);
      }
    }
  }

  /** Hot update — new version already saved server-side; reload the module in place. */
  async update(slug: string): Promise<void> {
    await deactivatePlugin(slug);
    if (this.currentWorkspaceId) await this.bootstrap(this.currentWorkspaceId);
  }

  /** Hot disable — teardown module + revoke perms, keep install row. */
  async disable(slug: string): Promise<void> {
    await deactivatePlugin(slug);
    this.snap.installed = this.snap.installed.map((p) =>
      p.slug === slug ? { ...p, status: "disabled" } : p,
    );
    this.emit();
  }

  /** Hot enable — activate a currently-installed plugin. */
  async enable(slug: string): Promise<void> {
    const p = this.snap.installed.find((x) => x.slug === slug);
    if (!p) throw new Error(`Plugin not installed: ${slug}`);
    await activatePlugin({
      slug: p.slug,
      version: p.version,
      entryUrl: p.entryUrl,
      grantedPermissions: p.grantedPermissions,
    });
    this.snap.installed = this.snap.installed.map((x) =>
      x.slug === slug ? { ...x, status: "active" } : x,
    );
    this.emit();
  }

  /** Hot remove — teardown then delete install row. */
  async remove(slug: string, pluginId: string): Promise<void> {
    await deactivatePlugin(slug);
    await srvUninstall({ data: { pluginId } });
    this.snap.installed = this.snap.installed.filter((p) => p.slug !== slug);
    this.emit();
  }

  isActive(slug: string): boolean {
    return isPluginActive(slug);
  }
  activePlugins() {
    return activePlugins();
  }

  /**
   * Compatibility check — quick pre-flight before installing a version.
   * `range` uses the app's SDK version (host).
   */
  isHostCompatible(hostVersion: string, minAppVersion?: string | null): boolean {
    if (!minAppVersion) return true;
    return satisfies(hostVersion, `>=${minAppVersion}`);
  }
}

export const pluginManager = new PluginManager();
