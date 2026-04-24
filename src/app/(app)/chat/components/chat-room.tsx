"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Bot, SendHorizontal, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { postJson } from "@/lib/http/client";
import { cn } from "@/lib/utils";
import type {
  ChatContext,
  ChatMessage,
  ChatResponseBody,
} from "@/types/chat";

import { ContextChips } from "./context-chips";
import { QuickPrompts } from "./quick-prompts";

interface ChatRoomProps {
  initialContext: ChatContext;
  welcomeMessage: ChatMessage;
}

/**
 * Chat container met berichten, input en quick prompts. State is
 * volledig lokaal; elke submit doet een POST naar /api/chat en
 * vervangt de context-chips met de verse snapshot uit de response.
 */
export function ChatRoom({ initialContext, welcomeMessage }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [context, setContext] = useState<ChatContext>(initialContext);
  const [input, setInput] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, isPending]);

  const history = useMemo(
    () => messages.filter((m) => m.role !== "system"),
    [messages],
  );

  const send = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || isPending) return;
      setError(null);
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      startTransition(async () => {
        const result = await postJson<ChatResponseBody>("/api/chat", {
          message: trimmed,
          history,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessages((prev) => [...prev, result.data.message]);
        setContext(result.data.context);
      });
    },
    [history, isPending],
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(input);
  };

  return (
    <Card className="flex min-h-[640px] flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <ContextChips context={context} />

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-md border border-border/60 bg-surface/40 p-4"
          role="log"
          aria-live="polite"
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isPending && <AssistantTypingBubble />}
        </div>

        {error && (
          <p className="text-xs text-destructive" role="status">
            {error}
          </p>
        )}

        <QuickPrompts onSelect={(prompt) => send(prompt)} disabled={isPending} />

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border/60 pt-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Stel een vraag — noem een ticker voor specifieke positie-analyse."
            disabled={isPending}
            className={cn(
              "flex-1 rounded-md border border-border/60 bg-surface px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isPending && "opacity-60",
            )}
          />
          <Button type="submit" disabled={isPending || input.trim() === ""}>
            <SendHorizontal className="h-4 w-4" />
            Versturen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Bubbles
// ============================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") return <UserBubble message={message} />;
  return <AssistantBubble message={message} />;
}

function UserBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-1 justify-end">
        <div className="max-w-[80%] rounded-md bg-primary/15 px-3 py-2 text-sm text-foreground">
          {message.content}
        </div>
      </div>
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
        <User className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated text-primary">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 space-y-2 rounded-md border border-border/60 bg-surface/80 p-3">
        {message.headline && (
          <p className="text-sm font-semibold text-foreground">
            {message.headline}
          </p>
        )}
        <p className="text-sm text-foreground">{message.content}</p>
        {message.bullets && message.bullets.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {message.bullets.map((bullet, i) => (
              <li key={i}>• {bullet}</li>
            ))}
          </ul>
        )}
        {message.disclaimer && (
          <p className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
            {message.disclaimer}
          </p>
        )}
        {message.confidence && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Confidence {message.confidence}
          </p>
        )}
      </div>
    </div>
  );
}

function AssistantTypingBubble() {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated text-primary">
        <Bot className="h-3.5 w-3.5" />
      </span>
      <div className="flex items-center gap-1 rounded-md border border-border/60 bg-surface/80 px-3 py-2 text-xs text-muted-foreground">
        <span className="animate-pulse">•</span>
        <span className="animate-pulse [animation-delay:120ms]">•</span>
        <span className="animate-pulse [animation-delay:240ms]">•</span>
        <span className="ml-2">Engines raadplegen…</span>
      </div>
    </div>
  );
}
