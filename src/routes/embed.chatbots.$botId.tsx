/**
 * Public embed page for the Live Chat Widget.
 *
 * Loaded inside the launcher iframe (via `/embed/chatbots/:botId`) OR
 * directly for full-page chat. It is deliberately outside `_authenticated`
 * so any website visitor can reach it without a session.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SearchSchema = z.object({
  color: z.string().optional(),
  pos: z.enum(["br", "bl"]).optional(),
});

export const Route = createFileRoute("/embed/chatbots/$botId")({
  ssr: false,
  validateSearch: (input) => SearchSchema.parse(input),
  head: () => ({
    meta: [
      { title: "Live chat" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: EmbedPage,
});

function EmbedPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">
        This chat embed has moved. Ask the site owner to reinstall the chat widget snippet.
      </p>
    </div>
  );
}
