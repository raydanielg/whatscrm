import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { ListChecks, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import {
  useContactLists,
  useUpsertContactList,
  useDeleteContactList,
  useMarketingExtrasRealtime,
} from "@/hooks/use-marketing-extras";
import type { ContactListRow } from "@/hooks/use-marketing-extras";
import { useSegments } from "@/hooks/use-marketing";
import { ContactListMembersSheet } from "@/components/app/marketing/contact-list-members-sheet";

export const Route = createFileRoute("/_authenticated/contact-lists")({
  component: ContactListsPage,
});

function ContactListsPage() {
  useMarketingExtrasRealtime();
  const { data: lists, isLoading } = useContactLists();
  const { data: segments } = useSegments();
  const upsert = useUpsertContactList();
  const del = useDeleteContactList();
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState<ContactListRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    type: "static" as "static" | "dynamic",
    segment_id: "" as string,
  });

  return (
    <>
      <AppTopbar
        title="Contact Lists"
        subtitle="Static & dynamic lists for targeted campaigns"
        actions={
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New list
          </button>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {creating && (
          <div className="rounded-control border border-border bg-surface p-4 shadow-sm space-y-3">
            <div className="font-medium">New contact list</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="px-3 py-2 rounded-control border border-border bg-background text-sm"
                placeholder="List name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="px-3 py-2 rounded-control border border-border bg-background text-sm"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as "static" | "dynamic" }))
                }
              >
                <option value="static">Static — manual members</option>
                <option value="dynamic">Dynamic — from segment</option>
              </select>
              <input
                className="px-3 py-2 rounded-control border border-border bg-background text-sm md:col-span-2"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              {form.type === "dynamic" && (
                <select
                  className="px-3 py-2 rounded-control border border-border bg-background text-sm md:col-span-2"
                  value={form.segment_id}
                  onChange={(e) => setForm((f) => ({ ...f, segment_id: e.target.value }))}
                >
                  <option value="">Choose a segment</option>
                  {(segments ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.member_count})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 rounded-control text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                disabled={!form.name || upsert.isPending}
                onClick={async () => {
                  await upsert.mutateAsync({
                    name: form.name,
                    description: form.description || null,
                    type: form.type,
                    segment_id: form.type === "dynamic" ? form.segment_id || null : null,
                  });
                  setForm({ name: "", description: "", type: "static", segment_id: "" });
                  setCreating(false);
                }}
                className="px-3 py-1.5 rounded-control text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading</div>
        ) : !lists || lists.length === 0 ? (
          <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
            <ListChecks className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No contact lists yet</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((l) => (
              <div
                key={l.id}
                className="rounded-control border border-border bg-surface p-4 shadow-sm hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                    <ListChecks className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.member_count.toLocaleString()} members ·{" "}
                      <span className="capitalize">{l.type}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setManage(l)}
                    className="text-muted-foreground hover:text-primary"
                    aria-label="Manage members"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => del.mutate(l.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete list"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {l.description && (
                  <div className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {l.description}
                  </div>
                )}
                <button
                  onClick={() => setManage(l)}
                  className="mt-3 w-full px-3 py-1.5 rounded-control border border-border text-sm hover:bg-muted"
                >
                  Manage members
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <ContactListMembersSheet
        list={manage}
        open={!!manage}
        onOpenChange={(v) => !v && setManage(null)}
      />
    </>
  );
}
