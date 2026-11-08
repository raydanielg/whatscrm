import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateTimePicker } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Sparkles,
  Clock,
  Users,
  Route as RouteIcon,
  MessageSquare,
  CalendarClock,
  Loader2,
} from "lucide-react";
import {
  suggestBestTime,
  findCommonAvailability,
  travelTimeSuggestions,
  naturalLanguageScheduling,
  smartAvailability,
  type RankedSlot,
  type NLSchedulingIntent,
} from "@/lib/booking/ai-scheduling.functions";

export const Route = createFileRoute("/_authenticated/booking/ai-assistant")({
  component: AIAssistantPage,
});

function AIAssistantPage() {
  return (
    <div className="min-h-screen bg-background">
      <AppTopbar
        title="AI Scheduling"
        subtitle="Best-time suggestions, common availability, travel time, natural-language scheduling."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/booking">
              <ArrowLeft className="mr-1 size-4" />
              Back
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Tabs defaultValue="nl" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="nl">
              <MessageSquare className="mr-1 size-4" />
              Natural Language
            </TabsTrigger>
            <TabsTrigger value="best">
              <Clock className="mr-1 size-4" />
              Best Time
            </TabsTrigger>
            <TabsTrigger value="smart">
              <Sparkles className="mr-1 size-4" />
              Smart Slots
            </TabsTrigger>
            <TabsTrigger value="common">
              <Users className="mr-1 size-4" />
              Common Availability
            </TabsTrigger>
            <TabsTrigger value="travel">
              <RouteIcon className="mr-1 size-4" />
              Travel Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nl">
            <NaturalLanguageCard />
          </TabsContent>
          <TabsContent value="best">
            <BestTimeCard />
          </TabsContent>
          <TabsContent value="smart">
            <SmartAvailabilityCard />
          </TabsContent>
          <TabsContent value="common">
            <CommonAvailabilityCard />
          </TabsContent>
          <TabsContent value="travel">
            <TravelTimeCard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ---------------- Natural Language ----------------

function NaturalLanguageCard() {
  const fn = useServerFn(naturalLanguageScheduling);
  const [prompt, setPrompt] = useState("Book a 30-minute intro call with Sarah tomorrow at 2pm");
  const [result, setResult] = useState<NLSchedulingIntent | null>(null);
  const mut = useMutation({
    mutationFn: (p: string) =>
      fn({ data: { prompt: p, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }),
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Natural Language Scheduling</CardTitle>
        <CardDescription>Describe the meeting in plain English.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
        <Button onClick={() => mut.mutate(prompt)} disabled={mut.isPending}>
          {mut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Parse
        </Button>
        {result && (
          <div className="rounded-control border p-4 text-sm">
            <div className="mb-2 flex items-center gap-2">
              <Badge>{result.intent}</Badge>
              <Badge variant="outline">
                Confidence: {Math.round((result.confidence ?? 0) * 100)}%
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Title</dt>
              <dd>{result.title ?? "—"}</dd>
              <dt className="text-muted-foreground">Start</dt>
              <dd>{result.start_at ?? "—"}</dd>
              <dt className="text-muted-foreground">End</dt>
              <dd>{result.end_at ?? "—"}</dd>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{result.duration_minutes ?? "—"} min</dd>
              <dt className="text-muted-foreground">Participants</dt>
              <dd>{result.participants.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{result.location ?? "—"}</dd>
            </dl>
            {result.notes && <p className="mt-2 text-muted-foreground">{result.notes}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Best Time ----------------

function BestTimeCard() {
  const fn = useServerFn(suggestBestTime);
  const [eventTypeId, setEventTypeId] = useState("");
  const [preferences, setPreferences] = useState("Weekday mornings preferred");
  const [result, setResult] = useState<RankedSlot[]>([]);
  const mut = useMutation({
    mutationFn: () => {
      const now = new Date();
      const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      return fn({
        data: {
          event_type_id: eventTypeId,
          from: now.toISOString(),
          to: in14.toISOString(),
          preferences,
          limit: 3,
        },
      });
    },
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Suggest Best Time</CardTitle>
        <CardDescription>
          AI ranks the top slots for an event type over the next 14 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Event Type ID</Label>
          <Input
            value={eventTypeId}
            onChange={(e) => setEventTypeId(e.target.value)}
            placeholder="uuid"
          />
        </div>
        <div className="space-y-2">
          <Label>Preferences</Label>
          <Input value={preferences} onChange={(e) => setPreferences(e.target.value)} />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !eventTypeId}>
          {mut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Suggest
        </Button>
        <RankedList items={result} />
      </CardContent>
    </Card>
  );
}

function SmartAvailabilityCard() {
  const fn = useServerFn(smartAvailability);
  const [eventTypeId, setEventTypeId] = useState("");
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<RankedSlot[]>([]);
  const mut = useMutation({
    mutationFn: () => {
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return fn({
        data: {
          event_type_id: eventTypeId,
          from: now.toISOString(),
          to: in7.toISOString(),
          customer_hint: hint || undefined,
        },
      });
    },
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Smart Availability</CardTitle>
        <CardDescription>Ranks every free slot by conversion likelihood.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Event Type ID</Label>
          <Input
            value={eventTypeId}
            onChange={(e) => setEventTypeId(e.target.value)}
            placeholder="uuid"
          />
        </div>
        <div className="space-y-2">
          <Label>Customer hint</Label>
          <Input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. Enterprise buyer, US East"
          />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !eventTypeId}>
          {mut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 size-4" />
          )}
          Rank slots
        </Button>
        <RankedList items={result} />
      </CardContent>
    </Card>
  );
}

// ---------------- Common Availability ----------------

function CommonAvailabilityCard() {
  const fn = useServerFn(findCommonAvailability);
  const [hostIds, setHostIds] = useState("");
  const [duration, setDuration] = useState(30);
  const [result, setResult] = useState<Array<{ start_at: string; end_at: string }>>([]);
  const mut = useMutation({
    mutationFn: () => {
      const ids = hostIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const now = new Date();
      const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return fn({
        data: {
          host_ids: ids,
          from: now.toISOString(),
          to: in7.toISOString(),
          duration_minutes: duration,
        },
      });
    },
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Common Availability</CardTitle>
        <CardDescription>Intersect calendars across multiple hosts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Host IDs (comma-separated)</Label>
          <Textarea value={hostIds} onChange={(e) => setHostIds(e.target.value)} rows={2} />
        </div>
        <div className="space-y-2">
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !hostIds}>
          {mut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <CalendarClock className="mr-2 size-4" />
          )}
          Find slots
        </Button>
        {result.length > 0 && (
          <div className="space-y-2">
            {result.map((s, i) => (
              <div key={i} className="rounded-control border p-3 text-sm">
                {new Date(s.start_at).toLocaleString()} → {new Date(s.end_at).toLocaleString()}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Travel Time ----------------

function TravelTimeCard() {
  const fn = useServerFn(travelTimeSuggestions);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [arriveBy, setArriveBy] = useState("");
  const [result, setResult] = useState<{
    estimated_minutes: number;
    buffer_minutes: number;
    leave_by: string | null;
    notes: string;
  } | null>(null);
  const mut = useMutation({
    mutationFn: () =>
      fn({ data: { origin, destination, mode: "driving", arrive_by: arriveBy || undefined } }),
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Travel Time Estimate</CardTitle>
        <CardDescription>AI-estimated door-to-door time with a safety buffer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Origin</Label>
          <Input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="123 Main St, NY"
          />
        </div>
        <div className="space-y-2">
          <Label>Destination</Label>
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="500 Broadway, NY"
          />
        </div>
        <div className="space-y-2">
          <Label>Arrive by (optional)</Label>
          <DateTimePicker
            value={arriveBy ? new Date(arriveBy) : undefined}
            onChange={(d) => setArriveBy(d ? d.toISOString() : "")}
          />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !origin || !destination}>
          {mut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RouteIcon className="mr-2 size-4" />
          )}
          Estimate
        </Button>
        {result && (
          <div className="rounded-control border p-4 text-sm space-y-1">
            <div>
              <strong>{result.estimated_minutes}</strong> min travel +{" "}
              <strong>{result.buffer_minutes}</strong> min buffer
            </div>
            {result.leave_by && (
              <div>
                Leave by: <strong>{new Date(result.leave_by).toLocaleString()}</strong>
              </div>
            )}
            {result.notes && <p className="text-muted-foreground">{result.notes}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Shared ----------------

function RankedList({ items }: { items: RankedSlot[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="rounded-control border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{new Date(s.start_at).toLocaleString()}</span>
            <Badge variant="secondary">Score {s.score}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{s.rationale}</p>
        </div>
      ))}
    </div>
  );
}
