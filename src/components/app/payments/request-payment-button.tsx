import { useState } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentWorkspace } from '@/hooks/use-workspace';
import { PaymentLinkCreateDialog, type PaymentLinkPrefill } from './payment-link-create-dialog';

/** Reusable icon action button that opens the payment-link create dialog pre-filled. */
export function RequestPaymentButton({
  prefill,
  variant = 'outline',
  label = 'Request payment',
  className,
}: {
  prefill?: PaymentLinkPrefill;
  variant?: ButtonProps['variant'];
  label?: string;
  className?: string;
}) {
  const { active } = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={variant}
              className={className}
              onClick={() => setOpen(true)}
              disabled={!active?.id}
              aria-label={label}
            >
              <CreditCard className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {active?.id && (
        <PaymentLinkCreateDialog
          open={open}
          onOpenChange={setOpen}
          workspaceId={active.id}
          prefill={prefill}
        />
      )}
    </>
  );
}

