import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateCustomer, type CustomerRow } from "@/hooks/use-customers";
import { useCurrentWorkspace, useWorkspaceMembers, type WorkspaceMemberRow } from "@/hooks/use-workspace";
import { normalizePhone } from "@/lib/inbox/contact-display";
import { TagSelector } from "@/components/app/tags/tag-selector";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type Field = "name" | "phone" | "email";

interface Props {
  customer: CustomerRow;
}

/** Inline editable fields with autosave-on-blur, validation, and revert on Esc. */
export function InlineEditableField({
  customer,
  field,
  className,
  placeholder = "—",
  icon,
  type = "text",
}: Props & {
  field: Field;
  className?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  type?: "text" | "tel" | "email";
}) {
  const initial = readField(customer, field);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(initial ?? "");
  const [saving, setSaving] = useState(false);
  const update = useUpdateCustomer();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(initial ?? "");
  }, [initial, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const trimmed = value.trim();
    if ((trimmed || null) === (initial ?? null)) {
      setEditing(false);
      return;
    }
    // Validation
    if (field === "email" && trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Invalid email address");
      inputRef.current?.focus();
      return;
    }
    if (field === "phone" && trimmed && !normalizePhone(trimmed)) {
      toast.error("Invalid phone number");
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const patch = buildPatch(field, trimmed || null);
      await update.mutateAsync({ id: customer.id, patch });
      toast.success("Saved");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-control px-1 -mx-1 hover:bg-muted/60 transition-colors text-left max-w-full",
          className,
        )}
        title="Click to edit"
      >
        {icon}
        <span className={cn("truncate", !initial && "text-muted-foreground italic")}>
          {initial || placeholder}
        </span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        ref={inputRef}
        type={type}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setValue(initial ?? "");
            setEditing(false);
          }
        }}
        className={cn("h-7 text-sm", className)}
      />
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Button size="icon" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => { setValue(initial ?? ""); setEditing(false); }}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </span>
  );
}

function readField(c: CustomerRow, f: Field): string | null {
  if (f === "name") {
    return (
      c.display_name?.trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      null
    );
  }
  if (f === "phone") return c.phone ?? null;
  if (f === "email") return c.email ?? null;
  return null;
}


function buildPatch(f: Field, v: string | null) {
  if (f === "name") {
    // Store into display_name; also derive first/last for search fields.
    if (!v) return { display_name: null, first_name: null, last_name: null };
    const parts = v.split(/\s+/);
    const first = parts.shift() ?? null;
    const last = parts.length ? parts.join(" ") : null;
    return { display_name: v, first_name: first, last_name: last };
  }
  if (f === "phone") {
    return { phone: v ? normalizePhone(v) ?? v : null };
  }
  return { email: v };
}

/** Inline owner picker with autosave. */
export function InlineOwnerPicker({ customer }: Props) {
  const { active } = useCurrentWorkspace();
  const { data: members = [] } = useWorkspaceMembers(active?.id);
  const update = useUpdateCustomer();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const current = members.find((m) => m.user_id === customer.owner_id) as WorkspaceMemberRow | undefined;

  const setOwner = async (userId: string | null) => {
    setSaving(true);
    try {
      await update.mutateAsync({ id: customer.id, patch: { owner_id: userId } });
      toast.success(userId ? "Owner updated" : "Owner cleared");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1.5 rounded-control px-1.5 py-0.5 hover:bg-muted/60 text-xs text-muted-foreground"
          title="Change owner"
        >
          {current ? (
            <>
              <Avatar className="w-4 h-4">
                {current.avatar_url ? <AvatarImage src={current.avatar_url} /> : null}
                <AvatarFallback className="text-[8px]">{initials(current.display_name || current.email || "?")}</AvatarFallback>
              </Avatar>
              <span className="text-foreground">{current.display_name || current.email}</span>
            </>
          ) : (
            <>
              <UserIcon className="w-3.5 h-3.5" />
              <span>Unassigned</span>
            </>
          )}
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start">
        <ScrollArea type="hover" viewportClassName="max-h-72 [&>div]:!block">
          <div className="py-1">
            <button
              type="button"
              onClick={() => setOwner(null)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60 text-left"
            >
              <UserIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Unassigned</span>
              {!customer.owner_id && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
            {members.length === 0 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">No members</div>
            )}
            {members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => setOwner(m.user_id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60 text-left"
              >
                <Avatar className="w-6 h-6">
                  {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                  <AvatarFallback className="text-[11px]">{initials(m.display_name || m.email || "?")}</AvatarFallback>
                </Avatar>
                <span className="truncate flex-1">{m.display_name || m.email}</span>
                {customer.owner_id === m.user_id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function initials(s: string) {
  return s
    .split(/\s+/)
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Wraps the shared TagSelector inline. */
export function InlineTagEditor({ customer }: Props) {
  return <TagSelector entityType="contact" entityId={customer.id} compact />;
}
