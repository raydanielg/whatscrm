import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { submitMarketingLead } from "@/lib/marketing/lead-capture.functions";
import {
  COMPANY_SIZES,
  leadCaptureSchema,
  readUtmParams,
  type LeadCaptureInput,
} from "@/lib/marketing/lead-capture";
import { trackMarketing } from "@/lib/analytics/events";

type Errors = Partial<Record<keyof LeadCaptureInput, string>>;

const EMPTY: LeadCaptureInput = {
  fullName: "",
  workEmail: "",
  companySize: "",
  contactMethod: "email",
  whatsappNumber: "",
  message: "",
  utm: {},
  website: "",
};

export function LeadCaptureForm() {
  const [values, setValues] = useState<LeadCaptureInput>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const submit = useServerFn(submitMarketingLead);

  const [started, setStarted] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: LeadCaptureInput) => submit({ data: input }),
    onSuccess: (_res, input) => {
      trackMarketing("lead_form_success", {
        form_id: "lead-capture",
        company_size: input.companySize,
        contact_method: input.contactMethod,
      });
    },
    onError: (error) => {
      trackMarketing("lead_form_error", {
        form_id: "lead-capture",
        reason: "server",
        message: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });
    },
  });

  const set = <K extends keyof LeadCaptureInput>(key: K, value: LeadCaptureInput[K]) => {
    if (!started) {
      setStarted(true);
      trackMarketing("lead_form_start", { form_id: "lead-capture", field: String(key) });
    }
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const payload: LeadCaptureInput = {
      ...values,
      sourcePage: typeof window === "undefined" ? "" : window.location.pathname,
      referrer: typeof document === "undefined" ? "" : document.referrer.slice(0, 500),
      utm: typeof window === "undefined" ? {} : readUtmParams(window.location.search),
    };

    const parsed = leadCaptureSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof LeadCaptureInput | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      trackMarketing("lead_form_error", {
        form_id: "lead-capture",
        reason: "validation",
        fields: Object.keys(next).join(","),
      });
      return;
    }
    setErrors({});
    trackMarketing("lead_form_submit", {
      form_id: "lead-capture",
      company_size: payload.companySize,
      contact_method: payload.contactMethod,
      has_message: Boolean(payload.message?.trim()),
    });
    mutation.mutate(payload);
  };

  if (mutation.isSuccess) {
    return (
      <div className="rounded-control border border-border bg-background p-8 text-center shadow-xl ">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-whatsapp-muted">
          <Check className="size-6 text-foreground" />
        </div>
        <h3 className="text-marketing-card-title mt-5 text-xl">You're on the list.</h3>
        <p className="text-marketing-card-body mx-auto mt-2 max-w-sm">
          {values.contactMethod === "whatsapp"
            ? "We'll message you on WhatsApp within one business day with a walkthrough link."
            : "We'll email you within one business day with your demo link and setup guide."}
        </p>
        <Button
          variant="outline"
          size="cta"
          className="mt-6"
          onClick={() => {
            mutation.reset();
            setValues(EMPTY);
          }}
        >
          Submit another request
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-control border border-border/70 bg-background p-5 text-foreground shadow-2xl sm:p-8"
    >
      <div className="grid gap-[1.125rem]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="lead-name">Full name</Label>
            <Input
              id="lead-name"
              name="name"
              autoComplete="name"
              maxLength={100}
              placeholder="Amira Khan"
              value={values.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              aria-invalid={Boolean(errors.fullName)}
              className="h-11 bg-background"
            />
            {errors.fullName && <FieldError>{errors.fullName}</FieldError>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-email">Work email</Label>
            <Input
              id="lead-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={255}
              placeholder="you@company.com"
              value={values.workEmail}
              onChange={(e) => set("workEmail", e.target.value)}
              aria-invalid={Boolean(errors.workEmail)}
              className="h-11 bg-background"
            />
            {errors.workEmail && <FieldError>{errors.workEmail}</FieldError>}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="lead-size">Company size</Label>
          <Select value={values.companySize} onValueChange={(v) => set("companySize", v)}>
            <SelectTrigger
              id="lead-size"
              aria-invalid={Boolean(errors.companySize)}
              className="h-11 bg-background rounded-control "
            >
              <SelectValue placeholder="Select team size" />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.companySize && <FieldError>{errors.companySize}</FieldError>}
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium text-foreground">
            How should we reach you?
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <ContactOption
              icon={Mail}
              label="Email me"
              hint="Demo link + setup guide"
              selected={values.contactMethod === "email"}
              onSelect={() => set("contactMethod", "email")}
            />
            <ContactOption
              icon={MessageCircle}
              label="WhatsApp me"
              hint="Fastest — usually same day"
              selected={values.contactMethod === "whatsapp"}
              onSelect={() => set("contactMethod", "whatsapp")}
            />
          </div>
        </fieldset>

        {values.contactMethod === "whatsapp" && (
          <div className="grid gap-2">
            <Label htmlFor="lead-whatsapp">WhatsApp number</Label>
            <Input
              id="lead-whatsapp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              placeholder="+971 50 123 4567"
              value={values.whatsappNumber}
              onChange={(e) => set("whatsappNumber", e.target.value)}
              aria-invalid={Boolean(errors.whatsappNumber)}
              className="h-11 bg-background"
            />
            {errors.whatsappNumber ? (
              <FieldError>{errors.whatsappNumber}</FieldError>
            ) : (
              <p className="text-xs text-muted-foreground">
                Include your country code. We only use it for this conversation.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="lead-message">
            What do you want to solve? <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="lead-message"
            name="message"
            rows={3}
            maxLength={1000}
            placeholder="We handle ~400 WhatsApp chats a day across 3 numbers"
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            className="min-h-24 bg-background"
          />
          {errors.message && <FieldError>{errors.message}</FieldError>}
        </div>

        {/* Honeypot — hidden from humans, irresistible to bots. */}
        <div aria-hidden className="hidden">
          <label htmlFor="lead-website">Website</label>
          <input
            id="lead-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            Something went wrong sending your request. Please try again.
          </p>
        )}

        <Button type="submit" variant="primary" size="cta" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Sending
            </>
          ) : (
            <>
              Get my demo <ArrowRight />
            </>
          )}
        </Button>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-whatsapp" />
          No spam, no reselling. We reply once and only follow up if you ask us to.
        </p>
      </div>
    </form>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs text-destructive">
      {children}
    </p>
  );
}

function ContactOption({
  icon: Icon,
  label,
  hint,
  selected,
  onSelect,
}: {
  icon: typeof Mail;
  label: string;
  hint: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-w-0 items-start gap-3 rounded-control border p-3 text-left transition-colors ${
        selected
          ? "border-primary bg-accent-muted"
          : "border-border bg-background hover:border-primary/40"
      }`}
    >
      <span
        className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-control ${
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/** Keeps the zod peer import referenced for type inference tooling. */
export type LeadCaptureFormSchema = z.infer<typeof leadCaptureSchema>;
