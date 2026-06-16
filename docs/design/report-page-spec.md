# BudLog — Public report page design spec (`/r/[token]`)

The page a construction client opens from a shared link (no login). Goal: look like a
contractor's **official report** — trustworthy, clean, professional. Mobile-first (clients
open it on a phone), works on desktop. Languages: PL (default) / RU / UA / EN.

## Direction
Swiss-style **minimalism**: grid-based, generous white space, high contrast, sharp (not
rounded-playful) cards, clear type hierarchy. No gradients, no emoji icons (SVG line icons),
no decorative noise. The content (work + materials + photos) is the hero.

## Palette
| Role | Hex | Use |
|---|---|---|
| Primary (ink) | `#0F172A` | headers, site name, strong text |
| Secondary | `#334155` | labels, secondary text |
| CTA | `#0369A1` | "Download PDF" button, links |
| Background | `#F8FAFC` | page background |
| Surface | `#FFFFFF` | cards |
| Text | `#020617` | body |
| Muted | `#475569` | meta (dates, captions) — min contrast kept ≥4.5:1 |
| Hairline | `#E2E8F0` | borders, dividers |
| Accent dot — work | `#0369A1` | timeline marker |
| Accent dot — material | `#0D9488` (teal) | timeline marker |
| Accent dot — photo | `#64748B` (slate) | timeline marker |

## Typography
- **Headings:** EB Garamond (serif) — gives the "formal document / акт" feel. Has Cyrillic.
- **Body / UI:** Lato (sans) — clean, full Cyrillic + Polish diacritics.
- Sizes: site name 28/32, date headers 18 (EB Garamond 600); body 16 (min on mobile),
  meta 13–14. Line-height 1.5–1.6. Line length capped (`max-w-2xl` content column).

## Layout

### Mobile (primary, ~375px)
```
┌─────────────────────────────┐
│  BudLog · report            │  ← slim top bar (wordmark, muted)
├─────────────────────────────┤
│  Dom Kowalski               │  ← EB Garamond 28, ink
│  Client: Jan Kowalski       │  ← Lato 14, secondary
│  ul. Polna 3 · Jun 10–16    │  ← muted meta (address · date range)
│  [ ⬇ Download PDF ]         │  ← full-width CTA button (blue), 48px tall
├─────────────────────────────┤
│  ● Mon, 16 June             │  ← sticky-ish date header (EB Garamond 18)
│  │                          │
│  ●  Work                    │  ← left timeline rail + colored dot
│  │  Poured the foundation   │
│  │                          │
│  ●  Materials               │
│  │  Cement — 40 bags        │
│  │  Sand — 2 m³             │
│  │                          │
│  ●  Photo                   │
│  │  "rebar, 2nd floor"      │
│  │  ┌────────┐ ┌────────┐   │  ← 2-col photo grid (tap → lightbox)
│  │  │  img   │ │  img   │   │
│  │  └────────┘ └────────┘   │
├─────────────────────────────┤
│  Logged with BudLog         │  ← subtle footer, wordmark links to budlog
└─────────────────────────────┘
```

### Desktop (≥768px)
- Centered single column, `max-w-2xl` (report reads like a document, not a dashboard).
- Date headers become left-aligned section dividers with a hairline rule.
- Photo grid goes 3–4 columns. Timeline rail stays on the left.
- Generous top/bottom padding; page never full-bleed — feels like paper on a desk.

## Components
1. **TopBar** — wordmark "BudLog" + "report" muted; language switcher (PL/RU/UA/EN) top-right (auto-detect from `Accept-Language`, overridable).
2. **ReportHeader** — site name (h1), client, address, date range, PDF button.
3. **PdfButton** — CTA blue, SVG download icon, `cursor-pointer`, hover darkens (200ms), 44px+ touch target. Links to `…/pdf?lang=`.
4. **DateGroup** — date header + vertical timeline rail.
5. **TimelineEntry** — colored dot (by kind) + label + content. Work = sentence; Materials = name — qty unit list; Photo = caption + grid.
6. **PhotoGrid** — responsive grid of `<Image>` (lazy, alt = caption or "Site photo"), tap/click → **Lightbox** (full-screen, swipe/arrow, Esc to close, focus-trapped).
7. **Footer** — "Logged with BudLog" → links to product (viral loop).
8. **States** — loading skeleton (reserve space, no jump); empty ("No entries yet"); 404/expired ("This report link is no longer available").

## Accessibility & polish
- Contrast ≥4.5:1 everywhere; focus rings on PDF button, language switcher, photos, lightbox controls.
- Lightbox: keyboard (←/→/Esc), `aria-modal`, focus trap, `prefers-reduced-motion` respected.
- `next/image` with `srcset`/lazy; alt text from caption.
- Touch targets ≥44px; `cursor-pointer` on all interactive elements.
- Responsive checks at 375 / 768 / 1024 / 1440.

## Out of scope (later)
- Print stylesheet (PDF already covers the print use case).
- Auth / editing (page is strictly read-only).
