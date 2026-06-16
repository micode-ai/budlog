# BDL-1 — AI design generation feasibility (Planner 5D + floor-plan → schema)

Research spike for the collaboration expansion: a client submits a plan + requirements,
and a foreman/designer can trigger an AI "design action" — e.g. **floor-plan → house schema**
and **requirements → 5D design**. This doc answers what's actually possible and recommends a
provider-agnostic integration so the collaboration work isn't blocked on any one vendor.

## 1. Planner 5D — enterprise-only API

Planner 5D **does** have an API, but it is **B2B / enterprise, not self-serve**:
- Access requires contacting their sales team; docs are "shared during onboarding with
  qualified customers". No public signup, no published pricing/rate limits. Sandbox key on request.
- Capabilities: **floor-plan recognition** (JPEG/PNG/PDF/DWG/DXF → editable 3D project with walls,
  openings, room boundaries; async REST, base64 upload, poll for status), **design generation**
  (image→image restyle, image→3D), **white-label iframe embed**, CAD export (beta).

**Implication:** integrating Planner 5D means a sales relationship, onboarding, and (likely) cost.
It is a great *premium* provider but a poor thing to hard-couple to on day one — it would block
the collaboration MVP behind a B2B deal.

## 2. Floor-plan → schema — viable self-serve options

Turning a client's floor-plan image/drawing into a structured "schema" is feasible **without**
Planner 5D:

| Option | What it gives | Access | Notes |
|---|---|---|---|
| **GPT-4o Vision (DIY)** | image → JSON (rooms, approx dimensions, openings) + we render a simple SVG plan | self-serve (already have `OPENAI_API_KEY`) | Rough but zero new vendor; fits our LangGraph pipeline; best MVP |
| RasterScan | walls/doors/symbols → 3D, export DXF/IFC/glTF | commercial, cloud/on-prem | Strong, SOC2/GDPR; paid |
| Apify "AI Blueprint Analyzer" | image → structured JSON (walls, dims, rooms, materials) | self-serve, pay-per-use | Easy to trial via Apify |
| Coohom AI floor planner | detects walls/doors/windows → editable 3D | consumer + business | Free tier; embeddable |
| Archilogic Floor Plan SDK | display/edit floor plans (TS SDK), digital twin | developer API | More visualization than generation |

## 3. "5D design from requirements"

The named tool (Planner 5D) is enterprise. Self-serve-ish alternatives for an editable 3D/5D
result: **Coohom** (free + embeddable 3D home design with AI floor plan), **Archilogic** (embed
SDK). True one-click "requirements → furnished 5D" is a vendor feature (Planner 5D image-to-3D /
Coohom) — not something we should build ourselves.

## 4. Recommendation — pluggable "design provider" behind an interface

Design the AI generation as a **provider-agnostic `DesignProvider` port** (one interface, swappable
implementations), invoked as a *downstream action on a request*:

- **MVP provider (self-serve, ships now):** `OpenAiVisionProvider` — plan image → structured schema
  JSON (rooms/walls/openings/approx dimensions) + a rendered SVG floor plan. Runs in the existing
  LangGraph/OpenAI stack, no new vendor, no contract. Delivers the "схема жилья по плану" loop end-to-end.
- **Premium providers (later, plug into the same port):** `Planner5dProvider` (enterprise API,
  true image→3D / white-label embed) and/or `CoohomProvider` — added when there's a B2B deal/budget.

**Why:** keeps the collaboration MVP unblocked and self-serve, proves the request→action loop with a
real (if rough) result, and leaves a clean seam to add Planner 5D's richer 3D/5D when the business
relationship exists. The collaboration design only needs to define the **action contract** (request →
DesignProvider → result artifact attached back to the request/project), not the provider internals.

## 5. Risks / open points
- GPT-4o vision floor-plan extraction is approximate (dimensions especially) — frame it as a *draft*
  schema the designer reviews, not a survey-grade CAD output.
- Planner 5D cost/terms unknown until sales contact — defer until the collaboration MVP proves demand.
- Storage of generated artifacts (SVG/JSON/3D links) needs a home — fold into the Project model in the
  collaboration design.

## Sources
- [Planner 5D — public API? (Help Center)](https://support.planner5d.com/en/articles/7245729-is-there-a-public-api-available-for-planner-5d)
- [Planner 5D for Business — API & integrations](https://planner5d.com/business/api-integrations)
- [RasterScan — floor plan recognition](https://www.rasterscan.com/)
- [Apify — AI Blueprint Analyzer](https://apify.com/ntriqpro/blueprint-intelligence)
- [Coohom — floor planner](https://www.coohom.com/case/floor-planner)
- [Archilogic — Floor Plan SDK](https://developers.archilogic.com/floor-plan-engine/api)
