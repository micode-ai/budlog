# BudLog Phase 4 — Billing + WhatsApp channel

**Status:** ⬜ Not started. Prerequisite: Phase 3 (a product worth paying for).

**Goal:** Charge for the product (per-company subscription) and add a second messaging channel
(WhatsApp) so crews that live in WhatsApp can use BudLog too.

**Architecture:** Reintroduce ABA's `subscriptions` (Stripe) module, re-scoped from per-user AI
tiers to a simple **per-company plan** with a site/seat limit. Reintroduce ABA's `whatsapp`
module (Meta Cloud API), pointed at the same `SitesService` + `AiModule` as Telegram.

**Reuse map:** ABA `apps/api/src/modules/subscriptions/*` (Stripe checkout, webhooks, tier
gating); ABA `apps/api/src/modules/whatsapp/*` (webhook, HMAC verify, Redis state, i18n).

---

## Part A — Billing

## Task A1: Plan model + Stripe wiring
- [ ] Schema: `Subscription { id, accountId @unique, plan('free'|'pro'), status, stripeCustomerId?, stripeSubscriptionId?, currentPeriodEnd?, siteLimit Int }`. Migrate.
- [ ] Re-add `stripe` dep. Port ABA subscriptions service: checkout session, customer portal, webhook handler (`POST /webhooks/stripe`, excluded from prefix, rawBody verify already in `main.ts`).
- [ ] Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs (PLN first).

## Task A2: Plan limits + gating
- [ ] Free plan: 1 active site, watermark on PDF. Pro (~99 zł/mo): unlimited sites, no watermark, priority.
- [ ] Guard: creating a site beyond `siteLimit` → 402 with upgrade message (mirror ABA `AccountLimitGuard`).
- [ ] Bot: `/upgrade` command → returns a Stripe checkout link for the account.
- [ ] Tests: limit enforcement, webhook status transitions (active/past_due/canceled).

## Part B — WhatsApp

## Task B1: WhatsApp module
- [ ] Port ABA `whatsapp` module: `POST /whatsapp/webhook` (excluded from prefix), HMAC-SHA256 verify over rawBody, Redis state keys (`wa:msg`, `wa:pa`, etc.), interactive buttons/lists.
- [ ] Repoint handlers at `SitesService` + `AiModule` (voice/photo/text → same flow as Telegram).
- [ ] Linking: 6-hex code via `wa.me` deep link; endpoints on `UsersController` (`POST/GET/DELETE /users/me/whatsapp-link[-code]`) — these were removed in Phase 1, re-add.
- [ ] Schema: `WhatsAppLink` + `WhatsAppLinkCode` (port from ABA). Migrate.
- [ ] Env: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_PHONE_NUMBER`, `WHATSAPP_API_VERSION`.

## Task B2: Parity check
- [ ] Same scenarios as Phase 2 Task 5 but over WhatsApp (voice, photo, `/today` equivalent, confirm buttons).
- [ ] i18n parity (9 langs) for WhatsApp message templates.

---

## Done / Left tracker
- ⬜ A1 — Subscription model + Stripe wiring
- ⬜ A2 — plan limits + `/upgrade`
- ⬜ B1 — WhatsApp module + linking + schema
- ⬜ B2 — channel parity + i18n

**Exit criteria:** a company can subscribe via Stripe (PLN), free plan is limited to 1 site,
and the full capture flow works over WhatsApp as well as Telegram.
