# neoke-cw-consent — CLAUDE.md

**The consent wallet UI.** This is the primary user-facing interface for the Neoke Consent Engine.

> For architecture, live credentials, API patterns, and the full dev guide see:
> `../neoke-consent-engine/CLAUDE.md`

---

## Plan Mode

Enter Plan Mode (`Shift+Tab`) and wait for "GO" **before writing code** when the change is any of:
- New screen or reworked user flow
- Changes to consent rule upsert / queue / Travel Services logic
- New CE API integration or changed request shape
- Any change touching more than ~3 files

Skip Plan Mode for: copy fixes, single-component style tweaks, config changes.

Use `/frontend-design` for UI/UX changes. Use `/neoke-design` to verify design system alignment. Use `/clean-software-architecture` when reworking screen logic or introducing new flows.

---

## Stack

React · Vite · TypeScript · Tailwind CSS v4 · Framer Motion

Deploy: Vercel → `https://neoke-cw-consent.vercel.app`
Auto-deploys on `git push` to main.

---

## Commands

```bash
npm run dev    # Vite dev server (port 5173)
npm run build  # tsc -b && vite build — MUST be green before push
npm run lint   # eslint
```

---

## Key Screens & Responsibilities

| Screen | Purpose |
|---|---|
| `TravelServicesScreen` | Lists services the user has active consent rules for |
| `TravelServiceDetailScreen` | Mode selector (always share / ask / block) for a service |
| `ConsentQueueScreen` | Pending VP requests and credential offers |
| `ConsentQueueDetailScreen` | Approve/reject a queued item; creates/updates consent rules |
| `ConsentRuleEditorScreen` | Manual rule editor (advanced) |
| `AuditLogScreen` | Audit history per service |
| `AccountScreen` | API key, settings |

---

## Playwright Testing — REQUIRED

**Run a Playwright MCP smoke test after any noticeable UI change.**

Noticeable = new screen, changed flow, modified component visible to the user (consent modal, rule mode selector, credential card, queue item, etc.).

### Minimum flows to cover

- Consent queue loads → item opens → "Always share" or "Always accept" creates a rule → rule appears in Travel Services list
- Travel Services list deduplicates entries (no double entries for the same service)
- Mode selector in `TravelServiceDetailScreen` switches mode and saves correctly

### How to run

```
/browser-use
Navigate to https://neoke-cw-consent.vercel.app, screenshot the Travel Services screen.
Then open the consent queue, click the first item, screenshot the detail view.
```

Use the **live Vercel URL** for deployed changes; use **localhost:5173** for local-only verification.

---

## Major Upgrade Protocol

A **major upgrade** is: a breaking dependency bump (React, Vite, Tailwind, Framer Motion), a new or reworked screen/flow, a change to consent rule upsert logic, or any security-relevant change (auth, CE API key handling, CORS).

**Before deploying a major upgrade:**
1. Run `/production-audit` — fix all **CRITICAL and HIGH** findings before pushing.
2. For security changes also run `/ai-security` — fix CRITICAL/HIGH findings.
3. Run Playwright smoke tests on all affected flows (queue, rule creation, Travel Services list).
4. Verify on the live Vercel URL after deploy.

> Unresolved CRITICAL/HIGH findings = roll back the deploy.

---

## Guardrails

- `npm run build` must pass before every push — Vercel will fail otherwise.
- Rule creation payloads must include `allowedFields` — CE silently rejects without it.
- Upsert logic in `ConsentQueueDetailScreen` must filter by `ruleType` before matching (never cross-match verification ↔ issuance).
- Catch blocks around CE calls are non-fatal — if a rule isn't appearing, test the CE API directly.
- Follow the Neoke design system (`/neoke-design` skill).
