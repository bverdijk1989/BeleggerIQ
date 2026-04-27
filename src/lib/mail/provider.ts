import { log } from "@/lib/log";

/**
 * Mail-provider-abstractie voor BeleggerIQ.
 *
 * Drie modi:
 *  1. **Console-fallback** (default in NON-productie). Logt de
 *     magic-link naar de server-console + waarschuwing dat dit alleen
 *     voor development is.
 *  2. **SMTP** (productie). Vereist `nodemailer` als runtime-dep én
 *     volledige SMTP-env-configuratie. We gebruiken dynamic-import
 *     zodat de package alleen in de runtime-bundle terechtkomt
 *     wanneer 'ie ook echt is geïnstalleerd.
 *  3. **Test-recorder** — geïnjecteerd via `setMailProvider()`, vangt
 *     berichten in een memory-buffer voor unit-tests.
 *
 * Productie-checklist:
 *  - `MAIL_TRANSPORT=smtp`
 *  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
 *  - `npm install nodemailer @types/nodemailer`
 *  - Indien `MAIL_TRANSPORT` niet is gezet of nodemailer ontbreekt
 *    valt de provider terug op console-mode + log-warning.
 */

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface MailProvider {
  send(input: SendMailInput): Promise<void>;
}

let activeProvider: MailProvider | null = null;

/** Test-only: forceer een provider (bv. recorder voor unit-tests). */
export function setMailProvider(provider: MailProvider | null): void {
  activeProvider = provider;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  const provider = activeProvider ?? defaultProvider();
  await provider.send(input);
}

// ============================================================
//  Default provider — kiest op runtime-config
// ============================================================

function defaultProvider(): MailProvider {
  const transport = (process.env.MAIL_TRANSPORT ?? "").toLowerCase();
  if (transport === "smtp") return smtpProvider();
  return consoleProvider();
}

// ============================================================
//  Console-provider (dev-fallback)
// ============================================================

function consoleProvider(): MailProvider {
  return {
    async send(input: SendMailInput): Promise<void> {
      if (process.env.NODE_ENV === "production") {
        log.warn(
          "mail",
          "MAIL_TRANSPORT=smtp niet geconfigureerd in productie — magic link wordt niet daadwerkelijk verstuurd",
        );
      }
      log.info("mail:console", "would send mail", {
        to: input.to,
        subject: input.subject,
        bodyPreview: input.text.slice(0, 280),
      });
    },
  };
}

// ============================================================
//  SMTP-provider (productie via dynamic-import)
// ============================================================

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  if (!host || !user || !pass || !from || !Number.isFinite(port)) return null;
  return { host, port, user, pass, from };
}

function smtpProvider(): MailProvider {
  return {
    async send(input: SendMailInput): Promise<void> {
      const cfg = readSmtpConfig();
      if (!cfg) {
        log.warn(
          "mail",
          "MAIL_TRANSPORT=smtp maar SMTP_HOST/PORT/USER/PASS/FROM ontbreken — fallback op console",
        );
        return consoleProvider().send(input);
      }
      try {
        // Dynamic import zodat nodemailer geen hard dependency wordt;
        // productie-deploys die SMTP willen installeren `nodemailer`
        // expliciet. We typen de import als `NodemailerLike` zodat tsc
        // niet faalt wanneer de package niet is geïnstalleerd.
        const mod = (await loadNodemailer()) as NodemailerLike | null;
        if (!mod || typeof mod.createTransport !== "function") {
          log.warn(
            "mail",
            "nodemailer niet geïnstalleerd; voer `npm install nodemailer` uit voor SMTP-verzending",
          );
          return consoleProvider().send(input);
        }
        const transporter = mod.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.port === 465,
          auth: { user: cfg.user, pass: cfg.pass },
        });
        await transporter.sendMail({
          from: input.from ?? cfg.from,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        });
        log.info("mail:smtp", "sent", { to: input.to, subject: input.subject });
      } catch (error) {
        log.error("mail:smtp", "send failed", { error: stringifyError(error) });
        throw error;
      }
    },
  };
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

// Untyped shim om dynamic-import naar nodemailer mogelijk te maken
// zonder dat tsc faalt wanneer de package ontbreekt.
interface NodemailerTransporter {
  sendMail(opts: {
    from?: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}
interface NodemailerLike {
  createTransport(opts: {
    host: string;
    port: number;
    secure?: boolean;
    auth: { user: string; pass: string };
  }): NodemailerTransporter;
}

async function loadNodemailer(): Promise<NodemailerLike | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await (Function("m", "return import(m)")(
      "nodemailer",
    ) as Promise<unknown>)) as { default?: NodemailerLike } & NodemailerLike;
    return (mod.default ?? mod) as NodemailerLike;
  } catch {
    return null;
  }
}
