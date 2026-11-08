/**
 * Barrel — public surface of the Extension Platform.
 * Host app + plugin code import from here.
 */
export * from './event-bus';
export * from './hooks';
export * from './event-catalog';
export * from './permissions';
export * from './semver';
export * from './license';
export * from './module-loader';
export * from './manager';
export { plugins as pluginRegistry } from './sdk';
export type { PluginManifest, PluginPermission, ExtensionPoint, ExtensionRegistration } from './sdk';

// Developer-facing Extension SDK
export { definePlugin } from './dev-sdk';
export type { DefinePluginOptions, ExtensionContext, DefinedPlugin, PluginStorage, PluginLogger } from './dev-sdk';
export { extensionRegistry } from './extension-registry';
export type {
  ExtensionRegion, PageContribution, MenuContribution, WidgetContribution,
  DashboardCardContribution, ReportContribution, ApiEndpointContribution,
  WorkflowActionContribution, WorkflowTriggerContribution, WorkflowFieldSchema,
  WorkflowRunContext, AiToolContribution, AiToolContext, IntegrationContribution,
  IntegrationAuth, TableContribution, TableColumn, BackgroundJobContribution,
  JobRunContext, EventContribution, ComponentInjectionContribution,
  PluginApiRequest, PluginApiResponse,
} from './extension-registry';
export * from './use-extension-registry';
export { PluginSlot } from './PluginSlot';
