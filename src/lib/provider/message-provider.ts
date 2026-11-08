// Provider-agnostic messaging adapter.
// v1.0 ships a Mock provider so the entire product is demo-ready.
// A Meta Cloud API adapter and an on-prem/WA-Business adapter plug in behind
// this interface without touching the UI, hooks, or database schema.

export interface OutboundMessage {
  to: string;
  body: string;
  mediaUrl?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export interface SendResult {
  providerMessageId: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
}

export interface MessageProvider {
  name: string;
  send(msg: OutboundMessage): Promise<SendResult>;
  verifyWebhook?(request: Request): Promise<boolean>;
  parseInbound?(payload: unknown): { from: string; body: string; providerMessageId: string } | null;
}

class MockProvider implements MessageProvider {
  name = "mock";
  async send(msg: OutboundMessage): Promise<SendResult> {
    await new Promise((r) => setTimeout(r, 400));
    return {
      providerMessageId: `mock_${Math.random().toString(36).slice(2, 10)}`,
      status: "sent",
    };
  }
}

let _provider: MessageProvider = new MockProvider();
export const getMessageProvider = () => _provider;
export const setMessageProvider = (p: MessageProvider) => { _provider = p; };
