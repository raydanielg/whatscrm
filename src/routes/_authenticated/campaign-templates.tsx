import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  useCampaignTemplates,
  useUpsertCampaignTemplate,
  useDeleteCampaignTemplate,
  useMarketingExtrasRealtime,
} from "@/hooks/use-marketing-extras";

export const Route = createFileRoute("/_authenticated/campaign-templates")({
  component: CampaignTemplatesPage,
});

function CampaignTemplatesPage() {
  useMarketingExtrasRealtime();
  const { data: templates, isLoading } = useCampaignTemplates();
  const upsert = useUpsertCampaignTemplate();
  const del = useDeleteCampaignTemplate();
  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    description: string;
    category: string;
    channel: string;
    message_body: string;
  }>(null);

  return (
    <>
      <AppTopbar
        title="Campaign Templates"
        subtitle="Reusable presets for broadcasts, drips and A/B variants"
        actions={
          <button
            onClick={() =>
              setEditing({
                name: "",
                description: "",
                category: "promotional",
                channel: "whatsapp",
                message_body: "",
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New template
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {editing && (
          <div className="rounded-control border border-border bg-surface p-4 shadow-sm space-y-3">
            <div className="font-medium">{editing.id ? "Edit template" : "New template"}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="px-3 py-2 rounded-control border border-border bg-background text-sm"
                placeholder="Template name"
                value={editing.name}
                onChange={(e) => setEditing((f) => (f ? { ...f, name: e.target.value } : f))}
              />
              <input
                className="px-3 py-2 rounded-control border border-border bg-background text-sm"
                placeholder="Category (promotional, transactional)"
                value={editing.category}
                onChange={(e) => setEditing((f) => (f ? { ...f, category: e.target.value } : f))}
              />
              <input
                className="px-3 py-2 rounded-control border border-border bg-background text-sm md:col-span-2"
                placeholder="Description"
                value={editing.description}
                onChange={(e) =>
                  setEditing((f) => (f ? { ...f, description: e.target.value } : f))
                }
              />
              <textarea
                className="px-3 py-2 rounded-control border border-border bg-background text-sm md:col-span-2 min-h-[120px] font-mono"
                placeholder="Message body — use {{first_name}} for variables"
                value={editing.message_body}
                onChange={(e) =>
                  setEditing((f) => (f ? { ...f, message_body: e.target.value } : f))
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-3 py-1.5 rounded-control text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                disabled={!editing.name || upsert.isPending}
                onClick={async () => {
                  await upsert.mutateAsync({
                    id: editing.id,
                    name: editing.name,
                    description: editing.description || null,
                    category: editing.category || null,
                    channel: editing.channel,
                    message_body: editing.message_body || null,
                  });
                  setEditing(null);
                }}
                className="px-3 py-1.5 rounded-control text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Save template
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading</div>
        ) : !templates || templates.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No templates yet</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="rounded-control border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.category ?? "general"} · {t.channel} · used {t.usage_count}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setEditing({
                        id: t.id,
                        name: t.name,
                        description: t.description ?? "",
                        category: t.category ?? "",
                        channel: t.channel,
                        message_body: t.message_body ?? "",
                      })
                    }
                    className="text-xs px-2 py-1 rounded-control hover:bg-muted"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => del.mutate(t.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {t.message_body && (
                  <div className="text-xs text-muted-foreground mt-2 line-clamp-3 whitespace-pre-wrap">
                    {t.message_body}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
