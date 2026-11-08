import { Brand } from "@/components/brand";
import { requireOrgRole } from "@/lib/rbac";
import { BRAND_NAME } from "@/lib/branding/brand";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listOAuthClients,
  createOAuthClient,
  revokeOAuthClient,
  rotateClientSecret,
} from "@/lib/oauth/oauth.functions";

const clientsQO = queryOptions({
  queryKey: ["oauth", "clients"],
  queryFn: () => listOAuthClients(),
});

export const Route = createFileRoute("/_authenticated/developer/oauth")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "OAuth Applications" },
  head: () => ({
    meta: [
      { title: `OAuth Applications — ${BRAND_NAME} Developer` },
      {
        name: "description",
        content: "Register OAuth 2.0 clients, rotate secrets, and manage app access.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(clientsQO),
  component: OAuthClientsPage,
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">OAuth Applications</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function OAuthClientsPage() {
  return (
    <>
      <AppTopbar
        title="OAuth Applications"
        subtitle="Register OAuth 2.0 clients and manage app access."
        actions={
          <div className="flex items-center gap-2">
            <DeveloperOrgSwitcher />
            <CreateClientDialog />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Suspense fallback={<Loader2 className="animate-spin" />}>
          <ClientsList />
        </Suspense>
        <Card>
          <CardHeader>
            <CardTitle>Endpoints</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 font-mono">
            <div>
              <span className="text-muted-foreground">Discovery:</span>{" "}
              /api/public/.well-known/oauth-authorization-server
            </div>
            <div>
              <span className="text-muted-foreground">Authorize:</span> /api/public/oauth/authorize
            </div>
            <div>
              <span className="text-muted-foreground">Token:</span> /api/public/oauth/token
            </div>
            <div>
              <span className="text-muted-foreground">Revoke:</span> /api/public/oauth/revoke
            </div>
            <div>
              <span className="text-muted-foreground">Introspect:</span>{" "}
              /api/public/oauth/introspect
            </div>
            <div>
              <span className="text-muted-foreground">UserInfo:</span> /api/public/oauth/userinfo
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function ClientsList() {
  const { data } = useSuspenseQuery(clientsQO);
  const qc = useQueryClient();
  const revoke = useServerFn(revokeOAuthClient);
  const rotate = useServerFn(rotateClientSecret);
  const [rotated, setRotated] = useState<{ id: string; secret: string } | null>(null);

  if (!data.clients.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No OAuth applications yet. Create one to get started.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Client ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.clients.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.client_id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{c.client_type}</Badge>
                </TableCell>
                <TableCell>
                  {c.revoked_at ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : c.approved ? (
                    <Badge className="gap-1">
                      <ShieldCheck className="w-3 h-3" /> Approved
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(c.client_id);
                      toast.success("Client ID copied");
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {c.client_type === "confidential" && !c.revoked_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Rotate secret"
                      onClick={async () => {
                        const r: any = await rotate({ data: { id: c.id } });
                        setRotated({ id: c.id, secret: r.client_secret });
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  {!c.revoked_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        if (!confirm("Revoke this client? All active tokens will be invalidated."))
                          return;
                        await revoke({ data: { id: c.id } });
                        qc.invalidateQueries({ queryKey: ["oauth", "clients"] });
                        toast.success("Client revoked");
                      }}
                    >
                      <Ban className="w-4 h-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={!!rotated} onOpenChange={(o) => !o && setRotated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client secret</DialogTitle>
            <DialogDescription>Copy this now — it won't be shown again.</DialogDescription>
          </DialogHeader>
          {rotated && (
            <div className="rounded-control bg-muted p-3 font-mono text-xs break-all">
              {rotated.secret}
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                if (rotated) {
                  navigator.clipboard.writeText(rotated.secret);
                  toast.success("Secret copied");
                }
              }}
            >
              <Copy className="w-4 h-4" /> Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CreateClientDialog() {
  const qc = useQueryClient();
  const create = useServerFn(createOAuthClient);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ client_id: string; client_secret: string | null } | null>(
    null,
  );
  const [form, setForm] = useState({
    name: "",
    description: "",
    clientType: "confidential" as "confidential" | "public",
    redirectUris: "",
    scopes: "openid profile email",
    homepageUrl: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> New OAuth app
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Application created</DialogTitle>
              <DialogDescription>Store these credentials securely.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Client ID</Label>
                <div className="rounded-control bg-muted p-2 font-mono text-xs break-all">
                  {issued.client_id}
                </div>
              </div>
              {issued.client_secret && (
                <div>
                  <Label>Client Secret (shown once)</Label>
                  <div className="rounded-control bg-muted p-2 font-mono text-xs break-all">
                    {issued.client_secret}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setIssued(null);
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["oauth", "clients"] });
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Register OAuth application</DialogTitle>
              <DialogDescription>OAuth 2.0 / OpenID Connect client credentials.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Application name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Client type</Label>
                <Select
                  value={form.clientType}
                  onValueChange={(v: any) => setForm({ ...form, clientType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidential">
                      Confidential (server-side, has secret)
                    </SelectItem>
                    <SelectItem value="public">Public (SPA / mobile, PKCE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Redirect URIs (one per line)</Label>
                <Textarea
                  rows={2}
                  placeholder="https://app.example.com/oauth/callback"
                  value={form.redirectUris}
                  onChange={(e) => setForm({ ...form, redirectUris: e.target.value })}
                />
              </div>
              <div>
                <Label>Scopes (space-separated)</Label>
                <Input
                  value={form.scopes}
                  onChange={(e) => setForm({ ...form, scopes: e.target.value })}
                />
              </div>
              <div>
                <Label>Homepage URL</Label>
                <Input
                  value={form.homepageUrl}
                  onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={busy || !form.name || !form.redirectUris.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res: any = await create({
                      data: {
                        name: form.name,
                        description: form.description || undefined,
                        clientType: form.clientType,
                        redirectUris: form.redirectUris.split(/\s+/).filter(Boolean),
                        allowedScopes: form.scopes.split(/\s+/).filter(Boolean),
                        homepageUrl: form.homepageUrl || undefined,
                      },
                    });
                    setIssued({ client_id: res.client_id, client_secret: res.client_secret });
                  } catch (e: any) {
                    toast.error(e.message ?? "Failed to create client");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
