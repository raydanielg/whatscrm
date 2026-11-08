import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Pin,
  PinOff,
  Trash2,
  Send,
  UserPlus,
  UserMinus,
  Eye,
  Users,
  Activity as ActivityIcon,
  StickyNote,
  Lock,
  MoreHorizontal,
  Pencil,
  Check,
  X,
  ArrowRightLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import type { ConversationRow } from "@/hooks/use-conversations";
import { HandoffTimeline } from "@/components/app/inbox/handoff-timeline";
import {
  useConversationNotes,
  useCreateNote,
  useUpdateNote,
  useDeleteNote,
  useConversationParticipants,
  useAddParticipant,
  useRemoveParticipant,
  useAssignConversation,
  useConversationActivity,
  useTeamDirectory,
  type ConversationNote,
  type ConversationActivityRow,
} from "@/hooks/use-collaboration";

/* -------------------------------------------------------------------------- */

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/* -------------------------------------------------------------------------- */
/*                              Note composer                                 */
/* -------------------------------------------------------------------------- */

function NoteComposer({ conversation }: { conversation: ConversationRow }) {
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const { members } = useTeamDirectory();
  const create = useCreateNote(conversation.id, conversation.workspace_id);

  const mentions = useMemo(() => {
    const found = new Set<string>();
    const re = /@([a-z0-9._-]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const handle = m[1].toLowerCase();
      const match = members.find(
        (mem) =>
          mem.display_name?.toLowerCase().replace(/\s+/g, "") === handle ||
          mem.email?.split("@")[0]?.toLowerCase() === handle,
      );
      if (match) found.add(match.user_id);
    }
    return Array.from(found);
  }, [body, members]);

  const submit = async () => {
    const value = body.trim();
    if (!value) return;
    try {
      await create.mutateAsync({ body: value, mentions, is_pinned: pin });
      setBody("");
      setPin(false);
      toast.success("Internal note added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="rounded-control border border-amber-200/60 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
        <Lock className="h-3 w-3" />
        Internal — only visible to your team
      </div>
      <Textarea
        placeholder="Write an internal note use @name to mention a teammate"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="resize-none border-amber-200/60 dark:border-amber-500/30 bg-background/60"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            variant={pin ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1.5"
            onClick={() => setPin((v) => !v)}
            type="button"
          >
            <Pin className="h-3.5 w-3.5" />
            {pin ? "Pinned" : "Pin"}
          </Button>
          {mentions.length > 0 && (
            <Badge variant="secondary" className="h-6">
              {mentions.length} mention{mentions.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={submit}
          disabled={!body.trim() || create.isPending}
          className="h-7 gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          Post note
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Note item                                  */
/* -------------------------------------------------------------------------- */

function NoteItem({
  note,
  conversationId,
}: {
  note: ConversationNote;
  conversationId: string;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const update = useUpdateNote(conversationId);
  const del = useDeleteNote(conversationId);
  const isMine = note.author_id === user?.id;

  return (
    <div
      className={cn(
        "rounded-control border p-3 space-y-2 transition-colors",
        note.is_pinned
          ? "border-amber-300/60 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-7 w-7">
          <AvatarImage src={note.author?.avatar_url ?? undefined} />
          <AvatarFallback className="text-[11px]">
            {initials(note.author?.display_name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium truncate">
              {note.author?.display_name ?? "Teammate"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            </span>
            {note.edited_at && (
              <span className="text-[11px] text-muted-foreground italic">
                edited
              </span>
            )}
            {note.is_pinned && (
              <Badge
                variant="outline"
                className="h-4 text-[11px] gap-1 border-amber-400/40 text-amber-700 dark:text-amber-300"
              >
                <Pin className="h-3 w-3" />
                Pinned
              </Badge>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                update.mutate({ id: note.id, is_pinned: !note.is_pinned })
              }
            >
              {note.is_pinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5" />
                  Pin note
                </>
              )}
            </DropdownMenuItem>
            {isMine && (
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
            )}
            {isMine && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => del.mutate(note.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={async () => {
                await update.mutateAsync({ id: note.id, body: draft.trim() });
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap break-words">
          {renderWithMentions(note.body)}
        </p>
      )}
    </div>
  );
}

function renderWithMentions(text: string) {
  const parts = text.split(/(@[a-z0-9._-]+)/gi);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span
        key={i}
        className="text-primary font-medium bg-primary/10 rounded px-1"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

/* -------------------------------------------------------------------------- */
/*                              People section                                */
/* -------------------------------------------------------------------------- */

function PeopleSection({ conversation }: { conversation: ConversationRow }) {
  const { members, byId } = useTeamDirectory();
  const participants = useConversationParticipants(conversation.id);
  const addP = useAddParticipant(conversation.id, conversation.workspace_id);
  const removeP = useRemoveParticipant(conversation.id);
  const assign = useAssignConversation();
  const [assignOpen, setAssignOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);

  const currentAssignee = conversation.assigned_to
    ? byId.get(conversation.assigned_to)
    : null;

  const followers = (participants.data ?? []).filter(
    (p) => p.user_id && (p.role === "follower" || p.role === "watcher" || p.role === "agent"),
  );

  const followerIds = new Set(followers.map((f) => f.user_id!));
  const availableToAdd = members.filter((m) => !followerIds.has(m.user_id));

  const doAssign = async (userId: string | null, reason?: string) => {
    try {
      await assign.mutateAsync({
        conversation_id: conversation.id,
        assigned_to: userId,
        reason,
      });
      toast.success(userId ? "Conversation assigned" : "Assignment cleared");
      setAssignOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Assignee */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium  text-muted-foreground">
            Assigned agent
          </div>
          <Popover open={assignOpen} onOpenChange={setAssignOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                {currentAssignee ? "Reassign" : "Assign"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search teammates" />
                <CommandList>
                  <CommandEmpty>No teammates found.</CommandEmpty>
                  <CommandGroup>
                    {currentAssignee && (
                      <CommandItem onSelect={() => doAssign(null)}>
                        <UserMinus className="h-3.5 w-3.5 text-muted-foreground" />
                        Unassign
                      </CommandItem>
                    )}
                    {members.map((m) => (
                      <CommandItem
                        key={m.user_id}
                        value={m.display_name ?? m.email ?? m.user_id}
                        onSelect={() => doAssign(m.user_id)}
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[11px]">
                            {initials(m.display_name ?? m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {m.display_name ?? m.email}
                        </span>
                        {m.user_id === conversation.assigned_to && (
                          <Check className="h-3.5 w-3.5 ml-auto text-primary" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {currentAssignee ? (
          <div className="flex items-center gap-2 p-2 rounded-control border border-border bg-card">
            <Avatar className="h-9 w-9">
              <AvatarImage src={currentAssignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[11px]">
                {initials(currentAssignee.display_name ?? currentAssignee.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {currentAssignee.display_name ?? currentAssignee.email}
              </div>
              <div className="text-[11px] text-muted-foreground capitalize">
                {currentAssignee.role}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground p-2 rounded-control border border-dashed border-border">
            Add, Manage or view Tasks set for the agent
          </div>
        )}
      </section>

      <Separator />

      {/* Followers / Watchers */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium  text-muted-foreground">
            Followers & watchers
          </div>
          <Popover open={followOpen} onOpenChange={setFollowOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5"
                disabled={availableToAdd.length === 0}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              <Command>
                <CommandInput placeholder="Search teammates" />
                <CommandList>
                  <CommandEmpty>Nobody left to add.</CommandEmpty>
                  <CommandGroup heading="Add as follower">
                    {availableToAdd.map((m) => (
                      <CommandItem
                        key={m.user_id}
                        value={m.display_name ?? m.email ?? m.user_id}
                        onSelect={async () => {
                          await addP.mutateAsync({ user_id: m.user_id, role: "follower" });
                          setFollowOpen(false);
                        }}
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={m.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[11px]">
                            {initials(m.display_name ?? m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">
                          {m.display_name ?? m.email}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {followers.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2 rounded-control border border-dashed border-border">
            No followers yet. Add teammates to keep them in the loop.
          </div>
        ) : (
          <ul className="space-y-1">
            {followers.map((p) => {
              const m = byId.get(p.user_id!);
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-2 p-2 rounded-control border border-border bg-card"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[11px]">
                      {initials(m?.display_name ?? m?.email ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">
                      {m?.display_name ?? m?.email ?? "Teammate"}
                    </div>
                    <div className="text-[11px] text-muted-foreground capitalize flex items-center gap-1">
                      {p.role === "watcher" ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <Users className="h-3 w-3" />
                      )}
                      {p.role}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeP.mutate(p.id)}
                    aria-label="Remove"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Activity timeline                             */
/* -------------------------------------------------------------------------- */

function ActivityTimeline({ conversation }: { conversation: ConversationRow }) {
  const { data, isLoading } = useConversationActivity(conversation.id);
  const { byId } = useTeamDirectory();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-control bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="text-xs text-muted-foreground p-3 text-center border border-dashed border-border rounded-control">
        No activity yet.
      </div>
    );
  }

  return (
    <ol className="relative border-l border-border pl-4 space-y-3">
      {data.map((a) => (
        <ActivityRow key={a.id} row={a} actor={a.actor_id ? byId.get(a.actor_id) : null} />
      ))}
    </ol>
  );
}

function ActivityRow({
  row,
  actor,
}: {
  row: ConversationActivityRow;
  actor?: ReturnType<typeof useTeamDirectory>["byId"] extends Map<string, infer V> ? V | null | undefined : never;
}) {
  const label = summarizeActivity(row);
  return (
    <li className="relative">
      <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
      <div className="text-xs">
        <span className="font-medium">
          {actor?.display_name ?? actor?.email ?? "System"}
        </span>{" "}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">
        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
      </div>
    </li>
  );
}

function summarizeActivity(row: ConversationActivityRow): string {
  const t = row.activity_type;
  const d = row.data ?? {};
  switch (t) {
    case "assignment_changed":
      if (!d.to) return "unassigned the conversation";
      return d.from ? "reassigned the conversation" : "took ownership";
    case "status_changed":
      return `changed status to ${d.to}`;
    case "reassignment_note":
      return `left reassignment note: ${d.reason ?? ""}`;
    case "note_created":
      return "added an internal note";
    case "participant_added":
      return "added a follower";
    case "participant_removed":
      return "removed a follower";
    default:
      return t.replace(/_/g, " ");
  }
}

/* -------------------------------------------------------------------------- */
/*                              Main container                                */
/* -------------------------------------------------------------------------- */

export function CollaborationPanel({
  conversation,
}: {
  conversation: ConversationRow;
}) {
  const { active } = useCurrentWorkspace();
  const notes = useConversationNotes(conversation.id);
  const pinned = (notes.data ?? []).filter((n) => n.is_pinned);
  const others = (notes.data ?? []).filter((n) => !n.is_pinned);

  if (!active) return null;

  return (
    <aside className="w-full min-w-0 shrink-0 border-l border-border bg-background flex flex-col h-full">
      <header className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-control bg-primary/10 grid place-items-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              Team collaboration
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Internal — hidden from the customer
            </div>
          </div>
        </div>
      </header>

      <Tabs defaultValue="notes" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-3 grid w-auto grid-cols-3">
          <TabsTrigger value="notes" className="min-w-0 text-xs gap-1 px-1.5 py-1.75">
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="people" className="min-w-0 text-xs gap-1 px-1.5 py-1.75">
            <Users className="h-3.5 w-3.5 shrink-0" />
            People
          </TabsTrigger>
          <TabsTrigger value="activity" className="min-w-0 text-xs gap-1 px-1.5 py-1.75">
            <ActivityIcon className="h-3.5 w-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              <NoteComposer conversation={conversation} />
              {notes.isLoading ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-16 rounded-control bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  {pinned.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-medium  text-muted-foreground flex items-center gap-1">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </div>
                      {pinned.map((n) => (
                        <NoteItem
                          key={n.id}
                          note={n}
                          conversationId={conversation.id}
                        />
                      ))}
                    </div>
                  )}
                  {others.length > 0 && (
                    <div className="space-y-2">
                      {pinned.length > 0 && (
                        <div className="text-[11px] font-medium  text-muted-foreground">
                          Team notes
                        </div>
                      )}
                      {others.map((n) => (
                        <NoteItem
                          key={n.id}
                          note={n}
                          conversationId={conversation.id}
                        />
                      ))}
                    </div>
                  )}
                  {(notes.data ?? []).length === 0 && (
                    <div className="text-xs text-muted-foreground p-3 text-center border border-dashed border-border rounded-control">
                      No internal notes yet. Add one to loop in your team.
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="people" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3">
              <PeopleSection conversation={conversation} />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-3">
              <HandoffTimeline conversationId={conversation.id} />
              <ActivityTimeline conversation={conversation} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
