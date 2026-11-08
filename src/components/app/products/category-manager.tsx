import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { useProductCategories, useUpsertCategory, useDeleteCategory } from '@/hooks/use-products';
import { toast } from 'sonner';

export function CategoryManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: cats } = useProductCategories();
  const upsert = useUpsertCategory();
  const del = useDeleteCategory();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader><SheetTitle>Product categories</SheetTitle></SheetHeader>
        <div className="space-y-4 pt-6">
          <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-end">
            <div>
              <Label>Name</Label>
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Color</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 p-1" />
            </div>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                try {
                  await upsert.mutateAsync({ name: name.trim(), color });
                  setName('');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Failed');
                }
              }}
            ><Plus className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-1">
            {(cats ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-control border px-3 py-2">
                <div className="h-3 w-3 rounded-full" style={{ background: c.color ?? '#888' }} />
                {editing === c.id ? (
                  <>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                    <Button size="icon" variant="ghost" onClick={async () => {
                      await upsert.mutateAsync({ id: c.id, name: editName.trim() });
                      setEditing(null);
                    }}><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{c.name}</span>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c.id); setEditName(c.name); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            ))}
            {(cats ?? []).length === 0 && <div className="text-sm text-muted-foreground">No categories yet.</div>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
