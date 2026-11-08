/**
 * SMS numbers — connect a real sending/receiving number (Twilio by default)
 * so inbound texts land on a real account in the Inbox instead of an
 * unattached placeholder.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Trash2, Power, PowerOff, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  connectSmsAccount,
  deleteSmsAccount,
  listSmsAccounts,
  updateSmsAccount,
  type SmsAccountSummary,
} from "@/lib/sms/accounts.functions";

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge variant="secondary">Connected</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">{status === "disconnected" ? "Disabled" : "Pending"}</Badge>;
}

export function SmsAccountsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id ?? undefined;
  const qc = useQueryClient();

  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/webhooks/sms/twilio`
      : "/api/public/webhooks/sms/twilio";

  const accountsQuery = useQuery({
    queryKey: ["sms-accounts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => (await listSmsAccounts({ data: { workspaceId: workspaceId! } })).accounts,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["sms-accounts", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["external-channel-accounts", workspaceId] });
  };

  const connect = useMutation({
    mutationFn: async () =>
      connectSmsAccount({
        data: {
          workspaceId: workspaceId!,
          displayName: displayName.trim(),
          phoneNumber: phoneNumber.trim(),
          provider: "twilio",
          accountSid: accountSid.trim() || null,
          authToken: authToken.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("SMS number connected");
      setDisplayName("");
      setPhoneNumber("");
      setAccountSid("");
      setAuthToken("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (a: SmsAccountSummary) =>
      updateSmsAccount({
        data: { id: a.id, status: a.status === "connected" ? "disconnected" : "connected" },
      }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => deleteSmsAccount({ data: { id } }),
    onSuccess: () => {
      toast.success("SMS number removed");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!workspaceId && displayName.trim().length > 0 && /^\+?[0-9 ()\-.]{6,24}$/.test(phoneNumber.trim());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Connect an SMS number
          </CardTitle>
          <CardDescription>
            Point your provider's inbound webhook at the URL below, then register the number here so
            incoming texts are matched to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Inbound webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  toast.success("Webhook URL copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-name">Account name</Label>
            <Input
              id="sa-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Support line"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-phone">Phone number</Label>
            <Input
              id="sa-phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+14155550123"
              maxLength={24}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-sid">Account SID (optional)</Label>
            <Input
              id="sa-sid"
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="AC"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-token">Auth token (optional)</Label>
            <Input
              id="sa-token"
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="Stored encrypted"
              maxLength={400}
            />
          </div>
          <div className="md:col-span-2">
            <Button disabled={!canSubmit || connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? "Connecting" : "Connect number"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected SMS numbers</CardTitle>
          <CardDescription>Numbers available to the omnichannel Inbox.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {accountsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading numbers</p>
          )}
          {!accountsQuery.isLoading && (accountsQuery.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No SMS numbers connected yet.</p>
          )}
          {(accountsQuery.data ?? []).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{a.display_name}</span>
                  <StatusBadge status={a.status} />
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {a.phone_number} · {a.provider}
                  {a.has_auth_token ? " · token stored" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(a)}
                >
                  {a.status === "connected" ? (
                    <>
                      <PowerOff className="mr-1 h-4 w-4" /> Disable
                    </>
                  ) : (
                    <>
                      <Power className="mr-1 h-4 w-4" /> Enable
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
