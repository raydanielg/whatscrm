import { createFileRoute } from "@tanstack/react-router";
import { ChatbotBuilder } from "@/components/app/chatbots/builder/chatbot-builder";

export const Route = createFileRoute("/_authenticated/chatbots/$botId_/builder")({
  head: () => ({ meta: [{ title: "Flow Builder · Chatbot" }] }),
  component: BuilderPage,
});

function BuilderPage() {
  const { botId } = Route.useParams();
  return <ChatbotBuilder botId={botId} />;
}
