import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { AppTopbar } from "@/components/app/app-topbar";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookUser, Plus, Search, MoreHorizontal, Trash2, Pencil, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { sbAny } from "@/lib/supabase/untyped";

export const Route = createFileRoute("/_authenticated/phonebook")({
  component: PhonebookPage,
});

type Phonebook = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
};

type Contact = {
  id: string;
  phonebook_id: string;
  name: string;
  mobile_number: string;
  variable_1: string | null;
  variable_2: string | null;
  variable_3: string | null;
  variable_4: string | null;
  variable_5: string | null;
  created_at: string;
};

const phonebookSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().max(300).optional(),
});

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  mobile_number: z
    .string()
    .trim()
    .min(5, "Mobile number is required")
    .max(20)
    .regex(/^[0-9+\-\s]+$/, "Only digits, +, - allowed"),
  variable_1: z.string().max(200).optional(),
  variable_2: z.string().max(200).optional(),
  variable_3: z.string().max(200).optional(),
  variable_4: z.string().max(200).optional(),
  variable_5: z.string().max(200).optional(),
});

function PhonebookPage() {
  const { active } = useCurrentWorkspace();
  const formatZonedDate = useZonedDateFormatter();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [pbDialogOpen, setPbDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const phonebooksQuery = useQuery({
    queryKey: ["phonebooks", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("phonebooks")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Phonebook[];
    },
  });

  const contactsQuery = useQuery({
    queryKey: ["phonebook-contacts", active?.id, selectedId],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = supabase
        .from("phonebook_contacts")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (selectedId !== "all") q = q.eq("phonebook_id", selectedId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });

  const phonebooks = phonebooksQuery.data ?? [];
  const contacts = contactsQuery.data ?? [];

  const filteredContacts = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(s) || c.mobile_number.toLowerCase().includes(s),
    );
  }, [contacts, search]);

  const pbById = useMemo(() => Object.fromEntries(phonebooks.map((p) => [p.id, p])), [phonebooks]);

  /* ---------- Mutations ---------- */
  const createPhonebook = useMutation({
    mutationFn: async (payload: z.infer<typeof phonebookSchema>) => {
      const { error } = await sbAny(supabase)
        .from("phonebooks")
        .insert({
          workspace_id: active!.id,
          name: payload.name,
          description: payload.description ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Phonebook created");
      setPbDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePhonebook = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("phonebooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Phonebook deleted");
      setSelectedId("all");
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
      qc.invalidateQueries({ queryKey: ["phonebook-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertContact = useMutation({
    mutationFn: async (
      input: z.infer<typeof contactSchema> & { phonebook_id: string; id?: string },
    ) => {
      const payload = {
        workspace_id: active!.id,
        phonebook_id: input.phonebook_id,
        name: input.name,
        mobile_number: input.mobile_number,
        variable_1: input.variable_1 || null,
        variable_2: input.variable_2 || null,
        variable_3: input.variable_3 || null,
        variable_4: input.variable_4 || null,
        variable_5: input.variable_5 || null,
      };
      if (input.id) {
        const { error } = await sbAny(supabase)
          .from("phonebook_contacts")
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await sbAny(supabase).from("phonebook_contacts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingContact ? "Contact updated" : "Contact added");
      setContactDialogOpen(false);
      setEditingContact(null);
      qc.invalidateQueries({ queryKey: ["phonebook-contacts"] });
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("phonebook_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contact deleted");
      qc.invalidateQueries({ queryKey: ["phonebook-contacts"] });
      qc.invalidateQueries({ queryKey: ["phonebooks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <AppTopbar
        title="Phonebook"
        subtitle="Manage contacts and phonebooks"
        actions={
          <Dialog open={pbDialogOpen} onOpenChange={setPbDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" /> New Phonebook
              </Button>
            </DialogTrigger>
            <PhonebookDialog
              onSubmit={(v) => createPhonebook.mutate(v)}
              submitting={createPhonebook.isPending}
            />
          </Dialog>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        {/* Left: Phonebooks list */}
        <Card className="rounded-control h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookUser className="h-4 w-4" /> Phonebooks
            </CardTitle>
            <Badge variant="secondary" className="rounded-control">
              {phonebooks.length} total
            </Badge>
          </CardHeader>
          <CardContent className="p-2 space-y-1">
            <button
              onClick={() => setSelectedId("all")}
              className={cn(
                "w-full text-left px-3 py-2 rounded-control text-sm flex items-center justify-between hover:bg-muted",
                selectedId === "all" && "bg-muted font-medium",
              )}
            >
              <span>All Contacts</span>
              <Badge variant="outline" className="rounded-control">
                {phonebooks.reduce((s, p) => s + p.contact_count, 0)}
              </Badge>
            </button>
            {phonebooksQuery.isLoading && (
              <p className="px-3 py-4 text-sm text-muted-foreground">Loading</p>
            )}
            {!phonebooksQuery.isLoading && phonebooks.length === 0 && (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No phonebooks yet. Create one to get started.
              </p>
            )}
            {phonebooks.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "group flex items-center rounded-control hover:bg-muted",
                  selectedId === p.id && "bg-muted",
                )}
              >
                <button
                  onClick={() => setSelectedId(p.id)}
                  className="flex-1 text-left px-3 py-2 text-sm min-w-0"
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                  </div>
                </button>
                <Badge variant="outline" className="rounded-control ">
                  {p.contact_count}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 "
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${p.name}" and all its contacts?`)) {
                          deletePhonebook.mutate(p.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Right: Contacts table. min-w-0 lets the grid column shrink so the table scrolls inside the card instead of pushing the page wider. */}
        <Card className="rounded-control min-w-0">
          <CardHeader className="flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Contacts
                <Badge variant="secondary" className="rounded-control">
                  {filteredContacts.length}
                </Badge>
              </CardTitle>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-auto">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or number"
                  className="pl-8 w-full sm:w-64"
                />
              </div>
              <Select value={selectedId} onValueChange={(v) => setSelectedId(v as string)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All phonebooks</SelectItem>
                  {phonebooks.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Dialog
                open={contactDialogOpen}
                onOpenChange={(o) => {
                  setContactDialogOpen(o);
                  if (!o) setEditingContact(null);
                }}
              >
                <DialogTrigger asChild>
                  <Button disabled={phonebooks.length === 0} className="text-nowrap">
                    <Plus className="mr-2 h-4 w-4" /> Add Contact
                  </Button>
                </DialogTrigger>
                <ContactDialog
                  phonebooks={phonebooks}
                  defaultPhonebookId={selectedId !== "all" ? selectedId : phonebooks[0]?.id}
                  editing={editingContact}
                  submitting={upsertContact.isPending}
                  onSubmit={(v) =>
                    upsertContact.mutate({
                      ...v,
                      id: editingContact?.id,
                    })
                  }
                />
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-nowrap">Name</TableHead>
                  <TableHead className="text-nowrap">Phonebook</TableHead>
                  <TableHead className="text-nowrap">Mobile Number</TableHead>
                  <TableHead className="text-nowrap">Variable 1</TableHead>
                  <TableHead className="text-nowrap">Variable 2</TableHead>
                  <TableHead className="text-nowrap">Variable 3</TableHead>
                  <TableHead className="text-nowrap">Variable 4</TableHead>
                  <TableHead className="text-nowrap">Variable 5</TableHead>
                  <TableHead className="text-nowrap">Date</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Loading
                    </TableCell>
                  </TableRow>
                ) : filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {phonebooks.length === 0
                        ? "Create a phonebook first, then add contacts."
                        : "No contacts found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-control">
                          {pbById[c.phonebook_id]?.name ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.mobile_number}</TableCell>
                      <TableCell className="text-sm">{c.variable_1 ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.variable_2 ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.variable_3 ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.variable_4 ?? "—"}</TableCell>
                      <TableCell className="text-sm">{c.variable_5 ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatZonedDate(c.created_at, {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingContact(c);
                                setContactDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Delete this contact?")) deleteContact.mutate(c.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ---------- Dialogs ---------- */

function PhonebookDialog({
  onSubmit,
  submitting,
}: {
  onSubmit: (v: z.infer<typeof phonebookSchema>) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <DialogContent className="rounded-control">
      <DialogHeader>
        <DialogTitle>New Phonebook</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New phonebook name"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            rows={3}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={submitting}
          onClick={() => {
            const parsed = phonebookSchema.safeParse({ name, description });
            if (!parsed.success) {
              toast.error(parsed.error.issues[0].message);
              return;
            }
            onSubmit(parsed.data);
          }}
        >
          {submitting ? "Creating" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ContactDialog({
  phonebooks,
  defaultPhonebookId,
  editing,
  submitting,
  onSubmit,
}: {
  phonebooks: Phonebook[];
  defaultPhonebookId: string | undefined;
  editing: Contact | null;
  submitting: boolean;
  onSubmit: (v: z.infer<typeof contactSchema> & { phonebook_id: string }) => void;
}) {
  const [phonebookId, setPhonebookId] = useState(editing?.phonebook_id ?? defaultPhonebookId ?? "");
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    mobile_number: editing?.mobile_number ?? "",
    variable_1: editing?.variable_1 ?? "",
    variable_2: editing?.variable_2 ?? "",
    variable_3: editing?.variable_3 ?? "",
    variable_4: editing?.variable_4 ?? "",
    variable_5: editing?.variable_5 ?? "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <DialogContent className="rounded-control max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Contact" : "Add Contact"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Phonebook</Label>
          <Select value={phonebookId} onValueChange={setPhonebookId}>
            <SelectTrigger>
              <SelectValue placeholder="Select phonebook" />
            </SelectTrigger>
            <SelectContent>
              {phonebooks.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input value={form.name} onChange={update("name")} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label>Mobile Number</Label>
          <Input
            value={form.mobile_number}
            onChange={update("mobile_number")}
            placeholder="+91 98xxxxxxxx"
            maxLength={20}
          />
        </div>
        {([1, 2, 3, 4, 5] as const).map((n) => (
          <div key={n} className="space-y-1.5">
            <Label>Variable {n}</Label>
            <Input
              value={form[`variable_${n}` as const]}
              onChange={update(`variable_${n}` as const)}
              maxLength={200}
            />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button
          disabled={submitting}
          onClick={() => {
            if (!phonebookId) {
              toast.error("Please select a phonebook");
              return;
            }
            const parsed = contactSchema.safeParse(form);
            if (!parsed.success) {
              toast.error(parsed.error.issues[0].message);
              return;
            }
            onSubmit({ ...parsed.data, phonebook_id: phonebookId });
          }}
        >
          {submitting ? "Saving" : editing ? "Save" : "Add Contact"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
