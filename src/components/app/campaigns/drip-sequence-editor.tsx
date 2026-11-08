import { useEffect, useState } from "react";
import {
  useDripSequence,
  useSaveDripSequence,
  useEnrollDripContact,
  type DripStepRow,
} from "@/hooks/use-marketing";
import { useContacts, contactDisplayName } from "@/hooks/use-contacts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useTemplates } from "@/hooks/use-wa-templates";
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { extractTemplateVariables } from "@/lib/marketing/variable-validation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { toast } from "sonner";

export function DripSequenceEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { active } = useCurrentWorkspace();
  const { data, isLoading, error } = useDripSequence(id ?? undefined);
  const { data: templateData } = useTemplates(active?.id);
  const { data: accountData } = useChannelAccounts(active?.id);
  const save = useSaveDripSequence();
  const enroll = useEnrollDripContact();
  const { data: contacts = [] } = useContacts();
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");
  const [steps, setSteps] = useState<Partial<DripStepRow>[]>([]);
  useEffect(() => {
    if (!data?.sequence) return;
    setName(data.sequence.name);
    setDescription(data.sequence.description ?? "");
    setTrigger(data.sequence.trigger_type);
    setSteps(data.steps.map((s) => ({ ...s, variables: { ...s.variables } })));
    setContactId("");
  }, [data]);
  const templates = (templateData?.templates ?? []).filter(
    (t) => t.status?.toUpperCase() === "APPROVED",
  );
  const readOnly = data?.sequence?.status === "active";
  const update = (index: number, patch: Partial<DripStepRow>) =>
    setSteps((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const move = (index: number, delta: number) =>
    setSteps((rows) => {
      const copy = [...rows];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });
  const submit = async () => {
    if (!id || !name.trim() || !steps.length) return;
    if (steps.some((s) => !Number.isFinite(s.delay_seconds) || Number(s.delay_seconds) < 0)) {
      toast.error("Every delay must be a non-negative number.");
      return;
    }
    try {
      await save.mutateAsync({ id, name, description, trigger_type: trigger, steps });
      toast.success("Sequence saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save sequence");
    }
  };
  return (
    <Dialog
      open={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit drip sequence</DialogTitle>
          <DialogDescription>
            Configure the journey and ordered messages. Each approved template selects its WhatsApp
            sender.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          {isLoading ? (
            <p>Loading sequence</p>
          ) : error ? (
            <p role="alert">Could not load sequence: {error.message}</p>
          ) : !data?.sequence ? (
            <p role="alert">Sequence not found.</p>
          ) : (
            <>
              {readOnly && <p role="alert">Pause this sequence before editing its steps.</p>}
              <label className="block text-sm space-y-1">
                Sequence name
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
              </label>
              <label className="block text-sm space-y-1">
                Description
                <RichTextarea
                  value={description}
                  onChange={(v) => setDescription(v)}
                  disabled={readOnly}
                />
              </label>
              <label className="block text-sm space-y-1">
                Trigger
                <select
                  className="w-full border rounded-control p-2 bg-background"
                  value={trigger}
                  disabled={readOnly}
                  onChange={(e) => setTrigger(e.target.value)}
                >
                  {Array.from(
                    new Set([
                      trigger,
                      "manual",
                      "contact_created",
                      "no_reply",
                      "lead_stalled",
                      "birthday",
                      "anniversary",
                    ]),
                  ).map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {steps.map((step, i) => {
                const template = templates.find((t) => t.id === step.template_id);
                const variables = extractTemplateVariables(template?.components);
                return (
                  <fieldset key={i} className="rounded-control border p-4 space-y-3" disabled={readOnly}>
                    <legend className="px-1 text-sm font-medium">Step {i + 1}</legend>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={i === 0 || readOnly}
                        onClick={() => move(i, -1)}
                      >
                        Move up
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={i === steps.length - 1 || readOnly}
                        onClick={() => move(i, 1)}
                      >
                        Move down
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSteps((s) => s.filter((_, index) => index !== i))}
                      >
                        Remove step
                      </Button>
                    </div>
                    <label className="block text-sm">
                      Step name
                      <Input
                        value={step.name ?? ""}
                        onChange={(e) => update(i, { name: e.target.value })}
                      />
                    </label>
                    <label className="block text-sm">
                      Delay before this step (hours)
                      <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={Number(step.delay_seconds ?? 0) / 3600}
                        onChange={(e) =>
                          update(i, { delay_seconds: Number(e.target.value) * 3600 })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      WhatsApp template and sender
                      <select
                        className="w-full border rounded-control p-2 bg-background"
                        value={step.template_id ?? ""}
                        onChange={(e) =>
                          update(i, { template_id: e.target.value || null, variables: {} })
                        }
                      >
                        <option value="">Choose a template before activation</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {t.language}
                            {(() => {
                              const account = accountData?.accounts.find(
                                (a) => a.id === t.channel_account_id,
                              );
                              const label = account?.display_name || account?.phone_number;
                              return label ? ` · ${label}` : "";
                            })()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Message / draft notes
                      <RichTextarea
                        value={step.message_body ?? ""}
                        onChange={(v) => update(i, { message_body: v })}
                      />
                    </label>
                    {variables.map((variable) => (
                      <label className="block text-sm" key={variable.token}>
                        Template value: {variable.token}
                        <Input
                          value={String(step.variables?.[variable.token] ?? "")}
                          onChange={(e) =>
                            update(i, {
                              variables: { ...step.variables, [variable.token]: e.target.value },
                            })
                          }
                        />
                      </label>
                    ))}
                  </fieldset>
                );
              })}
              <Button
                variant="outline"
                disabled={readOnly}
                onClick={() =>
                  setSteps((s) => [
                    ...s,
                    {
                      name: `Message ${s.length + 1}`,
                      step_type: "message",
                      delay_seconds: 0,
                      message_body: "",
                      template_id: null,
                      variables: {},
                    },
                  ])
                }
              >
                Add step
              </Button>
              <p className="text-xs text-muted-foreground">
                Draft text is saved for editing. WhatsApp delivery uses the approved template and
                its values. New-contact journeys enroll future contacts automatically; other event
                triggers require their event integration.
              </p>
              {data.sequence.status === "active" && (
                <div className="rounded-control border p-3 space-y-2">
                  <label className="block text-sm">
                    Enroll a contact
                    <select
                      className="w-full border rounded-control p-2 bg-background"
                      value={contactId}
                      onChange={(e) => setContactId(e.target.value)}
                    >
                      <option value="">Choose a contact</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {contactDisplayName(c)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={!contactId || enroll.isPending}
                    onClick={async () => {
                      try {
                        await enroll.mutateAsync({ sequenceId: data.sequence!.id, contactId });
                        toast.success("Contact enrolled");
                        setContactId("");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not enroll contact");
                      }
                    }}
                  >
                    {enroll.isPending ? "Enrolling" : "Enroll contact"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <div className="shrink-0 flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={
              save.isPending ||
              isLoading ||
              !!error ||
              !data?.sequence ||
              readOnly ||
              !name.trim() ||
              !steps.length
            }
            onClick={submit}
          >
            {save.isPending ? "Saving" : "Save sequence"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
