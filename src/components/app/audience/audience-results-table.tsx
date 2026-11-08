import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AudienceContact } from "@/hooks/use-audience";

export interface AudienceResultsTableProps {
  rows: AudienceContact[];
  total: number;
  loading?: boolean;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
}

export function AudienceResultsTable({
  rows,
  total,
  loading,
  selected,
  onSelectedChange,
}: AudienceResultsTableProps) {
  const [sortKey, setSortKey] = useState<"name" | "clv" | "created">("created");
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortKey === "name") copy.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
    else if (sortKey === "clv")
      copy.sort((a, b) => (b.customer_lifetime_value ?? 0) - (a.customer_lifetime_value ?? 0));
    return copy;
  }, [rows, sortKey]);

  const toggleAll = () => {
    if (allSelected) onSelectedChange(new Set());
    else onSelectedChange(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  return (
    <div className="border rounded-control overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40 text-xs">
        <div className="flex items-center gap-3">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          <span className="text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected · ` : ""}
            {rows.length} shown · {total.toLocaleString()} match filters
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-2 py-0.5 rounded ${sortKey === "created" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            onClick={() => setSortKey("created")}
          >
            Newest
          </button>
          <button
            className={`px-2 py-0.5 rounded ${sortKey === "name" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            onClick={() => setSortKey("name")}
          >
            Name
          </button>
          <button
            className={`px-2 py-0.5 rounded ${sortKey === "clv" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
            onClick={() => setSortKey("clv")}
          >
            Value
          </button>
        </div>
      </div>
      <ScrollArea className="h-[520px]">
        {loading && <div className="p-6 text-center text-sm text-muted-foreground">Loading</div>}
        {!loading && rows.length === 0 && (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No contacts match this filter.
          </div>
        )}
        <ul className="divide-y">
          {sorted.map((r) => {
            const name = r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "Unnamed";
            const isSel = selected.has(r.id);
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer ${isSel ? "bg-primary/5" : ""}`}
                onClick={() => toggleOne(r.id)}
              >
                <Checkbox checked={isSel} onCheckedChange={() => toggleOne(r.id)} onClick={(e) => e.stopPropagation()} />
                <Avatar className="h-9 w-9">
                  {r.avatar_url ? <AvatarImage src={r.avatar_url} /> : null}
                  <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{name}</span>
                    <Badge variant="outline" className="text-[11px] px-1 py-0">
                      {r.lifecycle_stage}
                    </Badge>
                    {r.lead_status && <Badge variant="secondary" className="text-[11px] px-1 py-0">{r.lead_status}</Badge>}
                    {r.do_not_contact && <Badge variant="destructive" className="text-[11px] px-1 py-0">DNC</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.phone || r.whatsapp || "—"} · {r.email || "—"}
                    {r.address?.country ? ` · ${r.address.city ?? ""} ${r.address.country}` : ""}
                    {r.locale ? ` · ${r.locale}` : ""}
                  </div>
                  {r.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="outline" className="text-[11px] px-1 py-0">{t}</Badge>
                      ))}
                      {r.tags.length > 4 && <span className="text-[11px] text-muted-foreground">+{r.tags.length - 4}</span>}
                    </div>
                  )}
                </div>
                {r.customer_lifetime_value != null && (
                  <div className="text-xs font-mono text-muted-foreground">
                    ${Number(r.customer_lifetime_value).toLocaleString()}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
