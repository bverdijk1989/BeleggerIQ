import { Bot, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { buildWelcomeMessage } from "@/lib/ai/chat";
import { resolveUserFromServer } from "@/lib/auth";

import { loadChatContext } from "./build-chat-context";
import { ChatRoom } from "./components/chat-room";

export const metadata = {
  title: "Chat",
};

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Onderzoek"
          title="Chat"
          description="Authenticatie vereist om je chat-context te laden."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }
  const loaded = await loadChatContext(auth.user.email).catch(() => null);

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Chat"
        description="Explainable investing coach. Antwoorden komen uit je portfolio, factor-scores, risico-engine, marktregime en maandplan — nooit uit lucht."
      />

      {!loaded ? (
        <EmptyState
          icon={Bot}
          title="Chat wacht op data"
          description="Er is nog geen portefeuille om context over te geven. Importeer holdings of draai `npm run prisma:seed`."
        />
      ) : (
        <ChatRoom
          initialContext={loaded.ctx}
          welcomeMessage={buildWelcomeMessage(loaded.ctx)}
        />
      )}
    </>
  );
}
