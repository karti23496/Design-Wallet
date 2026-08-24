// Service-role Supabase client — bypasses RLS. NEVER expose this key client-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// High-entropy, opaque, single-use setup token. Stored on the payments row and
// invalidated on use (set null) — gives single-use + short-lived guarantees.
export function newSetupToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Minutes until a setup token expires (PRD NFR: 30–60 min).
export const TOKEN_TTL_MINUTES = 60;

export function tokenExpiry(): string {
  return new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
}
