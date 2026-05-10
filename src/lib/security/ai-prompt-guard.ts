/**
 * AI prompt-guard — assert dat content die naar een LLM-provider gaat
 * geen rauwe PII bevat (email, IP, bearer-tokens). Defense-in-depth:
 *  - We sturen al expliciet géén email/IP naar providers, maar een
 *    refactor kan dat per ongeluk introduceren
 *  - Deze guard breekt **fail-closed** in productie en **fail-warn** in
 *    dev/test zodat developers het direct in de logs zien
 *
 * **Topbelegger-laag**:
 *  - Wood: AI moet veilig en verantwoord zijn — guard maakt expliciet
 *    welke patronen NOOIT in een LLM-prompt mogen
 *  - Simons: deterministisch, regex-gebaseerd, testbaar
 */

import { detectPII, redactString } from "./redact";

export class AIPromptPIIError extends Error {
  constructor(message: string, public readonly findings: ReturnType<typeof detectPII>) {
    super(message);
    this.name = "AIPromptPIIError";
  }
}

export interface AIPromptGuardOptions {
  /** Of we strikt moeten falen (throw) ipv warnen + redacted-string returnen.
   *  Default: gedetecteerd via NODE_ENV — productie strikt, dev tolerant. */
  strict?: boolean;
  /** Test-hook voor strict-bepaling. */
  isProduction?: boolean;
  /** Optionele callback om de event te loggen — caller bepaalt logger. */
  onLeak?: (findings: ReturnType<typeof detectPII>) => void;
}

/**
 * Inspecteer een prompt-string. Returnt een SAFE versie:
 *  - In `strict`: throw `AIPromptPIIError` bij detectie
 *  - In non-strict: redact + log een warning via `onLeak`
 *
 * Gebruik als laatste laag voordat je naar `provider.complete(...)` stuurt.
 */
export function ensureNoPIIInPrompt(
  prompt: string,
  opts: AIPromptGuardOptions = {},
): string {
  const findings = detectPII(prompt);
  const hasLeak =
    findings.emails.length > 0 ||
    findings.ipv4s.length > 0 ||
    findings.bearers.length > 0;

  if (!hasLeak) return prompt;

  const isProd =
    opts.isProduction ??
    (typeof process !== "undefined" && process.env.NODE_ENV === "production");
  const strict = opts.strict ?? isProd;

  if (opts.onLeak) {
    try {
      opts.onLeak(findings);
    } catch {
      /* logger faalt → niet de hoofd-call breken */
    }
  }

  if (strict) {
    throw new AIPromptPIIError(
      `LLM prompt would have leaked PII: emails=${findings.emails.length}, ipv4s=${findings.ipv4s.length}, bearers=${findings.bearers.length}`,
      findings,
    );
  }

  // Soft-mode: redact en stuur door, met visible marker zodat downstream
  // ziet dat er ingegrepen is.
  return redactString(prompt);
}

/**
 * Wrapper voor structured prompts (system + user messages). Past
 * `ensureNoPIIInPrompt` toe op elk content-veld. Mutatie-vrij.
 */
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function ensureNoPIIInMessages(
  messages: ReadonlyArray<PromptMessage>,
  opts: AIPromptGuardOptions = {},
): ReadonlyArray<PromptMessage> {
  return messages.map((m) => ({
    role: m.role,
    content: ensureNoPIIInPrompt(m.content, opts),
  }));
}
