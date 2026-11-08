import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getExtensionReadiness, type ReadinessCheck, type CheckStatus } from '@/lib/plugins/readiness.functions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, XCircle, Info, RefreshCw } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/_super-admin/admin/extension-readiness')({
  head: () => ({
    meta: [
      { title: 'Extension Platform — Readiness' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['extension-readiness'],
      queryFn: () => getExtensionReadiness(),
    }),
  component: Page,
});

const STATUS_META: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  pass: { icon: CheckCircle2, className: 'text-emerald-600', label: 'Pass' },
  warn: { icon: AlertTriangle, className: 'text-amber-600', label: 'Warn' },
  fail: { icon: XCircle, className: 'text-destructive', label: 'Fail' },
  info: { icon: Info, className: 'text-muted-foreground', label: 'Info' },
};

function Page() {
  const qc = useQueryClient();
  const fetcher = useServerFn(getExtensionReadiness);
  const { data } = useSuspenseQuery({
    queryKey: ['extension-readiness'],
    queryFn: () => fetcher(),
  });

  const grouped = data.checks.reduce<Record<string, ReadinessCheck[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  return (
    <AdminPageShell
      title="Extension Platform Readiness"
      description="Health, security, and adoption signals across plugins, themes, marketplace, and licensing."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries({ queryKey: ['extension-readiness'] })}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Re-run
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['pass', 'warn', 'fail', 'info'] as CheckStatus[]).map(s => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <Card key={s}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className={`h-6 w-6 ${meta.className}`} />
                <div>
                  <div className="text-2xl font-semibold">{data.summary[s]}</div>
                  <div className="text-xs text-muted-foreground">{meta.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 space-y-4">
        {Object.entries(grouped).map(([category, checks]) => (
          <Card key={category}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{category}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {checks.map(c => {
                const meta = STATUS_META[c.status];
                const Icon = meta.icon;
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-2 rounded-control border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.className}`} />
                      <div>
                        <div className="font-medium">{c.label}</div>
                        <div className="text-sm text-muted-foreground">{c.detail}</div>
                      </div>
                    </div>
                    {c.metric !== undefined && (
                      <Badge variant="secondary" className="self-start sm:self-center">
                        {c.metric}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>
    </AdminPageShell>
  );
}
