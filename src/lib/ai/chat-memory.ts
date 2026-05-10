/**
 * Chat conversation-memory — persistent history per user.
 *
 * **Doel**: maakt de chat-pagina meer dan een one-shot Q&A; de LLM (of
 * deterministische chat) krijgt de laatste N berichten als context. Dat
 * is de minimale stap richting een "agent"-experience zonder agent-
 * frameworks te introduceren.
 *
 * **Storage**: rolling buffer in `UserProfile.preferences.chatHistory`
 * — geen aparte tabel (zelfde patroon als alerts/community/billing).
 * Buffer-grens van 20 messages voorkomt dat de blob explodeert.
 *
 * **Privacy**: berichten zijn user-eigen. Een delete-account-flow
 * (Module 17) wist 'em automatisch via cascade.
 */

import { prisma } from "@/lib/data/prisma";
import type { Prisma } from "@prisma/client";

const MAX_HISTORY = 20;

export type ChatRole = "user" | "assistant" | "system";

export interface PersistedChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Optioneel: welke intent de assistent detecteerde. */
  intent?: string;
}

export interface ChatMemoryState {
  messages: PersistedChatMessage[];
  /** Laatst geupdate timestamp — voor staleness-checks. */
  updatedAt: string;
}

const DEFAULT_STATE: ChatMemoryState = {
  messages: [],
  updatedAt: new Date(0).toISOString(),
};

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant" || value === "system";
}

export function parseChatMemory(raw: unknown): ChatMemoryState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_STATE, messages: [] };
  }
  const obj = raw as Record<string, unknown>;
  const messagesRaw = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: PersistedChatMessage[] = messagesRaw
    .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
    .map((m) => ({
      id: typeof m.id === "string" ? m.id : crypto.randomUUID(),
      role: isChatRole(m.role) ? m.role : "user",
      content: typeof m.content === "string" ? m.content : "",
      createdAt:
        typeof m.createdAt === "string"
          ? m.createdAt
          : new Date().toISOString(),
      intent: typeof m.intent === "string" ? m.intent : undefined,
    }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_HISTORY);

  return {
    messages,
    updatedAt:
      typeof obj.updatedAt === "string"
        ? obj.updatedAt
        : new Date(0).toISOString(),
  };
}

export async function loadChatMemory(
  userId: string,
): Promise<ChatMemoryState> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  return parseChatMemory(prefsObj.chatHistory);
}

/**
 * Voeg een bericht toe aan de history. Trimt automatisch tot MAX_HISTORY.
 */
export async function appendChatMessage(input: {
  userId: string;
  role: ChatRole;
  content: string;
  intent?: string;
}): Promise<PersistedChatMessage> {
  const trimmed = input.content.slice(0, 4000); // hard cap per message
  const message: PersistedChatMessage = {
    id: crypto.randomUUID(),
    role: input.role,
    content: trimmed,
    createdAt: new Date().toISOString(),
    intent: input.intent,
  };

  const profile = await prisma.userProfile.findUnique({
    where: { userId: input.userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  const current = parseChatMemory(prefsObj.chatHistory);
  const newState: ChatMemoryState = {
    messages: [...current.messages, message].slice(-MAX_HISTORY),
    updatedAt: new Date().toISOString(),
  };

  const newPrefs = { ...prefsObj, chatHistory: newState };
  await prisma.userProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
    update: {
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
  });

  return message;
}

/**
 * Wis de complete history — voor "Wis gesprek"-knop in UI.
 */
export async function clearChatMemory(userId: string): Promise<void> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });
  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  const newPrefs = {
    ...prefsObj,
    chatHistory: { messages: [], updatedAt: new Date().toISOString() },
  };
  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
    update: {
      preferences: newPrefs as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Bouwt een prompt-context-blok van de laatste N messages voor de LLM.
 * Skipt te oude messages om hallucination-risico te beperken.
 */
export function buildChatContextForLLM(
  state: ChatMemoryState,
  limit = 10,
): string {
  const recent = state.messages.slice(-limit);
  if (recent.length === 0) return "";
  return recent
    .map((m) => `[${m.role.toUpperCase()}] ${m.content}`)
    .join("\n");
}

/**
 * Tests + UI hangen op deze constants — niet hernoemen.
 */
export const CHAT_MEMORY_MAX = MAX_HISTORY;
