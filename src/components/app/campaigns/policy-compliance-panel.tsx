import { AlertTriangle, CheckCircle2, Info, ShieldCheck, XCircle } from "lucide-react";
import {
  checkCampaignPolicy,
  summarizePolicy,
  type CampaignPolicyInput,
  type PolicyFinding,
} from "@/lib/marketing/policy-compliance";

type Props = {
  input: CampaignPolicyInput;
  className?: string;
  compact?: boolean;
};

/**
 * Static WhatsApp Cloud API messaging-policy pre-flight for campaign dispatch.
 * Rendered inside the campaign wizard review step and campaign detail page.
 */
export function PolicyCompliancePanel({ input, className, compact }: Props) {
  const findings = checkCampaignPolicy(input);
  const summary = summarizePolicy(findings);

  const statusColor =
    summary.status === "ready"
      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
      : summary.status === "review"
      ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
      : "text-rose-600 bg-rose-500/10 border-rose-500/20";

  const StatusIcon =
    summary.status === "ready" ? CheckCircle2 : summary.status === "review" ? AlertTriangle : XCircle;

  return (
    <section
      className={`rounded-control border border-border bg-surface shadow-sm ${className ?? ""}`}
      aria-label="WhatsApp policy compliance"
    >
      <header className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <div className="font-medium">Policy compliance</div>
        </div>
        <div className={`inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-xs ${statusColor}`}>
          <StatusIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="capitalize">{summary.status}</span>
          <span className="opacity-60">· {summary.score}/100</span>
        </div>
      </header>

      {findings.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          No policy issues detected. Meta template rules and consent checks pass.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {findings.slice(0, compact ? 3 : findings.length).map((f) => (
            <FindingRow key={f.code} finding={f} />
          ))}
        </ul>
      )}

      {compact && findings.length > 3 && (
        <div className="px-4 py-2 text-xs text-muted-foreground">+{findings.length - 3} more findings</div>
      )}
    </section>
  );
}

function FindingRow({ finding }: { finding: PolicyFinding }) {
  const Icon = finding.severity === "error" ? XCircle : finding.severity === "warning" ? AlertTriangle : Info;
  const tone =
    finding.severity === "error"
      ? "text-rose-600"
      : finding.severity === "warning"
      ? "text-amber-600"
      : "text-sky-600";
  return (
    <li className="p-3 flex items-start gap-3">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{finding.title}</div>
        <div className="text-xs text-muted-foreground">{finding.detail}</div>
      </div>
      <code className="ml-auto text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
        {finding.code}
      </code>
    </li>
  );
}
