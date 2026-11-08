import { useMemo, useState } from "react";
import { Loader2, Search, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContacts } from "@/hooks/use-contacts";
import {
  useAddContactListMembers,
  useContactListMembers,
  useRemoveContactListMembers,
  type ContactListRow,
} from "@/hooks/use-marketing-extras";

function contactLabel(c: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  return (
    c.display_name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.email ||
    c.phone ||
    "Unnamed contact"
  );
}

export function ContactListMembersSheet({
  list,
  open,
  onOpenChange,
}: {
  list: ContactListRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tab, setTab] = useState("members");
  const [memberSearch, setMemberSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const { data: members, isLoading } = useContactListMembers(open ? list?.id : undefined);
  const { data: contacts, isLoading: loadingContacts } = useContacts(
    { search: addSearch, archived: false },
    200,
  );
  const add = useAddContactListMembers();
  const remove = useRemoveContactListMembers();

  const memberIds = useMemo(() => new Set((members ?? []).map((m) => m.contact_id)), [members]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const rows = members ?? [];
    if (!q) return rows;
    return rows.filter((m) => contactLabel(m.contact ?? {}).toLowerCase().includes(q));
  }, [members, memberSearch]);

  const candidates = useMemo(
    () => (contacts ?? []).filter((c) => !memberIds.has(c.id)),
    [contacts, memberIds],
  );

  const isStatic = list?.type !== "dynamic";

  async function handleAdd() {
    if (!list || !selected.length) return;
    try {
      await add.mutateAsync({ listId: list.id, contactIds: selected });
      toast.success(`Added ${selected.length} contact${selected.length === 1 ? "" : "s"}`);
      setSelected([]);
      setTab("members");
    } catch (e) {
      toast.error((e as Error).message || "Could not add contacts");
    }
  }

  async function handleRemove(contactId: string) {
    if (!list) return;
    try {
      await remove.mutateAsync({ listId: list.id, contactIds: [contactId] });
      toast.success("Contact removed from list");
    } catch (e) {
      toast.error((e as Error).message || "Could not remove contact");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="p-6 pb-3">
          <SheetTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" /> {list?.name ?? "List"}
          </SheetTitle>
          <SheetDescription>
            {(members?.length ?? list?.member_count ?? 0).toLocaleString()} members ·{" "}
            <span className="capitalize">{list?.type}</span>
            {!isStatic && " — membership is driven by the linked segment"}
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6">
            <TabsList>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="add" disabled={!isStatic}>
                Add contacts
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="members" className="flex-1 min-h-0 flex flex-col mt-3">
            <div className="px-6 pb-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search members"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1 px-6 pb-6">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading</div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No members yet.
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredMembers.map((m) => (
                    <div
                      key={m.contact_id}
                      className="flex items-center gap-3 rounded-control border border-border p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {contactLabel(m.contact ?? {})}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {m.contact?.email || m.contact?.phone || "—"}
                        </div>
                      </div>
                      {isStatic && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove from list"
                          disabled={remove.isPending}
                          onClick={() => handleRemove(m.contact_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="add" className="flex-1 min-h-0 flex flex-col mt-3">
            <div className="px-6 pb-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search contacts"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                />
              </div>
            </div>
            <ScrollArea className="flex-1 px-6">
              {loadingContacts ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading</div>
              ) : candidates.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No contacts available to add.
                </div>
              ) : (
                <div className="space-y-1">
                  {candidates.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 rounded-control border border-border p-2 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.includes(c.id)}
                        onCheckedChange={(v) =>
                          setSelected((prev) =>
                            v ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                          )
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{contactLabel(c)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.email || c.phone || "—"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-6 pt-3 border-t border-border flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{selected.length} selected</span>
              <Button onClick={handleAdd} disabled={!selected.length || add.isPending}>
                {add.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                Add to list
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
