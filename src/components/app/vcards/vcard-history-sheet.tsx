import { useState } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { History, RotateCcw, Loader2 } from 'lucide-react';
import { WorkspaceContextIndicator } from '@/components/app/vcards/workspace-context-indicator';
import {
  useVCardRevisions, useRestoreVCardVersion, useCanManageVCardLifecycle, VCARD_FIELD_LABELS,
  type VCard, type VCardRevision, type VCardRevisionAction,
} from '@/hooks/use-vcards';

const ACTION_STYLE: Record<VCardRevisionAction, { label: string; variant: 'secondary' | 'outline' | 'destructive' | 'default' }> = {
  created: { label: 'Created', variant: 'secondary' },
  updated: { label: 'Updated', variant: 'outline' },
  revoked: { label: 'Revoked', variant: 'destructive' },
  restored: { label: 'Restored', variant: 'default' },
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function VCardHistorySheet({
  card,
  open,
  onOpenChange,
}: {
  card: VCard | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: revisions = [], isLoading } = useVCardRevisions(open ? card?.id : undefined);
  const { canManage } = useCanManageVCardLifecycle();
  const restore = useRestoreVCardVersion();
  const [toRestore, setToRestore] = useState<VCardRevision | null>(null);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />Audit trail
            </SheetTitle>
            <SheetDescription>
              {card ? `Every change to ${card.full_name}'s card — currently on version ${card.version}.` : ''}
            </SheetDescription>
            <div className="pt-1"><WorkspaceContextIndicator compact /></div>
          </SheetHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {isLoading ? (
              <p className="py-8 text-sm text-muted-foreground text-center">Loading history</p>
            ) : revisions.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground text-center">No history recorded yet.</p>
            ) : (
              <ol className="space-y-3 py-4">
                {revisions.map((rev) => {
                  const style = ACTION_STYLE[rev.action] ?? ACTION_STYLE.updated;
                  const fields = rev.changed_fields.filter((f) => VCARD_FIELD_LABELS[f]);
                  const isCurrent = rev.version === card?.version;
                  return (
                    <li key={rev.id} className="rounded border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={style.variant}>{style.label}</Badge>
                          <span className="text-xs text-muted-foreground">v{rev.version}</span>
                          {isCurrent && <span className="text-xs text-muted-foreground">· current</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatWhen(rev.created_at)}</span>
                      </div>
                      {fields.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Changed: {fields.map((f) => VCARD_FIELD_LABELS[f]).join(', ')}
                        </p>
                      )}
                      {rev.action === 'revoked' && rev.note && (
                        <p className="text-xs text-muted-foreground">Reason: {rev.note}</p>
                      )}
                      {!isCurrent && canManage && (
                        <Button size="sm" variant="outline" onClick={() => setToRestore(rev)} disabled={restore.isPending}>
                          {restore.isPending && toRestore?.id === rev.id
                            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5 " />}
                          Restore this version
                        </Button>
                      )}

                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!toRestore}
        onOpenChange={(v) => !v && setToRestore(null)}
        title={`Restore version ${toRestore?.version ?? ''}?`}
        description="The card content is rolled back to this snapshot. This is recorded as a new version, so nothing is lost."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!toRestore) return;
          try {
            await restore.mutateAsync(toRestore);
            toast.success(`Restored version ${toRestore.version}`);
            setToRestore(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Failed to restore version');
          }
        }}
      />
    </>
  );
}
