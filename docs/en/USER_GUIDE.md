# BudLog — User guide

How to use BudLog as a **foreman** (Telegram bot), a **client** (web report), and an
**admin** (panel). Use this to verify every feature end-to-end.

> Russian version: [../ru/USER_GUIDE.md](../ru/USER_GUIDE.md) · Technical: [TECHNICAL.md](TECHNICAL.md)

The bot replies in the user's language (PL/RU/UA/EN/DE/ES/FR/BE/NL). Examples below use Russian.

---

## What BudLog is

BudLog is a **voice-first construction site journal**. Instead of filling in forms or
spreadsheets, a foreman just **speaks into Telegram** at the end of the day — "poured the
foundation, used 40 bags of cement, electrician comes tomorrow" — and BudLog turns it into a
clean, dated record of **work done, materials used, and site photos**. The crew's client can
then open a single link and see exactly what happened on site, day by day, and download a PDF
report — without installing anything or logging in.

It solves three everyday problems for small crews:
- **The diary never gets written.** Logging by voice (or a quick photo) takes seconds, so it
  actually happens — no paperwork, no app to learn.
- **Disputes with the client.** A dated, photo-backed journal + PDF "акт" is hard to argue with.
- **No visibility for the client.** They get a live, read-only report link instead of phone calls.

Everything is **multi-language** (the bot answers in the speaker's language) and works from a
phone in the field — the only tools needed are Telegram and a browser.

## Who it's for

| Role | Who | What they do |
|---|---|---|
| **Foreman / brigade lead** | The person on site | Speaks/sends photos into the Telegram bot to log work, materials, and plans. The primary user. |
| **Construction company / contractor** | The crew or small firm | Owns the account and its sites; manages who can log (foreman = editor, others = viewer). |
| **Client / property owner** | The customer paying for the work | Opens the shared report link — read-only journal + photos + PDF. No account, no app. |
| **Admin / support** | The operator running BudLog | Uses the admin panel for support lookups (users, companies, sites). |

**Best fit:** small construction crews and private contractors (renovations, houses, finishing
work) who need a no-friction site log and a credible report for the client — especially crews
working across PL / RU / UA. **Not** an estimating, accounting, or project-management tool — it
does one thing well: the daily site journal and the client-facing report.

---

## A. Foreman — the Telegram bot

### 1. Link your account
The bot is **@BudlogBot** (or your own bot from @BotFather).
1. Get a one-time link code. In dev, mint one via the API:
   ```bash
   TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"alice@test.com","password":"TestPass123"}' | grep -o '"accessToken":"[^"]*"' | sed 's/.*:"//;s/"//')
   ACC=$(curl -s localhost:3000/api/v1/accounts -H "Authorization: Bearer $TOKEN" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"//;s/"//')
   curl -s -X POST localhost:3000/api/v1/users/me/telegram-link-code -H "Authorization: Bearer $TOKEN" -H "X-Account-Id: $ACC"
   ```
2. In Telegram: `/start`, then `/link <CODE>` → "Account linked".

### 2. Create a site
```
/newsite Dom Kowalski
```
→ "🏗 Site created and set active". The active site is where new entries go.

### 3. Log work by voice (the core feature)
Send a **voice note**: *"залили фундамент, ушло 40 мешков цемента, завтра электрик"*.
The bot transcribes it, understands it, and shows a **confirm card**:
```
Please confirm:
📍 Dom Kowalski
🔨 Work: залили фундамент
📦 Materials: цемент ×40 bags
📅 Plan: электрик
[ ✅ Confirm ]  [ ❌ Cancel ]
```
Tap **✅** → "Saved to Dom Kowalski". Nothing is stored until you confirm.

You can also just **type** the same sentence — it works identically.

### 4. Attach a photo
Send a **photo** with a caption (e.g. "армирование 2 этаж"). The bot stores it against the
active site → "📷 Photo saved". If the caption mentions work/materials, it also offers to log them.

### 5. Review & manage
| Command | Does |
|---|---|
| `/today` | today's journal for the active site (work + materials + photos) |
| `/site` | list sites, switch the active one (buttons) |
| `/newsite <name>` | create a site |
| `/report` | get a public report link to send the client (+ PDF link) |
| `/account` | switch company/account |
| `/help` | full command list |

---

## B. Client — the web report

The foreman runs `/report` and sends you a link like `https://budlog.pl/r/<token>`
(in dev: `http://localhost:3001/r/<token>`). No login needed.

You see a clean, dated journal:
- Site name, your name, address, date range.
- Each day: **Work** done, **Materials** used (name × quantity), **Photos** (tap to enlarge — arrows / Esc).
- **Download PDF** button → a printable report ("акт").
- Language switcher PL/RU/UA/EN (top-right).

The link can be revoked by the foreman at any time (then it shows "Report unavailable").

---

## C. Admin — the support panel

At `https://budlog.pl/admin` (dev: `http://localhost:3001/admin`).
1. Sign in with an email listed in `ADMIN_EMAILS` (dev: `alice@test.com` / `TestPass123`).
2. The dashboard shows **stat cards** (users, accounts, sites, work entries, materials, photos, report links)
   and three tabs: **Users**, **Accounts**, **Sites** (with per-site work/material/photo counts).

Read-only — for support lookups, not editing.

---

## Verification checklist

- [ ] `/start` + `/link <code>` → linked
- [ ] `/newsite Dom Kowalski` → site created & active
- [ ] Voice "залили фундамент, 40 мешков цемента, завтра электрик" → confirm card → ✅ → saved
- [ ] Typed message → same confirm flow
- [ ] Photo with caption → "Photo saved"
- [ ] `/today` → shows the above chronologically
- [ ] `/site` → switch active site
- [ ] `/report` → open link → web report renders → **Download PDF** works → switch language
- [ ] `/admin` → sign in → dashboard stats + tables load
- [ ] A second account's foreman cannot see the first account's sites (data isolation)
