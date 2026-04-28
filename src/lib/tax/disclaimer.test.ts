import { describe, expect, it } from "vitest";

import {
  TAX_DISCLAIMER_BODY,
  TAX_DISCLAIMER_SHORT,
  TAX_DISCLAIMER_TITLE,
} from "./disclaimer";

describe("tax disclaimer", () => {
  it("title kondigt expliciet aan: GEEN formeel belastingadvies", () => {
    expect(TAX_DISCLAIMER_TITLE).toMatch(/geen.*belastingadvies/i);
  });

  it("body benoemt expliciet 'GEEN belastingadvies'", () => {
    expect(TAX_DISCLAIMER_BODY).toMatch(/GEEN belastingadvies/);
  });

  it("body verwijst naar accountant en/of Belastingdienst", () => {
    expect(TAX_DISCLAIMER_BODY).toMatch(/accountant/i);
    expect(TAX_DISCLAIMER_BODY).toMatch(/belastingdienst/i);
  });

  it("short-versie is voor inline gebruik (één regel)", () => {
    expect(TAX_DISCLAIMER_SHORT.length).toBeLessThan(200);
    expect(TAX_DISCLAIMER_SHORT).not.toContain("\n");
  });
});
