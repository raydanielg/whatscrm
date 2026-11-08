import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import {
  ArrowLeft,
  Mail,
  Phone,
  Pencil,
  Star,
  Archive,
  ArchiveRestore,
  Trash2,
  Globe,
  Cake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useContact,
  useContactsRealtime,
  useUpdateContact,
  useDeleteContact,
  contactDisplayName,
  contactInitials,
} from "@/hooks/use-contacts";
import { ContactFormDialog } from "@/components/app/contacts/contact-form-dialog";
import { ActivityTimeline } from "@/components/app/timeline/activity-timeline";
import { PermissionGate } from "@/components/app/permission-gate";
import { useCanAct } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  staticData: { breadcrumb: "Contact" },
  head: () => ({ meta: [{ title: "Contact" }] }),
  component: ContactDetailPage,
});

function ContactDetailPage() {
  useContactsRealtime();
  const { contactId } = Route.useParams();
  // `isPending` (not `isLoading`) so the page shows a loader while the query is
  // still disabled waiting for the active workspace — otherwise a hard refresh
  // flashes "Contact not found" before the workspace resolves.
  const { data: contact, isPending } = useContact(contactId);
  const update = useUpdateContact();
  const del = useDeleteContact();
  const canDelete = useCanAct("contacts.delete");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = Route.useNavigate();

  const patchContact = async (patch: Record<string, unknown>, success: string) => {
    if (!contact || update.isPending) return;
    try {
      await update.mutateAsync({ id: contact.id, patch: patch as never });
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update contact");
    }
  };

  if (isPending) {
    return (
      <>
        <AppTopbar title="Contact" />
        <main className="p-6 text-sm text-muted-foreground">Loading</main>
      </>
    );
  }
  if (!contact) {
    return (
      <>
        <AppTopbar title="Not found" />
        <main className="p-8 text-sm text-muted-foreground">
          Contact not found.{" "}
          <Link to="/contacts" className="text-accent hover:underline">
            Back to contacts
          </Link>
        </main>
      </>
    );
  }

  const name = contactDisplayName(contact);

  return (
    <>
      <AppTopbar
        title={name}
        subtitle={contact.job_title ?? undefined}
        actions={
          <div className="hidden md:block">
            <ActionBar
              primary={[
                <Button key="edit" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="w-4 h-4 " /> Edit
                </Button>,
                <Button
                  key="favorite"
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() =>
                    patchContact(
                      { is_favorite: !contact.is_favorite },
                      contact.is_favorite ? "Removed from favorites" : "Added to favorites",
                    )
                  }
                >
                  <Star
                    className={`w-4 h-4 mr-1 ${contact.is_favorite ? "fill-yellow-500 text-yellow-500" : ""}`}
                  />{" "}
                  Favorite
                </Button>,
              ]}
              overflow={[
                <DropdownMenuItem
                  key="archive"
                  disabled={update.isPending}
                  onClick={() =>
                    patchContact(
                      { is_archived: !contact.is_archived },
                      contact.is_archived ? "Contact restored" : "Contact archived",
                    )
                  }
                >
                  {contact.is_archived ? (
                    <>
                      <ArchiveRestore className="w-4 h-4 mr-2" /> Restore
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4 mr-2" /> Archive
                    </>
                  )}
                </DropdownMenuItem>,
                <PermissionGate key="delete" permission="contacts.delete">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </PermissionGate>,
              ]}
            />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All contacts
        </Link>

        <div className="rounded-control border border-border bg-surface p-6 flex flex-col sm:flex-row items-start gap-4">
          <Avatar className="w-16 h-16">
            {contact.avatar_url && <AvatarImage src={contact.avatar_url} />}
            <AvatarFallback className="text-lg">{contactInitials(contact)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-xl font-semibold">{name}</h1>
              {contact.is_favorite && <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />}
              {contact.is_archived && <Badge variant="outline">Archived</Badge>}
              {contact.do_not_contact && <Badge variant="destructive">Do not contact</Badge>}
            </div>
            {contact.job_title && (
              <p className="text-sm text-muted-foreground">
                {contact.job_title}
                {contact.department ? ` · ${contact.department}` : ""}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(contact.tags ?? []).map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card title="Contact">
            {(contact.emails ?? []).map((e, i) => (
              <ItemRow
                key={`e-${i}`}
                icon={<Mail className="w-3.5 h-3.5" />}
                label={e.label ?? "email"}
                value={e.email}
                primary={e.is_primary}
              />
            ))}
            {(!contact.emails || contact.emails.length === 0) && contact.email && (
              <ItemRow
                icon={<Mail className="w-3.5 h-3.5" />}
                label="email"
                value={contact.email}
              />
            )}
            {(contact.phones ?? []).map((p, i) => (
              <ItemRow
                key={`p-${i}`}
                icon={<Phone className="w-3.5 h-3.5" />}
                label={p.label ?? "phone"}
                value={p.number}
                primary={p.is_primary}
              />
            ))}
            {(!contact.phones || contact.phones.length === 0) && contact.phone && (
              <ItemRow
                icon={<Phone className="w-3.5 h-3.5" />}
                label="phone"
                value={contact.phone}
              />
            )}
            {contact.whatsapp && (
              <ItemRow
                icon={<Phone className="w-3.5 h-3.5" />}
                label="whatsapp"
                value={contact.whatsapp}
              />
            )}
            {contact.website && (
              <ItemRow
                icon={<Globe className="w-3.5 h-3.5" />}
                label="website"
                value={contact.website}
              />
            )}
            {contact.birthday && (
              <ItemRow
                icon={<Cake className="w-3.5 h-3.5" />}
                label="birthday"
                value={contact.birthday}
              />
            )}
          </Card>

          <Card title="CRM">
            <KV k="Lifecycle" v={contact.lifecycle_stage} />
            <KV k="Lead status" v={contact.lead_status ?? "—"} />
            <KV k="Customer status" v={contact.customer_status ?? "—"} />
            <KV k="Source" v={contact.source ?? "—"} />
            <KV k="Timezone" v={contact.timezone ?? "—"} />
            <KV k="Locale" v={contact.locale ?? "—"} />
          </Card>

          {contact.address && Object.values(contact.address).some(Boolean) && (
            <Card title="Address">
              <p className="text-sm text-muted-foreground">
                {[
                  contact.address.line1,
                  contact.address.line2,
                  contact.address.city,
                  contact.address.state,
                  contact.address.postal_code,
                  contact.address.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </Card>
          )}

          {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
            <Card title="Custom fields">
              {Object.entries(contact.custom_fields).map(([k, v]) => (
                <KV key={k} k={k} v={String(v)} />
              ))}
            </Card>
          )}

          {contact.notes && (
            <Card title="Notes" full>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{contact.notes}</p>
            </Card>
          )}
        </div>

        <div className="mt-6">
          <ActivityTimeline entityType="contact" entityId={contact.id} />
        </div>
      </main>

      <ContactFormDialog open={editing} onOpenChange={setEditing} contact={contact} />

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(v) => {
          if (!v && del.isPending) return;
          setConfirmDelete(v);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={async (e) => {
                e.preventDefault(); // keep the dialog open until the delete resolves
                if (del.isPending) return;
                if (!canDelete) return;
                try {
                  await del.mutateAsync({ id: contact.id });
                  toast.success("Contact deleted");
                  setConfirmDelete(false);
                  navigate({ to: "/contacts" });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not delete contact");
                }
              }}
            >
              {del.isPending ? "Deleting" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Card({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div
      className={`rounded-control border border-border bg-surface p-4 space-y-2 ${full ? "md:col-span-2" : ""}`}
    >
      <h3 className="text-xs font-medium  text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ItemRow({
  icon,
  label,
  value,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  primary?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-muted-foreground w-16 shrink-0 truncate">{label}</span>
      <span className="truncate">{value}</span>
      {primary && (
        <Badge variant="outline" className="ml-auto text-[11px]">
          primary
        </Badge>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right truncate">{v}</span>
    </div>
  );
}
