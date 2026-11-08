import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGoogleConnectorSetup,
  saveGoogleConnectorSetup,
  deleteGoogleConnectorSetup,
} from "@/lib/integrations/connector-settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function GoogleConnectorSettings() {
  const getSetup = useServerFn(getGoogleConnectorSetup);
  const saveSetup = useServerFn(saveGoogleConnectorSetup);
  const deleteSetup = useServerFn(deleteGoogleConnectorSetup);
  const qc = useQueryClient();
  const [clientAPIKey, setClientAPIKey] = useState("");
  const [backendAPIKey, setBackendAPIKey] = useState("");
  const query = useQuery({ queryKey: ["google-connector-setup"], queryFn: () => getSetup() });
  const save = useMutation({
    mutationFn: () => saveSetup({ data: { clientAPIKey, backendAPIKey } }),
    onSuccess: () => {
      setClientAPIKey("");
      setBackendAPIKey("");
      void qc.invalidateQueries({ queryKey: ["google-connector-setup"] });
      toast.success("Google Workspace setup saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const del = useMutation({
    mutationFn: () => deleteSetup(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["google-connector-setup"] });
      toast.success("Google Workspace credentials removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const isConfigured = !!query.data?.clientConfigured && !!query.data?.gatewayConfigured;
  return (
    <section className="max-w-2xl space-y-4 rounded-control border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Google Workspace OAuth setup</h2>
        {query.data && (
          <Badge
            variant="outline"
            className={
              isConfigured
                ? "gap-1 text-emerald-600 border-emerald-500/30"
                : "gap-1 text-amber-600 border-amber-500/30"
            }
          >
            {isConfigured ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <CircleAlert className="h-3 w-3" />
            )}
            {isConfigured ? "Configured" : "Not configured"}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        In Google Cloud Console, create an OAuth client with application type Web application. Paste
        its Client ID and Client Secret below; these fields do not take Google API keys. Users can
        then authorize their accounts from Integrations.
      </p>
      {query.isLoading && <p className="text-sm">Checking setup</p>}
      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <p className="text-sm">
          Client ID: {query.data.clientConfigured ? "Configured" : "Required"} · Client secret:{" "}
          {query.data.gatewayConfigured ? "Configured" : "Required"}
        </p>
      )}
      {query.data && !query.data.encryptionConfigured && (
        <p role="alert" className="text-sm text-destructive">
          An administrator must set APP_USER_CONNECTION_KEY_SECRET on the server before credentials
          can be saved.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="google-client-key">Google OAuth client ID</Label>
        <Input
          id="google-client-key"
          type="password"
          autoComplete="new-password"
          value={clientAPIKey}
          onChange={(e) => setClientAPIKey(e.target.value)}
          placeholder={
            query.data?.clientConfigured
              ? "Leave blank to keep saved key"
              : "Enter Google client ID"
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="google-gateway-key">Google OAuth client secret</Label>
        <Input
          id="google-gateway-key"
          type="password"
          autoComplete="new-password"
          value={backendAPIKey}
          onChange={(e) => setBackendAPIKey(e.target.value)}
          placeholder={
            query.data?.gatewayConfigured
              ? "Leave blank to keep saved key"
              : "Enter Google client secret"
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Add these exact Authorized redirect URIs to that OAuth client in Google Cloud:{" "}
        <code>
          {typeof window === "undefined"
            ? "https://your-domain/api/public/integrations/google-workspace/callback"
            : `${window.location.origin}/api/public/integrations/google-workspace/callback`}
        </code>{" "}
        and{" "}
        <code>
          {typeof window === "undefined"
            ? "https://your-domain/api/public/booking/google-calendar/callback"
            : `${window.location.origin}/api/public/booking/google-calendar/callback`}
        </code>
        . Credentials are encrypted on the server and never returned to this form.
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={
            save.isPending || !query.data?.encryptionConfigured || (!clientAPIKey && !backendAPIKey)
          }
          onClick={() => save.mutate()}
        >
          {save.isPending
            ? "Saving"
            : isConfigured
              ? "Update integration setup"
              : "Save integration setup"}
        </Button>
        {isConfigured && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Google Workspace credentials?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes the saved OAuth client ID and secret. Users will no longer be able to
                  authorize new Google accounts, and existing connections may stop refreshing until
                  a new client is configured.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? "Removing" : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </section>
  );
}
