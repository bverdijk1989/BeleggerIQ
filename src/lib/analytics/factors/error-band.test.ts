import { describe, expect, it } from "vitest";

import {
  computeCompositeStdErr,
  formatCompositeWithBand,
} from "./error-band";

const DEFAULT_WEIGHTS = {
  quality: 0.30,
  value: 0.25,
  momentum: 0.25,
  lowVol: 0.20,
} as const;

describe("computeCompositeStdErr — coverage-driven", () => {
  it("alle pillars op coverage=1 → minimum stdErr (2)", () => {
    const stdErr = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 1.0, reliable: true },
        { key: "value", coverage: 1.0, reliable: true },
        { key: "momentum", coverage: 1.0, reliable: true },
        { key: "lowVol", coverage: 1.0, reliable: true },
      ],
    });
    expect(stdErr).toBe(2);
  });

  it("alle pillars op coverage=0.5 → groter dan minimum (geen 0-onzekerheid)", () => {
    const stdErr = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 0.5, reliable: true },
        { key: "value", coverage: 0.5, reliable: true },
        { key: "momentum", coverage: 0.5, reliable: true },
        { key: "lowVol", coverage: 0.5, reliable: true },
      ],
    });
    expect(stdErr).toBeGreaterThan(2);
    expect(stdErr).toBeLessThan(15);
  });

  it("nul reliable pillars → maximum stdErr (band wijst op composite=50 fallback)", () => {
    const stdErr = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 0.2, reliable: false },
        { key: "value", coverage: 0.1, reliable: false },
        { key: "momentum", coverage: 0.1, reliable: false },
        { key: "lowVol", coverage: 0.0, reliable: false },
      ],
    });
    expect(stdErr).toBe(25);
  });

  it("één enkele reliable pillar met lage coverage → grote stdErr", () => {
    const stdErr = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 0.5, reliable: true },
        { key: "value", coverage: 0.0, reliable: false },
        { key: "momentum", coverage: 0.0, reliable: false },
        { key: "lowVol", coverage: 0.0, reliable: false },
      ],
    });
    expect(stdErr).toBeGreaterThan(3);
  });

  it("hogere coverage → lagere stdErr (monotonie)", () => {
    const lowCov = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 0.5, reliable: true },
        { key: "value", coverage: 0.5, reliable: true },
        { key: "momentum", coverage: 0.5, reliable: true },
        { key: "lowVol", coverage: 0.5, reliable: true },
      ],
    });
    const highCov = computeCompositeStdErr({
      weights: DEFAULT_WEIGHTS,
      pillars: [
        { key: "quality", coverage: 0.9, reliable: true },
        { key: "value", coverage: 0.9, reliable: true },
        { key: "momentum", coverage: 0.9, reliable: true },
        { key: "lowVol", coverage: 0.9, reliable: true },
      ],
    });
    expect(highCov).toBeLessThan(lowCov);
  });
});

describe("formatCompositeWithBand", () => {
  it("composite met stdErr → '65 ± 8'", () => {
    expect(formatCompositeWithBand(65, 8)).toBe("65 ± 8");
  });

  it("zonder stdErr → alleen composite", () => {
    expect(formatCompositeWithBand(65, undefined)).toBe("65");
  });

  it("rondt af op gehele getallen", () => {
    expect(formatCompositeWithBand(65.7, 8.4)).toBe("66 ± 8");
  });
});
