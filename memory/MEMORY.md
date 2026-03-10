# Neoke Cloud Wallet — Project Memory

## Stack
- React 19 + TypeScript + Vite + Tailwind CSS 4 + Framer Motion
- No external component library — all custom with Tailwind

## Design System
- Background: `#F2F2F7`, Primary: `#5B4FE9`, Cards: `bg-white rounded-2xl shadow-sm`
- Text: `#1c1c1e` (primary), `#8e8e93` (secondary)
- Green: `#059669`, Orange: `#F59E0B`, Red: `#EF4444`
- Icons: inline SVG, strokeWidth="1.7", strokeLinecap="round"
- Screens: `motion.div` with `{ initial: {opacity:0,y:16}, animate: {opacity:1,y:0,transition:{duration:0.22,ease:'easeOut' as const}}, exit: {opacity:0,y:-8,transition:{duration:0.14}} }`

## Architecture
- Navigation: `currentView: ViewName` state in `AppInner` (no router library)
- Auth: `AuthContext` (bearer token, session expiry, localStorage persistence)
- CE: `ConsentEngineContext` (CE URL, API key, health polling every 30s)

## Layer 3 (Consent Engine) — Implemented
- `src/types/consentEngine.ts` — CE types
- `src/api/consentEngineClient.ts` — CE API client (uses ApiKey auth, not Bearer)
- `src/context/ConsentEngineContext.tsx` — CE state, health checks, `useConsentEngine` hook
- New screens: ConsentRulesScreen, ConsentRuleEditorScreen (7-step wizard), ConsentQueueScreen, ConsentQueueDetailScreen, AuditLogScreen, OnboardingStep3Screen
- New components: CeIntakeOverlay, CeStatusBanner
- Consent tab in TabBar (4th tab, only shown when ceEnabled)
- Deep links routed through CE when configured, fallback to direct mode

## localStorage Keys
- `neoke_s_token`, `neoke_s_expires`, `neoke_node_id`, `neoke_activity`
- `neoke_ce_url`, `neoke_ce_enabled`, `neoke_ce_apikey`, `neoke_ce_dismissed`
