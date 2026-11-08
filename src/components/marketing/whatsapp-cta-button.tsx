/**
 * WhatsAppCtaButton — prominent click-to-chat CTA.
 *
 * Opens WhatsApp with a prefilled message built from the platform's
 * configurable channel token (Super Admin → Platform Settings → General).
 * When no usable token is configured it links to the configured fallback
 * (an internal route or an external URL) instead of dead-ending.
 */
import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWhatsAppCta } from "@/hooks/use-whatsapp-cta";
import { ctaAttrs } from "@/lib/analytics/events";

type Props = {
  /** Override the prefilled message for this placement. */
  message?: string;
  /** Override the button label. */
  label?: string;
  /** Render nothing when the CTA is disabled platform-wide (default true). */
  respectEnabled?: boolean;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  showIcon?: boolean;
  /** Where on the page this CTA sits — reported with the analytics event. */
  analyticsLocation?: string;
};

export function WhatsAppCtaButton({
  message,
  label,
  respectEnabled = true,
  className,
  variant = "whatsapp",
  size = "xl",
  showIcon = true,
  analyticsLocation = "page",
}: Props) {
  const cta = useWhatsAppCta({ message, label });
  if (respectEnabled && !cta.enabled) return null;

  const tracking = ctaAttrs(
    cta.isFallback ? "whatsapp-fallback" : "whatsapp-chat",
    analyticsLocation,
    "whatsapp_click",
    cta.label,
  );

  const content = (
    <>
      {showIcon && <MessageCircle aria-hidden />}
      {cta.label}
    </>
  );

  if (cta.isInternal) {
    return (
      <Button asChild variant={variant} size={size} className={className}>
        <Link to={cta.href} {...tracking}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a
        href={cta.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={cta.isFallback ? cta.label : `${cta.label} (opens WhatsApp)`}
        {...tracking}
      >
        {content}
      </a>
    </Button>
  );
}

/** Floating click-to-chat bubble, pinned bottom-right. */
export function WhatsAppFloatingCta({ message }: { message?: string }) {
  const cta = useWhatsAppCta({ message });
  const [dismissed, setDismissed] = React.useState(false);
  if (!cta.enabled || dismissed) return null;

  const shared = cn(
    "group flex items-center gap-2 rounded-full bg-whatsapp py-4 px-4 text-sm font-medium shadow-elegant transition-transform hover:scale-105",
    "text-white shadow-elegant transition-transform hover:scale-105",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-whatsapp focus-visible:ring-offset-2",
  );

  const tracking = ctaAttrs("whatsapp-floating", "floating", "whatsapp_click", cta.label);

  return (
    <div className="fixed bottom-5 right-5 z-50 print:hidden">
      <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-whatsapp/30" aria-hidden />
      {cta.isInternal ? (
        <Link to={cta.href} className={cn(shared, "relative")} onClick={() => setDismissed(false)} {...tracking}>
          <MessageCircle className="size-6" aria-hidden />
          <span className="hidden">{cta.label}</span>
        </Link>
      ) : (
        <a
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(shared, "relative")}
          aria-label={`${cta.label} (opens WhatsApp)`}
          {...tracking}
        >
          <MessageCircle className="size-6" aria-hidden />
          <span className="hidden">{cta.label}</span>
        </a>
      )}
    </div>
  );
}
