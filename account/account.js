// ============================================================================
// Account-status page (PRD §4.3, §5.7)
//   - Requires login; unauthenticated visitors go to the login screen.
//   - active     → renews date, "Manage subscription" (Customer Portal),
//                  "Open the collection".
//   - suspended  → reason-tailored notice + a single resolve CTA. This is the
//                  ONLY page a suspended user can see — no collection, no search,
//                  no preview.
//   - Change password + log out are available in every logged-in state.
// ============================================================================

import { supabase, getAccessState, signOut } from "/auth/supabase-client.js";

const cfg = window.DW_CONFIG || {};

const el = (sel) => document.querySelector(sel);
const card = el("[data-dash-card]");
const loading = el("[data-dash-loading]");
const emailEl = el("[data-dash-email]");
const statusEl = el("[data-dash-status]");
const renewsRow = el("[data-dash-renews-row]");
const renewsLabel = el("[data-dash-renews-label]");
const renewsEl = el("[data-dash-renews]");
const activeEl = el("[data-dash-active]");
const portalLink = el("[data-dash-portal]");
const suspendedEl = el("[data-dash-suspended]");
const suspendedCopy = el("[data-dash-suspended-copy]");
const suspendedCta = el("[data-dash-suspended-cta]");
const logoutBtn = el("[data-dash-logout]");
const pwForm = el("[data-dash-pw-form]");
const pwInput = el("[data-dash-pw]");
const pwError = el("[data-dash-pw-error]");

function fmtDate(iso) {
    if (!iso) return "—";
    try {
        return new Date(iso).toLocaleDateString("en-IN", {
            day: "numeric", month: "long", year: "numeric"
        });
    } catch { return "—"; }
}

function renderActive(state) {
    statusEl.textContent = "Active";
    statusEl.dataset.state = "active";
    renewsLabel.textContent = "Renews";
    renewsEl.textContent = fmtDate(state.renewsAt);
    renewsRow.hidden = false;
    portalLink.href = state.portalUrl || cfg.LS_PORTAL_HELP_URL || "#";
    activeEl.hidden = false;
}

function renderSuspended(state) {
    statusEl.textContent = "Suspended";
    statusEl.dataset.state = "suspended";
    renewsRow.hidden = true;

    const portal = state.portalUrl || cfg.LS_CHECKOUT_URL;
    if (state.suspendedReason === "cancelled_and_expired") {
        suspendedCopy.textContent =
            "Your Design Wallet subscription has ended. Resubscribe anytime to get back in — it's a monthly subscription (₹1,499/month) that renews monthly, and you can cancel whenever you like.";
        suspendedCta.textContent = "Resubscribe";
        suspendedCta.href = cfg.LS_CHECKOUT_URL || "/pricing/";
    } else if (state.suspendedReason === "payment_failed") {
        suspendedCopy.textContent =
            "We couldn't process your renewal payment, and your account has been suspended. Update your payment details to restore access — once payment goes through, your access is restored automatically.";
        suspendedCta.textContent = "Update payment details";
        suspendedCta.href = portal;
    } else {
        suspendedCopy.textContent =
            "Your access is currently on hold. Resubscribe to restore your collection.";
        suspendedCta.textContent = "See pricing";
        suspendedCta.href = cfg.ROUTE_PRICING || "/pricing/";
    }
    suspendedEl.hidden = false;
}

async function init() {
    const state = await getAccessState();

    if (!state.session) {
        // Not signed in → funnel to Pricing (payment before login). Returning
        // subscribers reach the login form via Pricing's "Already subscribed?" link.
        window.location.replace(cfg.ROUTE_PRICING);
        return;
    }

    emailEl.textContent = state.email || state.user.email || "—";

    if (state.status === "active") {
        renderActive(state);
    } else if (state.status === "suspended") {
        renderSuspended(state);
    } else {
        // signup_incomplete / unknown while logged in — shouldn't happen; send
        // them to the pricing page (fail closed).
        window.location.replace(cfg.ROUTE_PRICING);
        return;
    }

    loading.hidden = true;
    card.hidden = false;
}

logoutBtn.addEventListener("click", () => signOut());

pwForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    pwError.hidden = true;
    pwError.style.color = "";
    const next = pwInput.value || "";
    if (next.length < 8) {
        pwError.textContent = "Use at least 8 characters.";
        pwError.hidden = false;
        return;
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) {
        pwError.textContent = error.message || "Couldn't update password.";
        pwError.hidden = false;
        return;
    }
    pwInput.value = "";
    pwError.textContent = "Password updated.";
    pwError.style.color = "#7bd88f";
    pwError.hidden = false;
});

init().catch((err) => {
    console.error("[account] init failed:", err);
    loading.querySelector(".dash-loading").textContent =
        "Account isn't available right now. Please try again shortly.";
});
