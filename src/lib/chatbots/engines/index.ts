/**
 * Chatbot Platform — modular engine architecture.
 *
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │                       ChatbotOrchestrator                            │
 *   │                                                                      │
 *   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
 *   │  │ Channel    │→│  Intent    │  │ Sentiment  │  │  Flow Engine  │  │
 *   │  │ Adapter    │  │  Engine    │  │  Engine    │  │  (visual)     │  │
 *   │  └────────────┘  └────────────┘  └────────────┘  └───────────────┘  │
 *   │        ↓               ↓               ↓                ↓            │
 *   │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
 *   │  │  Handoff   │  │  Memory    │  │    KB      │  │   Context     │  │
 *   │  │  Engine    │  │  Engine    │  │  Engine    │  │   Engine      │  │
 *   │  └────────────┘  └────────────┘  └────────────┘  └───────────────┘  │
 *   │                                          ↓                            │
 *   │                                     ┌────────────┐                    │
 *   │                                     │  AI Engine │  (provider-agnostic)│
 *   │                                     └────────────┘                    │
 *   │                                          ↓                            │
 *   │                                     ┌────────────┐                    │
 *   │                                     │ Analytics  │                    │
 *   │                                     └────────────┘                    │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 *  Design goals
 *  ────────────
 *  • Modular      Each engine is a single file with pure functions.
 *  • Provider-based  AI Engine + Channel Adapter route through registries.
 *  • Scalable     Storage-agnostic (deps bag) so it fans out horizontally.
 *  • Realtime     Every message write is a Supabase INSERT that fans out via
 *                 Realtime; the UI subscribes for live-streaming replies.
 *  • Multi-tenant Every engine input carries `workspaceId`; RLS enforces it.
 *  • Production-ready  Fast heuristics first, LLM second; timeouts and
 *                 fallbacks at every stage.
 */
export * from "./types";
export * from "./context-engine";
export * from "./intent-engine";
export * from "./sentiment-engine";
export * from "./memory-engine";
export * from "./flow-engine";
export * from "./handoff-engine";
export * from "./kb-engine";
export * from "./ai-engine";
export * from "./channel-adapter";
export * from "./analytics-engine";
export * from "./orchestrator";
