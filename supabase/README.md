# Design Wallet — Annual Subscription Access backend

Everything needed to stand up the gated **annual subscription** (₹2,999/year)
described in `Design_Wallet_PRD_v4_Finalized.pdf`. The static site stays on
GitHub Pages; this backend runs on **Supabase** (Postgres + Auth + Edge
Functions) with **Lemon Squeezy** for the subscription + hosted checkout.

> ⚠️ These files are additive and safe to ship: the client gate is **dormant
> until Supabase is configured** (`auth/config.js` still has placeholder keys),
> and the catalog is not gated until the cutover step below. Do the cutover only
> after the backend is live and tested.

---

## Access model (PRD §5.1)

| State | Can log in? | Can access collection? |
|---|---|---|
| No account | No | No — must subscribe via Lemon Squeezy first |
| `active` | Yes | Yes — until `subscription_renews_at` |
| `suspended` | Yes, to the account-status page only | No |
| `signup_incomplete` (paid, no password) | No — routed into setup | N/A |

`suspended_reason` is `payment_failed` or `cancelled_and_expired` and tailors
the account-page + email copy. **No grace period:** a failed renewal or a
post-cancellation expiry suspends immediately (via webhook).

---

## Files

```
supabase/
  schema.sql                          ← run first; profiles + payments + RLS + triggers
  functions/
    _shared/{cors,supabaseAdmin,email,lemonsqueezy}.ts
    lemon-webhook/index.ts            ← payment / renewal / failure / cancel / expiry (idempotent)
    complete-account-setup/index.ts   ← setup token → create user + activate (FR-9/10)
    resend-setup-link/index.ts        ← "Already paid?" recovery (FR-19)
    check-email-status/index.ts       ← smart login recognition (FR-18)
    send-reminders/index.ts           ← 24h signup-incomplete follow-up (FR-17)
    send-renewal-reminders/index.ts   ← 7-day pre-renewal reminder (FR-15)
    reconcile-subscriptions/index.ts  ← daily safety net vs Lemon Squeezy (NFR)
```

Front-end (repo root):
`auth/config.js` (fill in keys), `auth/supabase-client.js`, `auth/gate.js`,
`pricing/*` (subscriber Pricing page), `account/login/*`, `account/*`.

---

## Setup

### 1. Database
Run `supabase/schema.sql` in the Supabase SQL editor (or `supabase db push`).

### 2. Environment (Edge Function secrets)
```
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   # Project Settings → API
LEMONSQUEEZY_WEBHOOK_SECRET                # the webhook's signing secret
LEMONSQUEEZY_API_KEY                       # read scope, for reconcile-subscriptions
LS_CHECKOUT_URL                            # hosted checkout (also in auth/config.js)
RESEND_API_KEY, EMAIL_FROM                 # transactional email
SITE_URL=https://designwallet.in
ALLOWED_ORIGIN=https://designwallet.in
```
Set via `supabase secrets set KEY=value`.

### 3. Deploy functions
```
supabase functions deploy complete-account-setup
supabase functions deploy resend-setup-link
supabase functions deploy check-email-status
supabase functions deploy lemon-webhook          --no-verify-jwt   # LS calls directly
supabase functions deploy send-reminders          --no-verify-jwt   # cron
supabase functions deploy send-renewal-reminders  --no-verify-jwt   # cron
supabase functions deploy reconcile-subscriptions --no-verify-jwt   # cron
```

### 4. Lemon Squeezy
- The ₹2,999/year subscription product + hosted checkout link already exist
  (see `auth/config.js` → `LS_CHECKOUT_URL`).
- Set the product's **Redirect after purchase** URL to
  `https://designwallet.in/account/login/?paid=1`. The authoritative setup link
  is emailed by the webhook, so the redirect only needs to land on login.
- Add a **webhook** → `https://<ref>.functions.supabase.co/lemon-webhook` with
  events: `subscription_created`, `subscription_payment_success`,
  `subscription_payment_failed`, `subscription_cancelled`, `subscription_expired`
  (+ `subscription_updated`/`_resumed` optionally). Copy the signing secret into
  `LEMONSQUEEZY_WEBHOOK_SECRET`.
- ⚠️ **Verify webhook reliability before launch** (PRD §6.2 residual risk): the
  zero-grace-period model depends on `payment_failed` / `expired` arriving
  promptly. The daily `reconcile-subscriptions` job is the safety net.
- Configure a **7-day refund window** in Lemon Squeezy settings.

### 5. Front-end keys
Fill in `auth/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. The anon key is
safe to ship — RLS + the service-role-only writes enforce access. The moment
`SUPABASE_URL` is a real project (not the `YOUR-PROJECT-ref` placeholder),
`auth/gate.js` goes live on the collection pages.

### 6. Cron (Supabase Dashboard → Edge Functions → Schedules, or pg_cron)
- `send-reminders` — hourly (24h signup-incomplete follow-up).
- `send-renewal-reminders` — daily (7-day pre-renewal reminder; idempotent per cycle).
- `reconcile-subscriptions` — daily (drift correction vs Lemon Squeezy).

---

## Cutover checklist (already applied in this branch)

These edits flip the live site from open to gated; they were made in this
branch and go live once real Supabase keys are set (step 5):

1. **Nav link (FR-3):** `GET ACCESS` → `/pricing/` in `header.js`.
2. **Hero CTA (FR-4):** `index.html` "Explore collections" → `/pricing/`.
3. **Pricing page (FR-6):** subscriber annual-subscription page at `/pricing/`
   (the old seller "List your Tool" page moved to `/list-your-tool/`).
4. **UI gate (FR-2/13):** `auth/gate.js` on `tools/index.html` + `404.html`
   redirects non-active visitors (suspended → `/account/`, else → `/pricing/`).
   Category-cloud / footer / ⌘K links still point at `/category/*` and are gated
   at the destination, so active subscribers navigate normally.

---

## ⚠️ Deferred: real (server-side) gate

**Per product decision, launch uses a UI-only gate.** The catalog still loads
client-side from the public Google Sheet (`tools/tools.js`, `script.js`), so it
remains directly fetchable and is **not cryptographically protected** — the gate
is a redirect, not enforcement. Before treating this as a true paywall:

1. Migrate the catalog into a Supabase `catalog` table behind RLS
   (`scripts/sync-catalog.js` already imports the Sheet). Editing moves to a
   sync-from-Sheet workflow.
2. Replace the `gviz` fetches in `tools/tools.js` / `script.js` with an
   authenticated Supabase query gated by `subscription_status = 'active'`.
3. Remove the public Sheet fetch from gated views (verify in the Network tab).
