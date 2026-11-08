import type {
  CreateLinkInput,
  CreateLinkResult,
  PaymentLinkProvider,
  PaymentProviderId,
  RefundInput,
  RefundResult,
} from './types';

/**
 * Stub provider used when a real API key isn't configured. It returns null for
 * `hostedUrl` so the caller falls back to the internal `/pay/$token` page,
 * which still processes payments end-to-end for testing and demo flows.
 * Replace with a real SDK call when configuring the provider.
 */
export function makeStubProvider(config: {
  id: PaymentProviderId;
  displayName: string;
  currencies?: readonly string[];
  supportsPartial?: boolean;
  supportsRecurring?: boolean;
  supportsRefunds?: boolean;
}): PaymentLinkProvider {
  return {
    id: config.id,
    displayName: config.displayName,
    currencies: config.currencies ?? [],
    supportsPartial: config.supportsPartial ?? true,
    supportsRecurring: config.supportsRecurring ?? true,
    supportsRefunds: config.supportsRefunds ?? true,
    async createLink(_input: CreateLinkInput): Promise<CreateLinkResult> {
      return { providerReference: null, hostedUrl: null, metadata: { provider: config.id, mode: 'stub' } };
    },
    async refund(input: RefundInput): Promise<RefundResult> {
      return {
        refundReference: `stub_${input.providerReference}_${Date.now()}`,
        status: 'succeeded',
      };
    },
  };
}
