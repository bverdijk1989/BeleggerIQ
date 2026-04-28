/**
 * Next.js instrumentation hook.
 *
 * Draait éénmalig bij server-startup, vóór de eerste request. We
 * gebruiken 'em om optionele observability-clients te initialiseren
 * (Sentry vandaag; OTel/Datadog in de toekomst).
 *
 * **Geen blocking calls.** Een trage init mag de cold-start niet
 * verlammen — `initSentry` is async en wacht op een dynamische import,
 * maar die is goedkoop wanneer het package niet geïnstalleerd is.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  // We splitsen het import-pad zodat instrumentation hooks die niet
  // relevant zijn in de Edge-runtime (Sentry-Node) niet per ongeluk
  // worden meegebundeld. Edge laat process.env.NEXT_RUNTIME = 'edge'.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentry } = await import("@/lib/observability/sentry");
    await initSentry();
  }
}
