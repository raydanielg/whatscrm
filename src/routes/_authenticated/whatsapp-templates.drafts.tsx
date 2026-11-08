import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Edit3, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTemplates, useCreateTemplate, useDeleteTemplate } from "@/hooks/use-wa-templates";
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { TemplateEditorDialog } from "@/components/app/whatsapp/whatsapp-templates-panel";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/whatsapp-templates/drafts")({
  staticData: { breadcrumb: "Drafts" },
  head: () => ({
    meta: [
      { title: "Draft Templates" },
      {
        name: "description",
        content: "Saved WhatsApp template drafts with edit, duplicate, and delete actions.",
      },
    ],
  }),
  component: DraftsPage,
});

type Draft = {
  id: string;
  workspace_id: string;
  channel_account_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: Array<Record<string, unknown>>;
  updated_at: string;
};

function DraftsPage() {
  const formatZoned = useZonedDateFormatter();
  const { data: ws } = useCurrentWorkspace();
  const { data: accountsRes } = useChannelAccounts(ws?.id);
  const accounts = accountsRes?.accounts ?? [];
  const { data, isLoading, isError, error, refetch, isFetching } = useTemplates(ws?.id);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Draft | null>(null);

  const del = useDeleteTemplate();
  const create = useCreateTemplate();

  const drafts = useMemo(() => {
    const all = (data?.templates ?? []) as unknown as Draft[];
    return all
      .filter((t) => t.status === "draft")
      .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }, [data, search]);

  async function duplicate(t: Draft) {
    // Meta requires unique template names — append a short suffix
    const suffix = `_copy_${Math.random().toString(36).slice(2, 6)}`;
    await create.mutateAsync({
      workspaceId: t.workspace_id,
      channelAccountId: t.channel_account_id,
      name: `${t.name}${suffix}`.slice(0, 512),
      language: t.language,
      category: t.category as "MARKETING" | "UTILITY" | "AUTHENTICATION",
      components: t.components,
      submit: false,
    });
  }

  return (
    <>
      <AppTopbar
        title="Draft Templates"
        subtitle="Saved WhatsApp template drafts — pick one to keep editing, duplicate, or delete."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/whatsapp-templates">All templates</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/whatsapp-templates/create">
                <Plus className="w-4 h-4" /> New template
              </Link>
            </Button>
          </>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Input
          className="md:max-w-sm"
          placeholder="Search drafts by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="rounded-control border border-border">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>Failed to load drafts</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {error instanceof Error ? error.message : "Unknown error"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isFetching}
                  >
                    {isFetching ? "Retrying" : "Retry"}
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : drafts.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No drafts yet. Save a template as a draft to see it here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {t.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.language}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatZoned(new Date(t.updated_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Edit"
                          onClick={() => setEditing(t)}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Duplicate"
                          disabled={create.isPending}
                          onClick={() => duplicate(t)}
                        >
                          {create.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Delete"
                          onClick={() => setDeleting(t)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {editing && (
        <TemplateEditorDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          workspaceId={editing.workspace_id}
          channelAccountId={editing.channel_account_id}
          accounts={accounts}
          existing={editing as never}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the draft “{deleting?.name}”. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) del.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
