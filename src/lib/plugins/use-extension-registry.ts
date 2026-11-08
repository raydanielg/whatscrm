/**
 * React hooks that let host UI consume plugin contributions.
 *
 *   const pages = usePluginPages();
 *   const cards = usePluginDashboardCards();
 *   const widgets = usePluginWidgets('inbox.sidebar');
 */
import { useSyncExternalStore } from 'react';
import { extensionRegistry, type ExtensionRegion } from './extension-registry';

function subscribe(cb: () => void) { return extensionRegistry.subscribe(cb); }

export function usePluginPages() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listPages(), () => []);
}
export function usePluginMenus() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listMenus(), () => []);
}
export function usePluginWidgets(region: ExtensionRegion) {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listWidgetsIn(region), () => []);
}
export function usePluginDashboardCards() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listDashboardCards(), () => []);
}
export function usePluginReports() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listReports(), () => []);
}
export function usePluginApiEndpoints() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listApiEndpoints(), () => []);
}
export function usePluginWorkflowActions() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listWorkflowActions(), () => []);
}
export function usePluginWorkflowTriggers() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listWorkflowTriggers(), () => []);
}
export function usePluginAiTools() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listAiTools(), () => []);
}
export function usePluginIntegrations() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listIntegrations(), () => []);
}
export function usePluginTables() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listTables(), () => []);
}
export function usePluginJobs() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listJobs(), () => []);
}
export function usePluginEvents() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listEvents(), () => []);
}
export function usePluginInjections(region: ExtensionRegion) {
  return useSyncExternalStore(subscribe, () => extensionRegistry.listInjectionsIn(region), () => []);
}
export function usePluginStats() {
  return useSyncExternalStore(subscribe, () => extensionRegistry.stats(), () => extensionRegistry.stats());
}
