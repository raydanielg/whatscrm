/**
 * Human Handoff Dialog — Transfer to Agent | Transfer to Department | Queue.
 *
 * Used in the conversation header. Provides priority selection, required
 * skills filtering, transfer reason, and a private note passed to the
 * next owner.
 */
import { useMemo, useState } from "react";
import { ArrowRightLeft, Users, ListOrdered, Sparkles } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useCurrentWorkspace, useWorkspaceMembers } from "@/hooks/use-workspace";
import {
  useDepartments, useAgentAvailability,
  useTransferToAgent, useTransferToDepartment,
} from "@/hooks/use-handoff";
import type { HandoffPriority, AgentPresence } from "@/lib/handoff/handoff.functions";

type Props = {
  conversationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Prefill: which tab to show first. */
  defaultTab?: "agent" | "department";
};

export function HandoffDialog({ conversationId, open, onOpenChange, defaultTab = "agent" }: Props) {
  const { active } = useCurrentWorkspace();
  const membersQ = useWorkspaceMembers(active?.id);
  const availabilityQ = useAgentAvailability();
  const departmentsQ = useDepartments();

  const [tab, setTab] = useState<"agent" | "department">(defaultTab);
  const [agentSearch, setAgentSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [priority, setPriority] = useState<HandoffPriority>("normal");
  const [skillsInput, setSkillsInput] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const transferAgent = useTransferToAgent(conversationId);
  const transferDept = useTransferToDepartment(conversationId);

  const availById = useMemo(() => {
    const map = new Map<string, { presence: AgentPresence; skills: string[]; load: number; max: number }>();
    for (const a of availabilityQ.data ?? []) {
      map.set(a.user_id, { presence: a.presence, skills: a.skills, load: a.current_load, max: a.max_concurrent });
    }
    return map;
  }, [availabilityQ.data]);

  const filteredMembers = useMemo(() => {
    const rows = membersQ.data ?? [];
    const q = agentSearch.toLowerCase();
    return rows.filter((m) =>
      !q
      || m.display_name?.toLowerCase().includes(q)
      || m.email?.toLowerCase().includes(q)
    );
  }, [membersQ.data, agentSearch]);

  const skills = skillsInput.split(",").map((s) => s.trim()).filter(Boolean);

  async function submit() {
    try {
      if (tab === "agent" && selectedAgent) {
        await transferAgent.mutateAsync({ toUserId: selectedAgent, reason, note });
      } else if (tab === "department" && selectedDept) {
        await transferDept.mutateAsync({
          departmentId: selectedDept,
          priority,
          requiredSkills: skills,
          reason, note,
        });
      } else return;
      onOpenChange(false);
      reset();
    } catch { /* toast handled */ }
  }

  function reset() {
    setSelectedAgent(null); setSelectedDept(null);
    setPriority("normal"); setSkillsInput("");
    setReason(""); setNote(""); setAgentSearch("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Transfer conversation
          </DialogTitle>
          <DialogDescription>
            Hand off to another agent or department. AI replies will pause.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "agent" | "department")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="agent" className="gap-2"><Users className="h-3.5 w-3.5" /> Agent</TabsTrigger>
            <TabsTrigger value="department" className="gap-2"><ListOrdered className="h-3.5 w-3.5" /> Department</TabsTrigger>
          </TabsList>

          {/* ==== Agent tab ==== */}
          <TabsContent value="agent" className="space-y-3 mt-4">
            <Input
              placeholder="Search agents"
              value={agentSearch}
              onChange={(e) => setAgentSearch(e.target.value)}
            />
            <ScrollArea className="h-56 rounded-control border">
              <ul className="p-1">
                {filteredMembers.map((m) => {
                  const av = availById.get(m.user_id);
                  const active = selectedAgent === m.user_id;
                  const initials = (m.display_name ?? m.email ?? "??").slice(0, 2).toUpperCase();
                  return (
                    <li key={m.user_id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAgent(m.user_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-control text-left hover:bg-muted ${active ? "bg-muted" : ""}`}
                      >
                        <div className="relative">
                          <Avatar className="h-9 w-9">
                            {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <span
                            aria-hidden
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background",
                              av?.presence === "online" ? "bg-emerald-500"
                              : av?.presence === "busy" ? "bg-red-500"
                              : av?.presence === "away" ? "bg-amber-500"
                              : "bg-muted-foreground/40",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{m.display_name ?? m.email}</div>
                          <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                            <span className="capitalize">{av?.presence ?? "offline"}</span>
                            {av && av.max > 0 ? (
                              <span>• {av.load}/{av.max} active</span>
                            ) : null}
                            {av?.skills?.length ? (
                              <span>• {av.skills.slice(0, 3).join(", ")}</span>
                            ) : null}
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize">{m.role}</Badge>
                      </button>
                    </li>
                  );
                })}
                {filteredMembers.length === 0 ? (
                  <li className="py-8 text-center text-sm text-muted-foreground">No agents found.</li>
                ) : null}
              </ul>
            </ScrollArea>
          </TabsContent>

          {/* ==== Department tab ==== */}
          <TabsContent value="department" className="space-y-3 mt-4">
            <div className="grid gap-2">
              <Label>Department</Label>
              <Select value={selectedDept ?? undefined} onValueChange={setSelectedDept}>
                <SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
                <SelectContent>
                  {(departmentsQ.data ?? []).filter((d) => d.is_active).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                        {d.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as HandoffPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Required skills</Label>
                <Input
                  placeholder="billing, spanish, tier-2"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              We'll try the best available agent, then fallback, then queue.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid gap-2">
          <Label>Reason (optional)</Label>
          <Input placeholder="Needs billing expertise" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Private note (optional)</Label>
          <Textarea
            placeholder="Context for whoever picks this up"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              (tab === "agent" && !selectedAgent) ||
              (tab === "department" && !selectedDept) ||
              transferAgent.isPending || transferDept.isPending
            }
          >
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
