import { Brand } from "@/components/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, ExternalLink, Loader2, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getAuthorizationDetails,
  approveAuthorization,
  denyAuthorization,
} from "@/lib/oauth/oauth.functions";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Verify your identity",
  profile: "See your basic profile (name, avatar)",
  email: "See your email address",
  offline_access: "Stay connected when you're offline",
  "contacts:read": "Read your contacts",
  "contacts:write": "Create and update contacts",
  "conversations:read": "Read your conversations",
  "conversations:write": "Send and update conversations",
  "messages:read": "Read messages",
  "messages:write": "Send messages",
  "deals:read": "Read deals",
  "deals:write": "Create and update deals",
};

export const Route = createFileRoute("/_authenticated/oauth/consent")({
  head: () => ({
    meta: [
      { title: "Authorize application" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => s,
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <div className="p-6 max-w-lg mx-auto" role="alert">
      <h1 className="font-display text-xl font-semibold">Authorization error</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
});

function ConsentPage() {
  const navigate = useNavigate();
  const search = Route.useSearch() as Record<string, string>;

  const params = useMemo(
    () => ({
      client_id: search.client_id ?? "",
      redirect_uri: search.redirect_uri ?? "",
      response_type: (search.response_type as "code") ?? "code",
      scope: search.scope ?? "openid profile email",
      state: search.state ?? undefined,
      code_challenge: search.code_challenge ?? undefined,
      code_challenge_method: (search.code_challenge_method as any) ?? undefined,
      nonce: search.nonce ?? undefined,
    }),
    [search],
  );

  const getDetails = useServerFn(getAuthorizationDetails);
  const approveFn = useServerFn(approveAuthorization);
  const denyFn = useServerFn(denyAuthorization);

  const details = useQuery({
    queryKey: ["oauth-consent", params],
    queryFn: () => getDetails({ data: params }),
    retry: false,
  });

  const approve = useMutation({
    mutationFn: () => approveFn({ data: params }),
    onSuccess: (r: any) => { if (r?.redirect_to) window.location.href = r.redirect_to; },
  });
  const deny = useMutation({
    mutationFn: () => denyFn({ data: { redirect_uri: params.redirect_uri, state: params.state } }),
    onSuccess: (r: any) => { if (r?.redirect_to) window.location.href = r.redirect_to; },
  });

  if (details.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (details.error) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              <CardTitle>Cannot complete authorization</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {(details.error as Error).message}
            <div className="mt-4">
              <Button variant="outline" onClick={() => navigate({ to: "/" })}>Go home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const d = details.data!;
  const scopes: string[] = d.requested_scopes;

  return (
    <main className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <Avatar className="w-16 h-16">
              {d.client.logo_url ? <AvatarImage src={d.client.logo_url} alt={d.client.name} /> : null}
              <AvatarFallback className="text-xl">
                {d.client.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div>
            <CardTitle className="text-xl">{d.client.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">wants to access your <Brand /> account</p>
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            {d.client.approved && (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="w-3 h-3" /> Verified
              </Badge>
            )}
            {d.client.is_first_party && <Badge>First-party</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {d.client.description && (
            <p className="text-sm text-muted-foreground text-center">{d.client.description}</p>
          )}
          <div>
            <p className="text-sm font-medium mb-2">This will allow {d.client.name} to:</p>
            <ul className="space-y-2">
              {scopes.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm">
                  <Lock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span>{SCOPE_DESCRIPTIONS[s] ?? `Additional permission: ${s}`}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-control bg-muted/50 p-3 text-xs text-muted-foreground">
            Redirects to <code className="font-mono">{new URL(params.redirect_uri).host}</code>.
            You can revoke access at any time from Settings → Connected apps.
          </div>
          {(d.client.privacy_url || d.client.tos_url) && (
            <div className="flex gap-3 justify-center text-xs">
              {d.client.privacy_url && (
                <a href={d.client.privacy_url} target="_blank" rel="noreferrer"
                   className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  Privacy <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {d.client.tos_url && (
                <a href={d.client.tos_url} target="_blank" rel="noreferrer"
                   className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  Terms <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" disabled={approve.isPending || deny.isPending}
                    onClick={() => deny.mutate()}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={approve.isPending || deny.isPending}
                    onClick={() => approve.mutate()}>
              {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Authorize"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
