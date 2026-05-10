import { describe, expect, it } from "vitest";

import {
  buildChatContextForLLM,
  CHAT_MEMORY_MAX,
  parseChatMemory,
} from "./chat-memory";

describe("parseChatMemory", () => {
  it("default state op lege blob", () => {
    const s = parseChatMemory(null);
    expect(s.messages).toEqual([]);
  });

  it("droppt invalid roles → fallback user", () => {
    const s = parseChatMemory({
      messages: [
        { id: "1", role: "moderator", content: "hi", createdAt: "2026-05-10T00:00:00Z" },
      ],
    });
    expect(s.messages[0]?.role).toBe("user");
  });

  it("droppt empty content", () => {
    const s = parseChatMemory({
      messages: [
        { id: "1", role: "user", content: "", createdAt: "2026-05-10T00:00:00Z" },
        { id: "2", role: "user", content: "hello", createdAt: "2026-05-10T00:00:01Z" },
      ],
    });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]?.content).toBe("hello");
  });

  it("trimt tot CHAT_MEMORY_MAX", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: `msg ${i}`,
      createdAt: new Date().toISOString(),
    }));
    const s = parseChatMemory({ messages });
    expect(s.messages).toHaveLength(CHAT_MEMORY_MAX);
    // Laatste-N → de NIEUWSTE blijven over.
    expect(s.messages[0]?.content).toBe(`msg ${50 - CHAT_MEMORY_MAX}`);
    expect(s.messages[s.messages.length - 1]?.content).toBe("msg 49");
  });

  it("CHAT_MEMORY_MAX is een redelijke buffer", () => {
    expect(CHAT_MEMORY_MAX).toBeGreaterThanOrEqual(10);
    expect(CHAT_MEMORY_MAX).toBeLessThanOrEqual(50);
  });
});

describe("buildChatContextForLLM", () => {
  it("retourneert lege string bij geen messages", () => {
    expect(buildChatContextForLLM({ messages: [], updatedAt: "" })).toBe("");
  });

  it("formatteert role + content", () => {
    const out = buildChatContextForLLM({
      messages: [
        { id: "1", role: "user", content: "vraag?", createdAt: "" },
        { id: "2", role: "assistant", content: "antwoord.", createdAt: "" },
      ],
      updatedAt: "",
    });
    expect(out).toContain("[USER] vraag?");
    expect(out).toContain("[ASSISTANT] antwoord.");
  });

  it("respecteert limit-parameter", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      role: "user" as const,
      content: `msg ${i}`,
      createdAt: "",
    }));
    const out = buildChatContextForLLM({ messages, updatedAt: "" }, 3);
    const lines = out.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("msg 7");
    expect(lines[2]).toContain("msg 9");
  });
});
