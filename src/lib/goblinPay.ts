/**
 * GoblinPay REST client.
 *
 * GoblinPay is a self-hostable, receive-only Grin payment server: donors pay
 * with a Grin wallet (Goblin) by scanning a Nostr `nprofile` QR, and the
 * payment travels as a gift-wrapped slatepack over Nostr. Eranos talks to a
 * GoblinPay instance over its plain REST surface:
 *
 *   POST /invoice                 (Bearer GP_API_TOKEN) create an invoice
 *   GET  /invoice/{id}            (Bearer) invoice checkout info
 *   GET  /pay/{token}/status      (public-by-token) live invoice status
 *   POST /pay/{token}/slatepack   (public-by-token) manual S1 -> S2 fallback
 *   GET  /payment/{id}            (public-by-token) payment status
 *   GET  /payment/{id}/receipt    (public-by-token) server-signed receipt
 *
 * The instance URL and (optional) API token come from the app config
 * (`goblinPayUrl` / `goblinPayApiToken`, see `AppConfig`). All functions
 * accept an injectable `fetch` for tests.
 */

/** Nanogrin per whole GRIN (Grin's base unit, like sats to BTC). */
export const NANOGRIN_PER_GRIN = 1_000_000_000;

/** Checkout info returned by `POST /invoice` and `GET /invoice/{id}`. */
export interface GoblinPayCheckout {
  /** Invoice id (also usable with `GET /invoice/{id}`). */
  invoiceId: string;
  /** Unguessable bearer token for the public `/pay/<token>` surface. */
  token: string;
  /** Hosted checkout page URL (`{public_url}/pay/{token}`). */
  payUrl: string;
  /** Receiving Nostr identity for this invoice (x-only hex). */
  recipientPubkey: string;
  /** Same identity as npub. */
  npub: string;
  /** Same identity as nprofile (includes the server's relay hints) — this is what a Goblin wallet scans. */
  nprofile: string;
  /** Human amount string as the server displays it (e.g. `"2.5 GRIN"`). */
  amount: string;
  /** Invoice status: `open`, `paid`, or `expired`. */
  status: string;
  orderRef?: string;
  memo?: string;
}

/** Live status from `GET /pay/{token}/status`. */
export interface GoblinPayInvoiceStatus {
  invoiceId: string;
  /** `open`, `paid`, or `expired`. */
  status: string;
  /** Expected amount in nanogrin, when the invoice is exact-amount. */
  expectedAmount: number | null;
  /** The payment id (Grin slate UUID) that paid this invoice, once paid. */
  paidPaymentId: string | null;
}

/** Payment status from `GET /payment/{id}`. */
export interface GoblinPayPayment {
  paymentId: string;
  /** Amount in nanogrin. */
  amount: number;
  payer: string | null;
  /** `received`, `replied`, or `confirmed`. */
  status: string;
  confirmedHeight: number | null;
  confirmedAt: string | null;
  createdAt: string;
}

/** Parameters for creating an invoice. */
export interface CreateInvoiceParams {
  /** Exact amount in nanogrin. */
  amountNanogrin: number;
  /** Order reference used for matching (Eranos uses the campaign `a` coordinate). */
  orderRef?: string;
  /** Free-form memo shown on the checkout page. */
  memo?: string;
  /** Expiry in seconds from now. */
  expirySecs?: number;
}

export class GoblinPayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoblinPayError';
    this.status = status;
  }
}

type FetchLike = typeof fetch;

/** Strip a trailing slash so path joins are predictable. */
function base(url: string): string {
  return url.replace(/\/+$/, '');
}

async function jsonOrThrow(res: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && typeof (body as Record<string, unknown>).error === 'string'
        ? String((body as Record<string, unknown>).error)
        : `GoblinPay request failed (${res.status})`;
    throw new GoblinPayError(msg, res.status);
  }
  if (!body || typeof body !== 'object') {
    throw new GoblinPayError('GoblinPay returned a non-JSON response', res.status);
  }
  return body as Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function checkoutFromJson(json: Record<string, unknown>): GoblinPayCheckout {
  return {
    invoiceId: str(json.invoice_id),
    token: str(json.token),
    payUrl: str(json.pay_url),
    recipientPubkey: str(json.recipient_pubkey),
    npub: str(json.npub),
    nprofile: str(json.nprofile),
    amount: str(json.amount),
    status: str(json.status),
    orderRef: optStr(json.order_ref),
    memo: optStr(json.memo),
  };
}

/**
 * Create an invoice (`POST /invoice`). Requires the instance API token —
 * this is the connector surface, gated by `GP_API_TOKEN` server-side.
 */
export async function createGoblinPayInvoice(
  serverUrl: string,
  apiToken: string,
  params: CreateInvoiceParams,
  fetchFn: FetchLike = fetch,
): Promise<GoblinPayCheckout> {
  const res = await fetchFn(`${base(serverUrl)}/invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      amount_grin: params.amountNanogrin,
      order_ref: params.orderRef,
      memo: params.memo,
      expiry_secs: params.expirySecs,
    }),
  });
  return checkoutFromJson(await jsonOrThrow(res));
}

/** Poll an invoice's live status (`GET /pay/{token}/status`, public-by-token). */
export async function getGoblinPayInvoiceStatus(
  serverUrl: string,
  token: string,
  fetchFn: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<GoblinPayInvoiceStatus> {
  const res = await fetchFn(`${base(serverUrl)}/pay/${encodeURIComponent(token)}/status`, { signal });
  const json = await jsonOrThrow(res);
  return {
    invoiceId: str(json.invoice_id),
    status: str(json.status),
    expectedAmount: typeof json.expected_amount === 'number' ? json.expected_amount : null,
    paidPaymentId: optStr(json.paid_payment_id) ?? null,
  };
}

/** Payment status (`GET /payment/{id}`, public-by-token). */
export async function getGoblinPayPayment(
  serverUrl: string,
  paymentId: string,
  fetchFn: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<GoblinPayPayment> {
  const res = await fetchFn(`${base(serverUrl)}/payment/${encodeURIComponent(paymentId)}`, { signal });
  const json = await jsonOrThrow(res);
  return {
    paymentId: str(json.payment_id),
    amount: typeof json.amount === 'number' ? json.amount : 0,
    payer: optStr(json.payer) ?? null,
    status: str(json.status),
    confirmedHeight: typeof json.confirmed_height === 'number' ? json.confirmed_height : null,
    confirmedAt: optStr(json.confirmed_at) ?? null,
    createdAt: str(json.created_at),
  };
}

/**
 * Fetch the server-signed receipt (`GET /payment/{id}/receipt`).
 *
 * Returns the RAW response text alongside the parsed object: the raw text is
 * what gets embedded verbatim in a published Grin-donation event so the
 * BIP-340 signature stays verifiable byte-for-byte (see `lib/grinProof.ts`).
 */
export async function getGoblinPayReceipt(
  serverUrl: string,
  paymentId: string,
  fetchFn: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<{ raw: string; parsed: unknown }> {
  const res = await fetchFn(
    `${base(serverUrl)}/payment/${encodeURIComponent(paymentId)}/receipt`,
    { signal },
  );
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GoblinPayError('GoblinPay receipt is not valid JSON', res.status);
  }
  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).error === 'string'
        ? String((parsed as Record<string, unknown>).error)
        : `GoblinPay receipt request failed (${res.status})`;
    throw new GoblinPayError(msg, res.status);
  }
  return { raw, parsed };
}

/**
 * Manual slatepack fallback: POST a pasted S1 slatepack to
 * `/pay/{token}/slatepack` and extract the S2 response armor from the
 * server-rendered result page.
 *
 * The endpoint is zero-JS server-side (it renders HTML, not JSON), but
 * slatepack armor is a self-delimiting ASCII format
 * (`BEGINSLATEPACK. … ENDSLATEPACK.`) whose alphabet never collides with
 * HTML escaping, so extracting it from the page is lossless.
 */
export async function submitManualSlatepack(
  serverUrl: string,
  token: string,
  s1Armor: string,
  fetchFn: FetchLike = fetch,
): Promise<string> {
  const res = await fetchFn(`${base(serverUrl)}/pay/${encodeURIComponent(token)}/slatepack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ slatepack: s1Armor.trim() }).toString(),
  });
  const html = await res.text();
  if (!res.ok) {
    throw new GoblinPayError(`Manual receive failed (${res.status})`, res.status);
  }
  const s2 = extractSlatepackArmor(html);
  if (!s2) {
    throw new GoblinPayError(
      'GoblinPay did not return a response slatepack — the pasted slatepack may be invalid.',
      res.status,
    );
  }
  return s2;
}

/** Extract the first slatepack armor block from arbitrary text (e.g. an HTML page). */
export function extractSlatepackArmor(text: string): string | null {
  const match = text.match(/BEGINSLATEPACK\.[\s\S]*?ENDSLATEPACK\./);
  return match ? match[0].trim() : null;
}

/**
 * Parse a user-entered GRIN amount (e.g. `"2.5"`) into nanogrin.
 * Returns `null` for anything that is not a positive amount with at most
 * nine decimal places.
 */
export function parseGrinAmount(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const nano = Number(whole) * NANOGRIN_PER_GRIN + Number(frac.padEnd(9, '0'));
  if (!Number.isSafeInteger(nano) || nano <= 0) return null;
  return nano;
}

/** Format a nanogrin amount as a human GRIN string (trailing zeros trimmed). */
export function formatGrin(nanogrin: number | bigint): string {
  const nano = typeof nanogrin === 'bigint' ? nanogrin : BigInt(Math.trunc(nanogrin));
  const whole = nano / BigInt(NANOGRIN_PER_GRIN);
  const frac = (nano % BigInt(NANOGRIN_PER_GRIN)).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
