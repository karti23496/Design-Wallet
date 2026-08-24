// ============================================================================
// Lemon Squeezy webhook helpers.
// - verifySignature: HMAC-SHA256 of the RAW request body, compared in constant
//   time to the `X-Signature` header (hex). Requires LEMONSQUEEZY_WEBHOOK_SECRET.
// - parseEvent: pulls the fields we care about out of the LS payload shape.
// Docs: https://docs.lemonsqueezy.com/help/webhooks
// ============================================================================

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

// Constant-time comparison to avoid timing leaks on the signature.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expected = new Uint8Array(macBuf);
  const provided = hexToBytes(signatureHeader);
  return timingSafeEqual(expected, provided);
}

export interface LsEvent {
  eventName: string;              // e.g. "subscription_created"
  resourceType: string;          // "subscriptions" | "orders"
  subscriptionId: string | null; // LS subscription id
  orderId: string | null;        // LS order id (idempotency key for first payment)
  customerId: string | null;
  email: string;                 // lowercased
  status: string | null;         // LS status: active | past_due | cancelled | expired | ...
  renewsAt: string | null;       // ISO — the next billing date
  endsAt: string | null;         // ISO — access-until date once cancelled
  customerPortalUrl: string | null;
}

// Normalises both `orders` and `subscriptions` payloads.
export function parseEvent(body: any): LsEvent {
  const eventName = body?.meta?.event_name ?? "";
  const data = body?.data ?? {};
  const resourceType = data?.type ?? "";
  const attr = data?.attributes ?? {};
  const email = String(
    attr?.user_email ?? attr?.customer_email ?? attr?.email ?? "",
  ).toLowerCase().trim();

  const isSubscription = resourceType === "subscriptions";

  return {
    eventName,
    resourceType,
    subscriptionId: isSubscription
      ? String(data?.id ?? "")
      : (attr?.subscription_id != null ? String(attr.subscription_id) : null),
    orderId: attr?.order_id != null
      ? String(attr.order_id)
      : (resourceType === "orders" ? String(data?.id ?? "") : null),
    customerId: attr?.customer_id != null ? String(attr.customer_id) : null,
    email,
    status: attr?.status ?? null,
    renewsAt: attr?.renews_at ?? null,
    endsAt: attr?.ends_at ?? null,
    customerPortalUrl: attr?.urls?.customer_portal ?? null,
  };
}
