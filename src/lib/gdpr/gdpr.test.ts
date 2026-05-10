import { describe, expect, it } from "vitest";

import {
  DELETE_CONFIRMATION_PHRASE,
  USER_DATA_EXPORT_SCHEMA_VERSION,
} from "./index";

describe("GDPR constants", () => {
  it("DELETE_CONFIRMATION_PHRASE is non-empty stable string", () => {
    expect(DELETE_CONFIRMATION_PHRASE.length).toBeGreaterThan(5);
    // Stable: nooit hernoemen — UI hangt erop.
    expect(DELETE_CONFIRMATION_PHRASE).toBe("VERWIJDER MIJN ACCOUNT");
  });

  it("USER_DATA_EXPORT_SCHEMA_VERSION is een positief geheel getal", () => {
    expect(Number.isInteger(USER_DATA_EXPORT_SCHEMA_VERSION)).toBe(true);
    expect(USER_DATA_EXPORT_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
