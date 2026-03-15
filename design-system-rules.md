# Neoke Wallet — Design System Rules
> Generated for Figma MCP / Code Connect integration
> Stack: React 19 · Vite · TypeScript · Tailwind CSS v4 · Framer Motion
> Last updated: 2026-03-15 (layout, credential detail sheet, and color/name consistency updates)

---

## 1. Design Tokens

All tokens are defined as CSS custom properties in [`src/index.css`](src/index.css).

### Color Tokens

```css
/* Brand */
--color-brand: #5B4FE9;          /* Primary indigo — buttons, links, active states */
--color-brand-subtle: #EEF2FF;   /* Brand tint background */

/* Semantic text */
--text-base: #1c1c1e;            /* Primary text */
--text-subtle: #6d6b7e;          /* Secondary text */
--text-placeholder: #8e8e93;     /* Placeholder / hint */
--text-disabled: #abaab6;        /* Disabled state */
--text-error: #aa281e;           /* Destructive / error */
--text-warning: #aa7212;         /* Warning */
--text-success: #198e41;         /* Success */

/* Semantic backgrounds */
--bg-screen: #F2F2F7;            /* App-level screen background (iOS gray) */
--bg-base: #ffffff;              /* Card / panel background */
--bg-base-subtle: #f1f1f3;       /* Subtle background (separators, skeleton) */
--bg-brand: #5B4FE9;
--bg-brand-subtle: #EEF2FF;
--bg-error: #fbeae9;
--bg-warning: #fcf4e5;
--bg-success: #ebfbf0;

/* Borders */
--border-base: #d7d6dc;
--border-subtle: #e8e8eb;
--border-brand: #5B4FE9;

/* Legacy aliases (backwards-compatible — prefer semantic names above) */
--primary: #5B4FE9;
--primary-bg: #EEF2FF;
--bg-ios: #F2F2F7;
--bg-white: #ffffff;
--text-main: #1c1c1e;
--text-muted: #8e8e93;
```

### Layout Tokens

```css
--max-width: 512px;              /* Single-column mobile-first max-width */
--safe-area-bottom: env(safe-area-inset-bottom, 0px);
--shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);
--radius-xl: 16px;
--radius-2xl: 20px;
--radius-3xl: 24px;
```

### Typography

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

Type scale used in practice (Tailwind arbitrary values):
| Role | Size | Weight |
|---|---|---|
| Screen title | `text-[28px]` / `text-[32px]` | `font-bold` |
| Section heading | `text-[22px]` | `font-bold` |
| Body / list item | `text-[16px]` / `text-[17px]` | `font-normal` / `font-semibold` |
| Label / caption | `text-[13px]` / `text-[14px]` | `font-medium` |
| Micro / badge | `text-[10px]` / `text-[12px]` | `font-semibold` |

### Credential Card Colors

Deterministic gradient per credential ID, computed in [`src/utils/credentialHelpers.ts`](src/utils/credentialHelpers.ts):

```typescript
const CARD_GRADIENTS = [
  { from: '#1d4ed8', to: '#3b82f6' },   // blue
  { from: '#7c3aed', to: '#a78bfa' },   // violet
  { from: '#0f766e', to: '#14b8a6' },   // teal
  { from: '#b45309', to: '#f59e0b' },   // amber
  { from: '#be123c', to: '#f43f5e' },   // rose
  { from: '#0369a1', to: '#38bdf8' },   // sky
  { from: '#064e3b', to: '#10b981' },   // emerald
  { from: '#7f1d1d', to: '#ef4444' },   // red
];
```

Cards always use white text (`#ffffff`) on these gradient backgrounds.

---

## 2. Component Library

All components live in [`src/components/`](src/components/). No Storybook.

### PrimaryButton — [`src/components/PrimaryButton.tsx`](src/components/PrimaryButton.tsx)

```tsx
<PrimaryButton onClick={fn} loading={false} disabled={false}>
  Continue
</PrimaryButton>
```

- Full-width indigo pill (`rounded-full`, `py-4`, `text-[17px] font-semibold`)
- Color: `bg-[var(--primary)]` with `shadow-[#5B4FE9]/20`
- States: `disabled:opacity-50`, `active:scale-[0.98]`, shows `<LoadingSpinner size="sm">` when loading
- Props: `onClick`, `disabled`, `loading`, `children`, `type`, `fullWidth` (default true), `className`

### SecondaryButton — [`src/components/SecondaryButton.tsx`](src/components/SecondaryButton.tsx)

```tsx
<SecondaryButton onClick={fn}>Cancel</SecondaryButton>
```

- Same pill shape as PrimaryButton; white background with `border border-black/[0.08]`
- Text: `text-[#1c1c1e] font-medium`

### IconButton — [`src/components/IconButton.tsx`](src/components/IconButton.tsx)

```tsx
<IconButton aria-label="Back"><ChevronLeftIcon /></IconButton>
```

- 40×40px circle: `w-10 h-10 rounded-full bg-black/[0.05]`
- Hover: `bg-black/10`; Active: `bg-black/[0.15] scale-90`
- Icon stroke color: `text-[#5B4FE9]`

### ScreenNav — [`src/components/ScreenNav.tsx`](src/components/ScreenNav.tsx)

```tsx
<ScreenNav title="Consent Rules" onBack={() => navigate('account')} right={<IconButton>+</IconButton>} />
```

- Sticky nav, `bg-[#F2F2F7]`, `px-5 pt-14 pb-4`
- Title: `text-[28px] font-bold text-[#1c1c1e]`
- Back button: 40px ghost circle with chevron-left SVG

### CredentialCard — [`src/components/CredentialCard.tsx`](src/components/CredentialCard.tsx)

```tsx
<CredentialCard credential={cred} onClick={fn} stackIndex={0} />
```

- Absolutely positioned for stacking; aspect-ratio `1.586` (credit card ratio)
- Visual rendered by `CredentialCardFace` (shared with detail screen)
- Gradient derived from `getCardColor(credential)` → falls back to `getCardGradient()`

### CredentialCardFace — [`src/components/CredentialCardFace.tsx`](src/components/CredentialCardFace.tsx)

```tsx
<CredentialCardFace label="ePassport Copy" description="Issuer Name" bgColor="#1d4ed8" textColor="#ffffff" logoUrl="..." />
```

- `rounded-[20px]`, `p-5`, `aspectRatio: '1.586'`
- Top row: credential name (left) + issuer logo (right, `h-6`, max 42% width)
- Bottom: issuer description at 85% opacity

### StatusBadge — [`src/components/StatusBadge.tsx`](src/components/StatusBadge.tsx)

```tsx
<StatusBadge status="active" />
// active | suspended | revoked | expired
```

- Pill badge with colored dot: `px-2 py-1 rounded-full text-xs font-medium`
- Uses Tailwind semantic colors (green/yellow/red/gray)

### OptionCard — [`src/components/OptionCard.tsx`](src/components/OptionCard.tsx)

```tsx
<OptionCard selected={true} onClick={fn} title="Always share" description="Auto-approve all requests" icon={<.../>} />
```

- Full-width button, `rounded-[var(--radius-2xl)]`, `px-4 py-4`
- Selected: `border-[var(--primary)] bg-[var(--primary-bg)]`
- Unselected: `border-transparent shadow-[var(--shadow-sm)]`
- Radio circle on the right (custom SVG checkmark when selected)

### LoadingSpinner — [`src/components/LoadingSpinner.tsx`](src/components/LoadingSpinner.tsx)

```tsx
<LoadingSpinner size="sm" />  // sm | md | lg
```

- CSS spin animation; `border-[#5B4FE9]/20 border-t-[#5B4FE9]`

### ErrorMessage — [`src/components/ErrorMessage.tsx`](src/components/ErrorMessage.tsx)

```tsx
<ErrorMessage message="Something went wrong." />
```

- `bg-red-50 border border-red-200 rounded-[24px] p-4`
- Warning triangle SVG + text; `role="alert"`

### CredentialThumbnail — [`src/components/CredentialThumbnail.tsx`](src/components/CredentialThumbnail.tsx)

```tsx
<CredentialThumbnail backgroundColor="#1d4ed8" textColor="#ffffff" logoUrl="..." className="mr-4" />
```

- Fixed `72×46px` rectangle (`w-[72px] h-[46px]`) with `rounded-[8px]`
- Center-aligned logo with `brightness(0) invert(1)` filter for white-on-dark treatment
- Used in consent request rows (not the full card face)

### CredentialStack — [`src/components/CredentialStack.tsx`](src/components/CredentialStack.tsx)

```tsx
<CredentialStack credentials={creds} onSelectCredential={fn} />
```

- Overlapping card stack; newest card on top, older cards peek at `80px` intervals
- `ASPECT_RATIO = 1.586` (ISO/IEC 7810 ID-1 credit card)
- Drop-shadow filter on all cards except the oldest
- Keyboard accessible (Enter to select)

### NodeStatusChip — [`src/components/NodeStatusChip.tsx`](src/components/NodeStatusChip.tsx)

```tsx
<NodeStatusChip host="b2b-poc.id-node.neoke.com" label="verified" />
```

- Inline-flex pill: green dot + host name + optional secondary label (`· verified`)
- Used in onboarding and account screens to show connected node

### CeStatusBanner — [`src/components/CeStatusBanner.tsx`](src/components/CeStatusBanner.tsx)

```tsx
<CeStatusBanner onNavigateToQueue={fn} onRetry={fn} />
```

- Full-width button with icon + text + chevron
- **Offline state**: `bg-orange-50 border-orange-200`, warning triangle icon
- **Pending requests state**: `bg-[#5B4FE9]/8 border-[#5B4FE9]/15`, bell icon with count badge
- Displayed on Dashboard when CE is disconnected or has pending queue items

### ConsentLayout — [`src/components/ConsentLayout.tsx`](src/components/ConsentLayout.tsx)

```tsx
<ConsentLayout icon="🔐" title="Allow access?" subtitle="Service wants to…" actions={[{label:'Allow', onClick: fn, primary: true}]}>
  {children}
</ConsentLayout>
```

- Modal wrapper: fixed header (icon + title + subtitle) → `flex-1` scrollable content → fixed 2-column action grid
- Primary action: `bg-[#5B4FE9]` pill; secondary: `bg-[#f1f1f3]` pill

### ConsentRequestView — [`src/components/ConsentRequestView.tsx`](src/components/ConsentRequestView.tsx)

```tsx
<ConsentRequestView
  serviceName="Airline Check-in"
  isVP={true}
  purpose="Boarding verification"
  credentialRows={rows}
  actionState="idle"
  onShare={fn}
  onAlwaysShare={fn}
  onReject={fn}
  logoUri="https://…"
  onCredentialClick={(idx) => openSheet(idx)}
/>
```

- Returns a fragment: **pinned header** (logo + service name narrative) + **scrollable main** + **fixed action bar**
- Header is outside `<main>` so it stays above fold even when logo is present
- `isVP=true` → "wants you to share…"; `isVP=false` → "is offering you a credential"
- All credential rows rendered as `<button>` with disclosure chevron — always call `onCredentialClick`
- Props: `serviceName`, `isVP`, `purpose`, `linkedDomains`, `credentialRows`, `needsPin`, `actionState`, `actionError`, `actionsDisabled`, `onShare`, `onAlwaysShare`, `onReject`, `extras`, `logoUri`, `transactionData`, `onCredentialClick`

---

## 3. Styling Approach

- **Tailwind CSS v4** (imported as `@import "tailwindcss"` — no config file, uses CSS-native approach)
- **No CSS Modules, no CSS-in-JS** — all styling via Tailwind utility classes + CSS custom properties
- **Inline styles** used only for dynamic values (gradient colors from credential metadata, transform offsets during swipe gestures)
- **Framer Motion** for screen transitions and bottom-sheet animations (enter/exit, `AnimatePresence`)
- **Global styles** in `src/index.css`: token definitions, font, body reset, QR scanner overrides

### Responsive / mobile-first

- Single-column layout, max-width `512px` (set on `#root`)
- No breakpoint-based responsive CSS — the wallet is a mobile-first PWA
- Safe area insets used for bottom padding via `env(safe-area-inset-bottom)`
- `min-height: 100dvh` (dynamic viewport height for iOS)

---

## 4. Project Structure

```
src/
├── App.tsx                     # Root — hash-based router, tab bar, AnimatePresence
├── index.css                   # Global styles + all CSS custom property tokens
├── main.tsx                    # React entry point
├── components/                 # Reusable UI primitives
│   ├── PrimaryButton.tsx
│   ├── SecondaryButton.tsx
│   ├── IconButton.tsx
│   ├── ScreenNav.tsx           # Standard screen header (title + optional back + right)
│   ├── CredentialCard.tsx      # Card in home stack
│   ├── CredentialCardFace.tsx  # Shared visual face of a credential card
│   ├── CredentialStack.tsx     # Fan stack of cards on dashboard
│   ├── CredentialThumbnail.tsx # Small card variant for lists
│   ├── StatusBadge.tsx         # active/revoked/expired pill
│   ├── OptionCard.tsx          # Radio-style selectable card
│   ├── LoadingSpinner.tsx      # Spinner (sm/md/lg)
│   ├── ErrorMessage.tsx        # Alert box
│   ├── ConsentLayout.tsx       # Page layout wrapper for consent screens
│   ├── ConsentRequestView.tsx  # Consent request card (verifier info + fields)
│   ├── StatusBadge.tsx
│   ├── NodeStatusChip.tsx      # Connection status pill
│   ├── CeStatusBanner.tsx      # Consent Engine connection banner
│   └── ...
├── screens/                    # Full-page screen components
│   ├── DashboardScreen.tsx
│   ├── OnboardingStep1Screen.tsx
│   ├── OnboardingStep2Screen.tsx
│   ├── OnboardingStep3Screen.tsx
│   ├── ConsentQueueScreen.tsx
│   ├── ConsentQueueDetailScreen.tsx
│   ├── TravelServicesScreen.tsx
│   ├── TravelServiceDetailScreen.tsx
│   ├── AuditLogScreen.tsx
│   ├── CredentialDetailScreen.tsx
│   ├── AccountScreen.tsx
│   └── PreferenceScreen.tsx
├── context/
│   ├── AuthContext.tsx          # Auth state + session restore
│   └── ConsentEngineContext.tsx # CE connection state + SSE
├── api/
│   ├── client.ts               # Wallet node API
│   └── consentEngineClient.ts  # Consent Engine API
├── store/
│   └── localCredentials.ts     # localStorage credential cache
├── utils/
│   ├── credentialHelpers.ts    # Label/color/field extraction from credentials
│   └── uriRouter.ts            # Deep-link type detection
└── types/
    ├── index.ts                # Credential, ViewName, etc.
    └── consentEngine.ts        # CE API types
```

---

## 5. Screen Catalogue

### App.tsx — Tab Bar Router

- `AnimatePresence mode="wait"` wraps all screens; `motion.div` with standard variants per screen
- **TabBar**: 5 tabs (Home / Scan / Inbox / Consent / Account), `fixed bottom-0`, 64px height, `bg-white border-t border-[#f1f1f3]`
- Active tab icon: filled, `text-[#5B4FE9]`; inactive: `text-[#8e8e93]`
- Inbox tab: red badge for pending count, amber dot when CE disconnected

### Onboarding

| Screen | File | Purpose |
|---|---|---|
| Step 1 | `OnboardingStep1Screen.tsx` | Node identifier input → `validateNode()` |
| Step 2 | `OnboardingStep2Screen.tsx` | API key entry; shows `NodeStatusChip` after validation |
| Step 3 | `OnboardingStep3Screen.tsx` | CE connection (optional); gradient purple icon, skip button |

All onboarding screens: `pt-14` header, fixed footer with legal links + `PrimaryButton`.

### DashboardScreen — [`src/screens/DashboardScreen.tsx`](src/screens/DashboardScreen.tsx)

- Sticky nav: 28px bold title + `NodeStatusChip` right-aligned + `CeStatusBanner` when applicable
- `CredentialStack` below nav; overlapping peek of 80px; empty state shows a card-shaped placeholder
- Skeleton: animated pulse gradient rectangles while loading; count from `getLocalCredentialCount()`
- Scroll: only the stack area scrolls (cards fan out vertically)

### ConsentQueueScreen — [`src/screens/ConsentQueueScreen.tsx`](src/screens/ConsentQueueScreen.tsx)

- Inbox for pending VP/issuance/delegation requests
- **SwipeableInboxItem**: 72px red-background delete reveal; touch-driven `translateX`; `isDragging` ref + state (ref guards move, state drives CSS transition)
- Items sorted: pending first → then earlier resolved
- Red dot on pending items; status badge: `#aa281e` pending, `#198e41` accepted, `#8e8e93` other
- `timeAgo` + `expiryLabel` helpers for relative timestamps

### ConsentQueueDetailScreen — [`src/screens/ConsentQueueDetailScreen.tsx`](src/screens/ConsentQueueDetailScreen.tsx)

Three-branch rendering via `isDelegation` / `isVP` / issuance. See **Section 9** for the full layout pattern.

| Branch | Header narrative | Credential source | Detail sheet |
|---|---|---|---|
| VP (verification) | "wants you to share…" | `matchedCredentials` from CE | VP sheet with change/details/options views |
| Issuance | "is offering you a credential" | `credentialTypes` from CE | `detailSheet` state (full field values) |
| Delegation | "is requesting you to share … with …" | `credentialTypeId` from CE | `detailSheet` state (full field values) |

- `FocusTrap` component wraps all sheets for keyboard accessibility
- PIN sheet: password input, `inputMode="numeric"`, `tracking-[1em]` monospace

### TravelServicesScreen — [`src/screens/TravelServicesScreen.tsx`](src/screens/TravelServicesScreen.tsx)

- Lists active consent rules grouped and deduped by service name
- **Filter tabs**: segmented pill (All / Verification / Issuance) — white active pill on `#F2F2F7` background
- Rule card: 40px avatar + service name + date + **mode pill** + chevron
- Mode pill colors: `#5B4FE9` (always), `red-700` (never), `#8e8e93` (ask), green (issuance-accept)

### TravelServiceDetailScreen — [`src/screens/TravelServiceDetailScreen.tsx`](src/screens/TravelServiceDetailScreen.tsx)

- Edit sharing mode for a service (always / ask / block)
- `ScreenNav` header; mode banner with conditional background:
  - Always: `bg-[#e9e7f9]`; Never: `bg-[#fbeae9]`; Ask: white
- **Mode selector bottom sheet**: `spring` animation, handle bar, `OptionCard`-style buttons
- History section: action label + date badge

### AuditLogScreen — [`src/screens/AuditLogScreen.tsx`](src/screens/AuditLogScreen.tsx)

- Paginated activity log; **infinite scroll** via `IntersectionObserver`
- **SwipeableActivityItem**: same 72px swipe-to-delete pattern as `ConsentQueueScreen`
- `isDragging` dual ref+state pattern (ref = synchronous guard, state = CSS `transition` toggle)
- **EventDetailSheet**: bottom-sheet modal with field rows in `bg-[#F2F2F7]` grouped list
- Sticky nav with "Clear all" button (right side)

### CredentialDetailScreen — [`src/screens/CredentialDetailScreen.tsx`](src/screens/CredentialDetailScreen.tsx)

- Minimalist nav + `CredentialCardFace` at top + `StatusBadge`
- Two tabs: **Details** / **Activity** (Activity only when CE enabled)
- Photo field detection: base64 → `<img>` with `rounded-[12px]`; other binary fields → `[binary]` placeholder
- Activity month grouping; avatar colors: 8-color hash palette (`#5B4FE9`, `#e44b4b`, `#2da35e`, …)
- Delete credential: confirmation sheet → `onCredentialDeleted` callback

### AccountScreen — [`src/screens/AccountScreen.tsx`](src/screens/AccountScreen.tsx)

- Settings hub; sections: personal info, preferences, consent management, legal/feedback, account actions
- **Pattern**: `SectionHeader` (uppercase label + optional subtitle) + `ListCard` (white `rounded-[16px] p-1`) + `ListItem` (icon bg `#EEF2FF` + label + sublabel + right element + chevron)
- `InfoRow`: label/value pair with optional edit button or lock icon
- Modal sheets for: name edit, disconnect confirmation, delete account

### PreferenceScreen — [`src/screens/PreferenceScreen.tsx`](src/screens/PreferenceScreen.tsx)

- Multi-select chip groups (dietary / cuisines / accessibility / seat)
- Chip: `rounded-full px-4 py-2`; selected: `bg-[#5B4FE9] text-white`; unselected: `bg-white border border-[#d1d1d6]`
- Fixed footer: Cancel (secondary) + Save (primary) side by side

### PresentScreen — [`src/screens/PresentScreen.tsx`](src/screens/PresentScreen.tsx)

- QR scan → VP preview → consent → present success
- Uses `ConsentRequestView` for the consent stage (same layout as `ConsentQueueDetailScreen` VP branch)
- Sticky nav with `bg-[var(--bg-ios)]` (not `#F2F2F7` — screen bg matches the screen)
- Candidate picker sheet: horizontal snap-scroll of `CredentialCardFace` cards, `w-[220px]` per card

---

## 7. Icon System

- **No icon library** — all icons are inline SVG within components
- Consistent stroke style: `stroke="currentColor" strokeWidth="2" / "2.5" strokeLinecap="round" strokeLinejoin="round"`
- Icon sizes: `16×16`, `18×18`, `20×20`, `24×24` (viewBox `0 0 24 24`)
- Navigation icons (chevron, house, bell, person, qr-code) are inline in `App.tsx` (TabBar)
- Action icons (edit, delete, shield, check, x) are inline in each screen component

---

## 6. Animation Patterns

Using **Framer Motion**:

```tsx
// Screen enter/exit
const variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.14 } },
};

// Root AnimatePresence with mode="wait"
<AnimatePresence mode="wait">
  <motion.div key={screenKey} variants={variants} initial="initial" animate="animate" exit="exit">
```

Bottom sheets use `initial={{ y: '100%' }}` → `animate={{ y: 0 }}`.

---

## 8. Asset Management

- `src/assets/` — currently only `react.svg` (Vite default, unused in production)
- Credential issuer logos: served from external URLs in `credential.displayMetadata.logoUrl`
- No CDN configuration — Vercel handles static assets
- No image optimization pipeline (no `<Image>` component)

---

## 9. Figma Code Connect Mapping

| Figma Component | Code Component | File |
|---|---|---|
| Button / Primary | `PrimaryButton` | `src/components/PrimaryButton.tsx` |
| Button / Secondary | `SecondaryButton` | `src/components/SecondaryButton.tsx` |
| Button / Icon | `IconButton` | `src/components/IconButton.tsx` |
| Nav / Screen Header | `ScreenNav` | `src/components/ScreenNav.tsx` |
| Card / Credential | `CredentialCardFace` | `src/components/CredentialCardFace.tsx` |
| Badge / Status | `StatusBadge` | `src/components/StatusBadge.tsx` |
| Card / Option | `OptionCard` | `src/components/OptionCard.tsx` |
| Spinner | `LoadingSpinner` | `src/components/LoadingSpinner.tsx` |
| Alert / Error | `ErrorMessage` | `src/components/ErrorMessage.tsx` |
| Screen / Dashboard | `DashboardScreen` | `src/screens/DashboardScreen.tsx` |
| Screen / Consent Queue | `ConsentQueueScreen` | `src/screens/ConsentQueueScreen.tsx` |
| Screen / Consent Detail (VP + issuance + delegation) | `ConsentQueueDetailScreen` | `src/screens/ConsentQueueDetailScreen.tsx` |
| Screen / VP Present (QR scan flow) | `PresentScreen` | `src/screens/PresentScreen.tsx` |
| Screen / Service Detail | `TravelServiceDetailScreen` | `src/screens/TravelServiceDetailScreen.tsx` |
| Screen / Travel Services List | `TravelServicesScreen` | `src/screens/TravelServicesScreen.tsx` |
| Screen / Audit Log | `AuditLogScreen` | `src/screens/AuditLogScreen.tsx` |
| Screen / Credential Detail | `CredentialDetailScreen` | `src/screens/CredentialDetailScreen.tsx` |
| Screen / Account | `AccountScreen` | `src/screens/AccountScreen.tsx` |
| Screen / Preference Chips | `PreferenceScreen` | `src/screens/PreferenceScreen.tsx` |
| Screen / Onboarding Step 1 | `OnboardingStep1Screen` | `src/screens/OnboardingStep1Screen.tsx` |
| Screen / Onboarding Step 2 | `OnboardingStep2Screen` | `src/screens/OnboardingStep2Screen.tsx` |
| Screen / Onboarding Step 3 | `OnboardingStep3Screen` | `src/screens/OnboardingStep3Screen.tsx` |
| Shared / Consent Request Layout | `ConsentRequestView` | `src/components/ConsentRequestView.tsx` |
| Component / Node Status | `NodeStatusChip` | `src/components/NodeStatusChip.tsx` |
| Component / CE Status Banner | `CeStatusBanner` | `src/components/CeStatusBanner.tsx` |
| Component / Credential Thumbnail | `CredentialThumbnail` | `src/components/CredentialThumbnail.tsx` |
| Component / Credential Stack | `CredentialStack` | `src/components/CredentialStack.tsx` |

---

## 10. Consent / Request Screen Layout Pattern

All three consent screen families (verification, issuance, delegation) share this structural pattern:

```
<motion.div className="flex-1 flex flex-col bg-[var(--bg-ios)] min-h-screen">
  {/* 1. Sticky nav — back button only, always above fold */}
  <nav className="sticky top-0 z-10 bg-[#F2F2F7] px-5 pt-14 pb-3">
    <button aria-label="Go back" className="w-10 h-10 rounded-full bg-black/[0.05] ...">
      {/* chevron-left SVG */}
    </button>
  </nav>

  {/* 2. Pinned header — service name + optional logo, NOT in scroll area */}
  <div className="px-5 pt-3 pb-4">
    {logoUri && <img ... className="w-12 h-12 rounded-[14px] mb-3" />}
    <h2 className="text-[24px] font-semibold text-[#1c1c1e] leading-[28px]">
      <span className="text-[#5B4FE9]">{serviceName}</span> …narrative…
    </h2>
  </div>

  {/* 3. Scrollable content — reason, credentials, fields */}
  <main className="flex-1 px-5 pt-0 pb-52 overflow-y-auto space-y-5">
    {/* status banners, purpose, credential rows, etc. */}
  </main>

  {/* 4. Fixed action bar — always above viewport bottom */}
  <div className="fixed bottom-0 … max-w-[var(--max-width)] mx-auto px-5 pt-4 pb-10 …">
    {/* CTA buttons */}
  </div>
</motion.div>
```

**Rules:**
- Nav MUST be `sticky top-0 z-10` — it never scrolls away
- The service name header MUST be outside `<main>` so it is visible above the fold even with a logo
- `<main>` starts with `pt-0` (header already has `pb-4`)
- Logo size in header: `w-12 h-12 rounded-[14px]` with white bg + subtle border
- Delegation variant adds an icon badge above the service name (arrow/exchange icon in `bg-[#EEF2FF]`)

### Credential Row — Clickable Pattern

All credential rows in consent screens MUST be clickable (button, not div):

```tsx
<button
  onClick={() => setDetailSheet({ localCred, types })}
  className="w-full bg-white rounded-[16px] flex items-center px-4 py-4 border border-[#f1f1f3] shadow-sm active:bg-[#F2F2F7] transition-colors text-left"
>
  <div className="mr-4 w-10 h-10 rounded-[10px]" style={{ backgroundColor }} />
  <div className="flex-1 min-w-0">
    <p className="text-[16px] font-bold text-[#1c1c1e] truncate">{label}</p>
    <p className="text-[13px] text-[#8e8e93] truncate font-medium">{issuerLabel}</p>
  </div>
  {/* disclosure chevron */}
  <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="ml-2 flex-shrink-0">
    <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
</button>
```

### Credential Detail Sheet — Consistent Pattern

The detail sheet is identical across all three consent screen types. Always:

```tsx
<div className="fixed inset-0 z-[60]" onClick={() => setDetailSheet(null)}>
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px] bg-white rounded-t-[24px]"
    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>
    {/* drag handle + close X */}
    <div className="px-5 pt-3 pb-2 max-h-[70vh] overflow-y-auto">
      <h3 className="text-[20px] font-bold text-[#1c1c1e] mb-4">{label}</h3>
      <div className="rounded-[16px] overflow-hidden mb-4">
        <CredentialCardFace label={label} description={desc} bgColor={bg} textColor={text} logoUrl={logo} />
      </div>
      {/* claim rows: label (left, muted) + value (right, primary) */}
      <div className="bg-[#F2F2F7] rounded-[16px] overflow-hidden">
        {fields.map((f, i) => (
          <div key={i} className="flex justify-between items-start px-4 py-3 …">
            <p className="text-[14px] text-[#8e8e93] font-medium">{f.label}</p>
            <p className="text-[14px] text-[#1c1c1e] font-medium text-right ml-4 max-w-[55%]">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
</div>
```

**Color / label resolution order for the sheet (and thumbnail):**
1. If `localCred` found: `getCardColor(localCred)` and `getCredentialLabel(localCred)`
2. Else: `getCardColorForTypes(types)` and `getCandidateLabel(types)`
— Color in sheet MUST match the color in the thumbnail row. Use the same resolver.

**Field values in the sheet:**
- If `requestedFields` (VP): `getRequestedFields(localCred, requestedFields)` → `{label, value}[]`
- If no specific fields (delegation, issuance): `extractFields(localCred)` filtered to `.filter(f => f.value)`
- If no `localCred`: show empty state `"Credential not yet in wallet"`
- Both helpers exported from [`src/utils/credentialHelpers.ts`](src/utils/credentialHelpers.ts)

---

## 11. Key Conventions for Figma → Code

1. **Token usage**: always use `var(--color-brand)` / `var(--primary)` for brand color, not hardcoded `#5B4FE9` (legacy screens still have some hardcoded values — these should be migrated).
2. **Spacing**: use Tailwind utilities (`px-4`, `py-3`, etc.) — no custom spacing scale.
3. **Border radius**: use `rounded-full` (pills), `rounded-[20px]` (cards), `var(--radius-2xl)` (sheets), `rounded-[12px]` (inputs).
4. **Bottom sheets**: always `fixed inset-0 z-[60]` overlay, `absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[512px]` sheet panel, `rounded-t-[24px]`.
5. **Touch targets**: minimum `w-10 h-10` (40×40px) for all interactive controls.
6. **Loading states**: skeleton cards use `bg-[#e8e8eb] animate-pulse rounded-full`.
7. **Screens are full-height**: always `min-h-screen` on screen root divs; `pb-28` at bottom to clear the tab bar.
8. **Consent screens**: sticky nav + pinned header (outside scroll) + scrollable main — see section 10 above.
9. **Credential rows in consent screens**: always `<button>` not `<div>` — tapping opens the detail sheet.
10. **Swipe-to-delete pattern** (`AuditLogScreen`, `ConsentQueueScreen`): `useRef<boolean>` for synchronous drag guard in `touchmove`; mirror with `useState<boolean>` for the CSS `transition` toggle (ref can't trigger re-render). 72px reveal width, red background, absolute-positioned delete button.
11. **Segmented filter tabs** (`TravelServicesScreen`): white pill on `bg-[#F2F2F7]` track; `text-[15px] font-semibold`; active: `bg-white shadow-sm rounded-full px-4 py-1.5`.
12. **Account list pattern**: `SectionHeader` → `ListCard` (`bg-white rounded-[16px] p-1 space-y-1`) → `ListItem` (icon in `w-9 h-9 bg-[#EEF2FF] rounded-full` + label + sublabel + right element). The `p-1 space-y-1` gap between items gives a subtle separator without a line.
13. **Animation variants reference**: screen enter `{ opacity: 0, y: 16 }` → `{ opacity: 1, y: 0, duration: 0.22 }`; screen exit `{ opacity: 0, y: -8, duration: 0.14 }`; bottom sheet `{ y: '100%' }` → `{ y: 0, spring }`; slide-in detail `{ x: '100%' }` → `{ x: 0, spring }`.
