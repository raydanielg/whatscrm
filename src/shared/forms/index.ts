/**
 * Enterprise form standards. Import from a single path:
 *
 *   import {
 *     Wizard, WizardStep, WizardSteps, WizardNav, WizardProgress, useWizard,
 *     useAutosave, AutosaveIndicator,
 *     FileDropzone, ImageDropzone,
 *     FormBanner, InlineFieldMessage,
 *     emailSchema, passwordSchema, boundedString, ...
 *   } from "@/shared/forms";
 *
 * Pair with `FormField` from `@/shared/components` for accessible fields.
 */
export {
  Wizard,
  WizardStep,
  WizardSteps,
  WizardNav,
  WizardProgress,
  useWizard,
  type WizardStep as WizardStepDef,
} from "./wizard";
export { useAutosave, type AutosaveStatus, type UseAutosaveOptions } from "./use-autosave";
export { AutosaveIndicator } from "./autosave-indicator";
export {
  FileDropzone,
  ImageDropzone,
  type FileDropzoneProps,
  type UploadedFile,
} from "./file-dropzone";
export { FormBanner, InlineFieldMessage, type MessageTone } from "./form-messages";
export * from "./validation";
