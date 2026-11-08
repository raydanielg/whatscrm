import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listEventTypes, saveEventType, deleteEventType } from "@/lib/booking/booking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, TimePicker, fromDateString, toDateString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  Users,
  Clock,
  MapPin,
  HelpCircle,
  CalendarRange,
  Info,
  Video,
  Phone as PhoneIcon,
  MessageCircle,
  Building2,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { useTenantCurrency } from "@/hooks/use-currency";

type Question = {
  id: string;
  label: string;
  type: "text" | "long_text" | "email" | "phone" | "number" | "select" | "checkbox";
  required: boolean;
  options: string[];
  placeholder?: string | null;
};

type AvailabilityRules = {
  use_default_schedule: boolean;
  weekly_hours: Array<{ day_of_week: number; start_time: string; end_time: string }>;
  date_range_start?: string | null;
  date_range_end?: string | null;
};

type EventType = {
  id?: string;
  name: string;
  slug: string;
  description?: string | null;
  category: string;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  preparation_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  location_kind: string;
  location_details: Record<string, unknown>;
  is_group: boolean;
  max_participants: number;
  price?: number | null;
  currency?: string | null;
  color?: string | null;
  questions: Question[];
  availability_rules?: AvailabilityRules;
  confirmation_message?: string | null;
  is_active: boolean;
};

const CATEGORIES: Array<{
  value: string;
  label: string;
  icon: string;
  blurb: string;
  suggested_duration: number;
}> = [
  {
    value: "consultation",
    label: "Consultation",
    icon: "💬",
    blurb: "Advisory session with a prospect or customer.",
    suggested_duration: 30,
  },
  {
    value: "demo",
    label: "Demo",
    icon: "🎥",
    blurb: "Product walkthrough with a lead.",
    suggested_duration: 30,
  },
  {
    value: "support",
    label: "Support",
    icon: "🛟",
    blurb: "Help an existing customer resolve an issue.",
    suggested_duration: 45,
  },
  {
    value: "sales_meeting",
    label: "Sales Meeting",
    icon: "💼",
    blurb: "Formal sales conversation, quote review.",
    suggested_duration: 45,
  },
  {
    value: "training",
    label: "Training",
    icon: "🎓",
    blurb: "Onboarding or upskilling session.",
    suggested_duration: 60,
  },
  {
    value: "interview",
    label: "Interview",
    icon: "🧑‍💼",
    blurb: "Hiring interview or evaluation.",
    suggested_duration: 45,
  },
  {
    value: "discovery_call",
    label: "Discovery Call",
    icon: "🔎",
    blurb: "Uncover needs, qualify opportunity.",
    suggested_duration: 20,
  },
  {
    value: "custom",
    label: "Custom Service",
    icon: "✨",
    blurb: "Configure everything yourself.",
    suggested_duration: 30,
  },
];

const LOCATIONS: Array<{
  value: string;
  label: string;
  icon: React.ReactNode;
  needsDetails?: "address" | "phone" | "url";
}> = [
  { value: "online", label: "Online", icon: <Video className="h-4 w-4" /> },
  {
    value: "video",
    label: "Video meeting",
    icon: <Video className="h-4 w-4" />,
    needsDetails: "url",
  },
  { value: "zoom", label: "Zoom", icon: <Video className="h-4 w-4" /> },
  { value: "google_meet", label: "Google Meet", icon: <Video className="h-4 w-4" /> },
  {
    value: "phone",
    label: "Phone call",
    icon: <PhoneIcon className="h-4 w-4" />,
    needsDetails: "phone",
  },
  { value: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" /> },
  {
    value: "offline",
    label: "Offline",
    icon: <Building2 className="h-4 w-4" />,
    needsDetails: "address",
  },
  {
    value: "in_person",
    label: "In person",
    icon: <Building2 className="h-4 w-4" />,
    needsDetails: "address",
  },
  { value: "custom", label: "Custom", icon: <Info className="h-4 w-4" /> },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyType(currency: string): EventType {
  return {
    name: "",
    slug: "",
    description: "",
    category: "custom",
    duration_minutes: 30,
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    preparation_minutes: 0,
    min_notice_minutes: 60,
    max_advance_days: 60,
    location_kind: "online",
    location_details: {},
    is_group: false,
    max_participants: 1,
    price: null,
    currency,
    color: "#075E54",
    questions: [],
    availability_rules: { use_default_schedule: true, weekly_hours: [] },
    confirmation_message: "",
    is_active: true,
  };
}

function fromRow(r: Record<string, unknown>, currency: string): EventType {
  return {
    ...emptyType(currency),
    ...r,
    questions: (r.questions as Question[]) ?? [],
    availability_rules: (r.availability_rules as AvailabilityRules) ?? {
      use_default_schedule: true,
      weekly_hours: [],
    },
    location_details: (r.location_details as Record<string, unknown>) ?? {},
  } as EventType;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function newQuestion(): Question {
  return { id: crypto.randomUUID(), label: "", type: "text", required: false, options: [] };
}

export function AppointmentTypesManager() {
  // A new appointment type is priced in the tenant's currency, not dollars.
  const tenantCurrency = useTenantCurrency();
  const listFn = useServerFn(listEventTypes);
  const saveFn = useServerFn(saveEventType);
  const deleteFn = useServerFn(deleteEventType);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["booking-event-types"],
    queryFn: () => listFn(),
  });

  const [editing, setEditing] = useState<EventType | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const save = useMutation({
    mutationFn: (payload: EventType) => saveFn({ data: payload as never }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      setEditing(null);
      toast.success("Appointment type saved");
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-event-types"] });
      toast.success("Deleted");
    },
  });

  const filtered = useMemo(() => {
    const list = ((rows as Array<Record<string, unknown>> | undefined) ?? []).map((r) =>
      fromRow(r, tenantCurrency),
    );
    return categoryFilter === "all" ? list : list.filter((t) => t.category === categoryFilter);
  }, [rows, categoryFilter, tenantCurrency]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Configure the meeting types your organization accepts bookings for.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.icon} {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setEditing(emptyType(tenantCurrency))}>
            <Plus className="h-4 w-4 mr-2" />
            New appointment type
          </Button>
        </div>
      </div>

      {/* Category quick-pick */}
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            className="text-left rounded-control border border-border p-3 hover:bg-muted/50 transition-colors"
            onClick={() =>
              setEditing({
                ...emptyType(tenantCurrency),
                category: c.value,
                name: c.label,
                slug: slugify(c.label),
                duration_minutes: c.suggested_duration,
              })
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{c.icon}</span>
              <span className="font-medium text-sm">{c.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.blurb}</p>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading appointment types
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => {
            const url = `${typeof window !== "undefined" ? window.location.origin : ""}/book/${r.slug}`;
            const catMeta = CATEGORIES.find((c) => c.value === r.category);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="h-9 w-9 rounded-control flex items-center justify-center text-lg shrink-0"
                        style={{
                          background: `${r.color ?? "#075E54"}22`,
                          color: r.color ?? "#075E54",
                        }}
                      >
                        {catMeta?.icon ?? "📅"}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {catMeta?.label ?? r.category} · {r.duration_minutes}m
                        </div>
                      </div>
                    </div>
                    <Badge variant={r.is_active ? "default" : "outline"}>
                      {r.is_active ? "Live" : "Paused"}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {r.duration_minutes}m
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {r.location_kind.replace("_", " ")}
                    </Badge>
                    {r.is_group && (
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {r.max_participants}
                      </Badge>
                    )}
                    {r.price != null && r.price > 0 && (
                      <Badge variant="outline">
                        {r.currency ?? tenantCurrency} {r.price}
                      </Badge>
                    )}
                    {r.questions.length > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <HelpCircle className="h-3 w-3" />
                        {r.questions.length}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1.5">
                    <LinkIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{url}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <Link to="/book/$slug" params={{ slug: r.slug }} target="_blank">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Delete this appointment type?")) r.id && remove.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No appointment types in this category yet. Pick a starter above or create one from
                scratch.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <EventTypeDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />
    </div>
  );
}

/* ─────────────────────────  Dialog  ───────────────────────── */

function EventTypeDialog({
  value,
  onClose,
  onSave,
  saving,
}: {
  value: EventType | null;
  onClose: () => void;
  onSave: (v: EventType) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<EventType | null>(value);
  // Sync when value prop changes.
  useMemoSync(value, setDraft);

  if (!draft) return null;

  const patch = (p: Partial<EventType>) => setDraft({ ...draft, ...p });
  const locMeta = LOCATIONS.find((l) => l.value === draft.location_kind);

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit appointment type" : "New appointment type"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basics" className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="scheduling">Scheduling</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
          </TabsList>

          {/* ── Basics ── */}
          <TabsContent value="basics" className="space-y-4">
            <div>
              <Label>Category</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => patch({ category: c.value })}
                    className={`text-left rounded-control border p-2 text-xs transition-colors ${
                      draft.category === c.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{c.icon}</span>
                      <span className="font-medium">{c.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    patch({
                      name: e.target.value,
                      slug: draft.id ? draft.slug : slugify(e.target.value),
                    })
                  }
                  placeholder="30 min discovery call"
                />
              </div>
              <div>
                <Label>URL slug</Label>
                <Input
                  value={draft.slug}
                  onChange={(e) => patch({ slug: slugify(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <RichTextarea
                rows={3}
                value={draft.description ?? ""}
                onChange={(v) => patch({ description: v })}
                placeholder="Shown to customers on the booking page."
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.price ?? ""}
                  onChange={(e) =>
                    patch({ price: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select
                  value={draft.currency ?? "USD"}
                  onValueChange={(v) => patch({ currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "AED", "INR", "NOK", "SEK", "JPY", "AUD", "CAD"].map(
                      (c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Color</Label>
                <Input
                  type="color"
                  value={draft.color ?? "#075E54"}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-9 p-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={draft.is_active} onCheckedChange={(v) => patch({ is_active: v })} />
              <Label>Active — accepting bookings</Label>
            </div>
          </TabsContent>

          {/* ── Location ── */}
          <TabsContent value="location" className="space-y-4">
            <div>
              <Label>Where does this appointment take place?</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {LOCATIONS.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => patch({ location_kind: l.value })}
                    className={`flex items-center gap-2 rounded-control border p-2.5 text-sm transition-colors ${
                      draft.location_kind === l.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    {l.icon}
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {locMeta?.needsDetails === "address" && (
              <div>
                <Label>Address</Label>
                <Textarea
                  rows={2}
                  value={(draft.location_details.address as string) ?? ""}
                  onChange={(e) =>
                    patch({
                      location_details: { ...draft.location_details, address: e.target.value },
                    })
                  }
                  placeholder="123 Business Ave, Suite 400, San Francisco, CA"
                />
              </div>
            )}
            {locMeta?.needsDetails === "phone" && (
              <div>
                <Label>Phone number</Label>
                <Input
                  value={(draft.location_details.phone as string) ?? ""}
                  onChange={(e) =>
                    patch({
                      location_details: { ...draft.location_details, phone: e.target.value },
                    })
                  }
                  placeholder="+1 555 000 0000"
                />
              </div>
            )}
            {locMeta?.needsDetails === "url" && (
              <div>
                <Label>Meeting URL</Label>
                <Input
                  value={(draft.location_details.url as string) ?? ""}
                  onChange={(e) =>
                    patch({ location_details: { ...draft.location_details, url: e.target.value } })
                  }
                  placeholder="https://meet.example.com/room"
                />
              </div>
            )}

            <div className="rounded-control border border-border p-3 space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={draft.is_group}
                  onCheckedChange={(v) =>
                    patch({
                      is_group: v,
                      max_participants: v ? Math.max(draft.max_participants, 2) : 1,
                    })
                  }
                />
                <div>
                  <Label className="cursor-pointer">Group meeting</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow multiple attendees to book the same slot.
                  </p>
                </div>
              </div>
              {draft.is_group && (
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label>Maximum participants</Label>
                    <Input
                      type="number"
                      min={2}
                      max={1000}
                      value={draft.max_participants}
                      onChange={(e) =>
                        patch({ max_participants: Math.max(2, Number(e.target.value)) })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Scheduling ── */}
          <TabsContent value="scheduling" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  value={draft.duration_minutes}
                  onChange={(e) => patch({ duration_minutes: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Preparation time (before booking, minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.preparation_minutes}
                  onChange={(e) => patch({ preparation_minutes: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Blocks the host's calendar this long before the meeting to prep.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Buffer before (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.buffer_before_minutes}
                  onChange={(e) => patch({ buffer_before_minutes: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Buffer after (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.buffer_after_minutes}
                  onChange={(e) => patch({ buffer_after_minutes: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Minimum notice (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.min_notice_minutes}
                  onChange={(e) => patch({ min_notice_minutes: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Maximum advance (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={draft.max_advance_days}
                  onChange={(e) => patch({ max_advance_days: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <Label>Confirmation message</Label>
              <RichTextarea
                rows={3}
                value={draft.confirmation_message ?? ""}
                onChange={(v) => patch({ confirmation_message: v })}
                placeholder="Thanks for booking — see you soon!"
              />
            </div>
          </TabsContent>

          {/* ── Questions ── */}
          <TabsContent value="questions" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Extra questions asked on the booking page.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => patch({ questions: [...draft.questions, newQuestion()] })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add question
              </Button>
            </div>

            {draft.questions.length === 0 && (
              <div className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Name, email and phone are always collected. Add fields specific to this appointment
                type.
              </div>
            )}

            <div className="space-y-2">
              {draft.questions.map((q, idx) => (
                <div key={q.id} className="rounded-control border border-border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground mt-2" />
                    <div className="grid gap-2 md:grid-cols-2 flex-1">
                      <div>
                        <Label className="text-xs">Question</Label>
                        <Input
                          value={q.label}
                          placeholder="What would you like to discuss?"
                          onChange={(e) => {
                            const next = [...draft.questions];
                            next[idx] = { ...q, label: e.target.value };
                            patch({ questions: next });
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={q.type}
                          onValueChange={(v) => {
                            const next = [...draft.questions];
                            next[idx] = { ...q, type: v as Question["type"] };
                            patch({ questions: next });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Short text</SelectItem>
                            <SelectItem value="long_text">Long text</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="phone">Phone</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="select">Dropdown</SelectItem>
                            <SelectItem value="checkbox">Checkbox</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        patch({ questions: draft.questions.filter((_, i) => i !== idx) })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {q.type === "select" && (
                    <div>
                      <Label className="text-xs">Options (comma separated)</Label>
                      <Input
                        value={q.options.join(", ")}
                        onChange={(e) => {
                          const next = [...draft.questions];
                          next[idx] = {
                            ...q,
                            options: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          };
                          patch({ questions: next });
                        }}
                        placeholder="Option A, Option B, Option C"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 pl-6">
                    <Switch
                      checked={q.required}
                      onCheckedChange={(v) => {
                        const next = [...draft.questions];
                        next[idx] = { ...q, required: v };
                        patch({ questions: next });
                      }}
                    />
                    <Label className="text-xs">Required</Label>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── Availability rules ── */}
          <TabsContent value="availability" className="space-y-4">
            <div className="flex items-center gap-3 rounded-control border border-border p-3">
              <Switch
                checked={draft.availability_rules?.use_default_schedule ?? true}
                onCheckedChange={(v) =>
                  patch({
                    availability_rules: {
                      ...(draft.availability_rules ?? {
                        weekly_hours: [],
                        use_default_schedule: true,
                      }),
                      use_default_schedule: v,
                    },
                  })
                }
              />
              <div>
                <Label className="cursor-pointer">Use organization's default working hours</Label>
                <p className="text-xs text-muted-foreground">
                  Turn off to set custom hours just for this appointment type.
                </p>
              </div>
            </div>

            {!draft.availability_rules?.use_default_schedule && (
              <>
                <div className="space-y-2">
                  <Label>Custom weekly hours</Label>
                  {(draft.availability_rules?.weekly_hours ?? []).map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Select
                        value={String(s.day_of_week)}
                        onValueChange={(v) => {
                          const rules = draft.availability_rules!;
                          const next = [...rules.weekly_hours];
                          next[idx] = { ...s, day_of_week: Number(v) };
                          patch({ availability_rules: { ...rules, weekly_hours: next } });
                        }}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((d, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TimePicker
                        value={s.start_time.slice(0, 5)}
                        onChange={(v) => {
                          const rules = draft.availability_rules!;
                          const next = [...rules.weekly_hours];
                          next[idx] = { ...s, start_time: `${v ?? "00:00"}:00` };
                          patch({ availability_rules: { ...rules, weekly_hours: next } });
                        }}
                      />
                      <span className="text-muted-foreground">–</span>
                      <TimePicker
                        value={s.end_time.slice(0, 5)}
                        onChange={(v) => {
                          const rules = draft.availability_rules!;
                          const next = [...rules.weekly_hours];
                          next[idx] = { ...s, end_time: `${v ?? "00:00"}:00` };
                          patch({ availability_rules: { ...rules, weekly_hours: next } });
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          const rules = draft.availability_rules!;
                          patch({
                            availability_rules: {
                              ...rules,
                              weekly_hours: rules.weekly_hours.filter((_, i) => i !== idx),
                            },
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const rules = draft.availability_rules ?? {
                        use_default_schedule: false,
                        weekly_hours: [],
                      };
                      patch({
                        availability_rules: {
                          ...rules,
                          weekly_hours: [
                            ...rules.weekly_hours,
                            { day_of_week: 1, start_time: "09:00:00", end_time: "17:00:00" },
                          ],
                        },
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add time range
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5" />
                      Available from
                    </Label>
                    <DatePicker
                      value={fromDateString(draft.availability_rules?.date_range_start ?? "")}
                      onChange={(d) =>
                        patch({
                          availability_rules: {
                            ...(draft.availability_rules ?? {
                              use_default_schedule: false,
                              weekly_hours: [],
                            }),
                            date_range_start: toDateString(d) || null,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5" />
                      Available until
                    </Label>
                    <DatePicker
                      value={fromDateString(draft.availability_rules?.date_range_end ?? "")}
                      onChange={(d) =>
                        patch({
                          availability_rules: {
                            ...(draft.availability_rules ?? {
                              use_default_schedule: false,
                              weekly_hours: [],
                            }),
                            date_range_end: toDateString(d) || null,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || !draft.name || !draft.slug} onClick={() => onSave(draft)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {draft.id ? "Save changes" : "Create appointment type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sync internal draft when incoming value changes (dialog opens for a different row). */
function useMemoSync(value: EventType | null, setDraft: (v: EventType | null) => void) {
  const key = value?.id ?? (value ? "__new__" : "__none__");
  useEffect(() => {
    setDraft(value);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
