import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SecretValidationAlert,
  type SecretNameValidation,
} from "@/components/app/whatsapp/secret-name-validation";

/**
 * Non-indexed probe page used by `tests/e2e/whatsapp-secret-overflow.spec.ts`.
 *
 * Renders the WhatsApp account dialog chrome (same DialogContent classes as
 * `whatsapp-accounts-panel.tsx`) with a deliberately pathological secret name —
 * a full-length Meta access token pasted into the name field — so the visual
 * regression spec can assert nothing overflows horizontally at any viewport.
 */
export const Route = createFileRoute("/whatsapp-secret-overflow-probe")({
  head: () => ({
    meta: [
      { title: "WhatsApp Secret Overflow Probe" },
      {
        name: "description",
        content: "Internal test surface for long secret name wrapping in the WhatsApp dialog.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Probe,
});

/** A realistic 300+ char Meta system-user token with no spaces or hyphens. */
const LONG_TOKEN =
  "EAAG" + "ZAbcdefghijklmnopqrstuvwxyz0123456789".repeat(9) + "ZDZD";

const VALIDATION: SecretNameValidation = {
  isChecking: false,
  checked: true,
  ok: false,
  missing: [
    {
      name: LONG_TOKEN,
      present: false,
      severity: "required",
      purpose:
        "Permanent Meta System User token used to call the WhatsApp Cloud API on behalf of this account.",
      usedBy: ["Support (EU)"],
      remedy: `Create a secret named exactly ${LONG_TOKEN} and paste your permanent Meta System User token as its value.`,
    },
    {
      name: "WHATSAPP_APP_SECRET_" + "X".repeat(120),
      present: false,
      severity: "recommended",
      purpose: "Used to verify the X-Hub-Signature-256 header on incoming webhooks.",
      usedBy: ["Support (EU)"],
    },
  ],
  missingRequired: [
    {
      name: LONG_TOKEN,
      present: false,
      severity: "required",
      purpose: "Permanent Meta System User token.",
      usedBy: ["Support (EU)"],
    },
  ],
};

function Probe() {
  const [open] = useState(true);

  return (
    <div className="min-h-screen bg-background p-6">
      <h1 className="text-lg font-medium">WhatsApp Secret Overflow Probe</h1>

      <Dialog open={open}>
        <DialogContent
          data-testid="wa-probe-dialog"
          className="w-[calc(100vw-2rem)] max-w-lg min-w-0 max-h-[85vh] overflow-y-auto overflow-x-hidden"
        >
          <DialogHeader>
            <DialogTitle>Edit WhatsApp account</DialogTitle>
            <DialogDescription>
              Access tokens live in project secrets — reference them by name.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-w-0 gap-3 py-2">
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="wa-probe-secret-name">Access token secret name</Label>
              <Input id="wa-probe-secret-name" defaultValue={LONG_TOKEN} readOnly />
            </div>

            <div data-testid="wa-probe-alert" className="min-w-0">
              <SecretValidationAlert validation={VALIDATION} />
            </div>
          </div>

          <DialogFooter>
            <Button data-testid="wa-probe-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
