import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getMarketplaceAnalytics,
  getModerationQueue,
  moderateEntity,
  moderateReview,
  runSecurityScan,
  listSecurityScans,
  runCompatibilityCheck,
  listCompatChecks,
  getModerationLog,
} from "@/lib/plugins/marketplace-ops.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  DollarSign,
  Package,
  Palette,
  ShieldCheck,
  Star,
  XCircle,
} from "lucide-react";

import { useCurrencyFormatter } from "@/hooks/use-currency";
function KPI({ icon: Icon, label, value, sub }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <Icon className="h-8 w-8 text-muted-foreground/40" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MarketplaceOpsConsole() {
  const fmtMoney = useCurrencyFormatter({ locale: "en-US", fromCents: true });
  const qc = useQueryClient();
  const fetchAnalytics = useServerFn(getMarketplaceAnalytics);
  const fetchQueue = useServerFn(getModerationQueue);
  const fetchScans = useServerFn(listSecurityScans);
  const fetchCompat = useServerFn(listCompatChecks);
  const fetchLog = useServerFn(getModerationLog);
  const doModerate = useServerFn(moderateEntity);
  const doModReview = useServerFn(moderateReview);
  const doScan = useServerFn(runSecurityScan);
  const doCompat = useServerFn(runCompatibilityCheck);

  const analytics = useQuery({ queryKey: ["mops", "analytics"], queryFn: () => fetchAnalytics() });
  const queue = useQuery({ queryKey: ["mops", "queue"], queryFn: () => fetchQueue() });
  const scans = useQuery({
    queryKey: ["mops", "scans"],
    queryFn: () => fetchScans({ data: { limit: 50 } }),
  });
  const compat = useQuery({
    queryKey: ["mops", "compat"],
    queryFn: () => fetchCompat({ data: { limit: 50 } }),
  });
  const log = useQuery({
    queryKey: ["mops", "log"],
    queryFn: () => fetchLog({ data: { limit: 100 } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["mops"] });
  };

  const modMut = useMutation({
    mutationFn: (i: Parameters<typeof doModerate>[0]) => doModerate(i),
    onSuccess: () => {
      toast.success("Action recorded");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Action failed"),
  });

  const scanMut = useMutation({
    mutationFn: (pluginId: string) => doScan({ data: { pluginId, scanner: "internal" } }),
    onSuccess: (r: any) => {
      toast.success(`Scan complete — ${r?.worst ?? "ok"} (score ${r?.score ?? 100})`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Scan failed"),
  });

  const compatMut = useMutation({
    mutationFn: (pluginId: string) => doCompat({ data: { pluginId, targetPlatform: "wacrm" } }),
    onSuccess: (r: any) => {
      toast.success(`Compatibility ${r?.status}`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Compatibility check failed"),
  });

  const reviewMut = useMutation({
    mutationFn: (id: string) => doModReview({ data: { reviewId: id, action: "delete" } }),
    onSuccess: () => {
      toast.success("Review removed");
      invalidateAll();
    },
  });

  const [rejectTarget, setRejectTarget] = useState<{
    id: string;
    type: "plugin" | "theme";
    name: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const a = analytics.data;
  const q = queue.data;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI
          icon={Download}
          label="Downloads (30d)"
          value={a?.metrics30d.downloads.toLocaleString() ?? "—"}
          sub={`${a?.metrics30d.installs ?? 0} installs`}
        />
        <KPI
          icon={DollarSign}
          label="Revenue (30d)"
          value={a ? fmtMoney(a.metrics30d.revenueCents) : "—"}
          sub={`Net ${a ? fmtMoney(a.metrics30d.netCents) : "—"}`}
        />
        <KPI
          icon={Star}
          label="Avg Rating"
          value={a?.ratings.average?.toFixed(2) ?? "—"}
          sub={`${a?.ratings.total ?? 0} reviews`}
        />
        <KPI
          icon={AlertTriangle}
          label="Pending Queue"
          value={((a?.queues.pendingPlugins ?? 0) + (a?.queues.pendingThemes ?? 0)).toString()}
          sub={`${a?.queues.pendingPlugins ?? 0} plugins · ${a?.queues.pendingThemes ?? 0} themes`}
        />
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="plugins">Plugin Approval</TabsTrigger>
          <TabsTrigger value="themes">Theme Approval</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="security">Security Scans</TabsTrigger>
          <TabsTrigger value="compat">Compatibility</TabsTrigger>
          <TabsTrigger value="log">Audit Log</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Top Plugins by Installs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plugin</TableHead>
                      <TableHead className="text-right">Installs</TableHead>
                      <TableHead className="text-right">Rating</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a?.topPluginsByInstalls.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">
                          {p.install_count?.toLocaleString() ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.rating_avg?.toFixed(1) ?? "—"} ({p.rating_count ?? 0})
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Top Themes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Theme</TableHead>
                      <TableHead className="text-right">Installs</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a?.topThemes.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right">
                          {t.install_count?.toLocaleString() ?? 0}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{t.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Rated Plugins</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead className="text-right">Reviews</TableHead>
                    <TableHead className="text-right">Installs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a?.topPluginsByRating.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.rating_avg?.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{p.rating_count}</TableCell>
                      <TableCell className="text-right">
                        {p.install_count?.toLocaleString() ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plugins queue */}
        <TabsContent value="plugins">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pending Plugins ({q?.plugins.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q?.plugins.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.publisher_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{p.pricing_model}</Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => scanMut.mutate(p.id)}
                          disabled={scanMut.isPending}
                        >
                          <ShieldCheck className="h-3 w-3 " />
                          Scan
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => compatMut.mutate(p.id)}
                          disabled={compatMut.isPending}
                        >
                          <Activity className="h-3 w-3 " />
                          Compat
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            modMut.mutate({
                              data: { entityType: "plugin", entityId: p.id, action: "approve" },
                            })
                          }
                        >
                          <CheckCircle2 className="h-3 w-3 " />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setRejectTarget({ id: p.id, type: "plugin", name: p.name })
                          }
                        >
                          <XCircle className="h-3 w-3 " />
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {q && q.plugins.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Queue empty.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Themes queue */}
        <TabsContent value="themes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending Themes ({q?.themes.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Theme</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q?.themes.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell>{t.publisher_name ?? "—"}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          onClick={() =>
                            modMut.mutate({
                              data: { entityType: "theme", entityId: t.id, action: "approve" },
                            })
                          }
                        >
                          <CheckCircle2 className="h-3 w-3 " />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejectTarget({ id: t.id, type: "theme", name: t.name })}
                        >
                          <XCircle className="h-3 w-3 " />
                          Reject
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {q && q.themes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Queue empty.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviews */}
        <TabsContent value="reviews">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Reviews</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q?.reviews.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.plugins?.name ?? r.plugin_id}
                      </TableCell>
                      <TableCell>
                        {"★".repeat(r.rating)}
                        <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {r.title && <span className="font-medium">{r.title} — </span>}
                        <span className="text-muted-foreground">{r.body}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reviewMut.mutate(r.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security scans */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security Scan History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Scanned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.data?.scans.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.plugins?.name ?? s.plugin_id}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "passed"
                              ? "default"
                              : s.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.severity ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{s.score ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(s.scanned_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compatibility */}
        <TabsContent value="compat">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compatibility Check History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plugin</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Checked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compat.data?.checks.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.plugins?.name ?? c.plugin_id}
                      </TableCell>
                      <TableCell>{c.target_platform}</TableCell>
                      <TableCell>{c.target_version ?? "latest"}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "passed" ? "default" : "secondary"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(c.checked_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Log */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Moderation Audit Log</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Moderator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.data?.log.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.entity_type}</Badge>{" "}
                        {row.entity_id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge>{row.action}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {row.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{row.moderator_id.slice(0, 8)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectTarget?.type}: {rejectTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <RichTextarea
            value={rejectReason}
            onChange={(v) => setRejectReason(v)}
            placeholder="Explain the rejection reason for the publisher"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectTarget) return;
                modMut.mutate({
                  data: {
                    entityType: rejectTarget.type,
                    entityId: rejectTarget.id,
                    action: "reject",
                    reason: rejectReason || undefined,
                  },
                });
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
