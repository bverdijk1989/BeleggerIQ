/**
 * Request-id helper.
 *
 * Eén ID per inkomende HTTP-request, gepropageerd via `X-Request-ID`.
 * Doel: log-correlatie. Een kapotte order-flow heeft typisch logs in
 * middleware (rate-limit), route-handler, repository en provider — een
 * shared request-id maakt het mogelijk die met één grep terug te vinden.
 *
 * Conventie:
 *   - Inkomende `X-Request-ID` header → behouden (caller geeft 'em mee
 *     bij retry of tracing-tooling die zelf IDs genereert).
 *   - Geen header → genereer `req_<32-hex>` (16 random bytes hex).
 *   - We schrijven 'm áltijd terug op de response zodat de client 'em
 *     in dev-tools / errors kan tonen.
 *
 * Geen dependency op `node:crypto` — runtime-agnostic via Web Crypto.
 */

const HEX = "0123456789abcdef";

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  // `globalThis.crypto` bestaat in Edge, Node ≥18 én jsdom.
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(arr);
  } else {
    // Fallback — alleen voor tests die geen crypto exposing hebben.
    // Niet cryptografisch maar wel uniek-genoeg-voor-correlatie.
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i] ?? 0;
    out += HEX[b >> 4];
    out += HEX[b & 0x0f];
  }
  return out;
}

const REQUEST_ID_HEADER = "x-request-id";
const ID_PREFIX = "req_";
const ID_BYTES = 16;
// Bovengrens om accidental upstream-DoS te voorkomen (header-stuffing).
const MAX_INCOMING_LENGTH = 128;
const SAFE_PATTERN = /^[A-Za-z0-9._-]+$/;

export function getOrCreateRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (
    incoming &&
    incoming.length > 0 &&
    incoming.length <= MAX_INCOMING_LENGTH &&
    SAFE_PATTERN.test(incoming)
  ) {
    return incoming;
  }
  return `${ID_PREFIX}${randomHex(ID_BYTES)}`;
}

export const REQUEST_ID_HEADER_NAME = "X-Request-ID";
