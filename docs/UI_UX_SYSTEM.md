# Bivro UI/UX System

**Document status:** Architecture specification — no code, no mockups, no frontend files.
**Version:** V1 (Company Portal + Platform Portal)
**Cross-references:** ARCHITECTURE.md, DATABASE_ARCHITECTURE.md, CODING_STANDARDS.md, AI_ENGINE.md, PLATFORM_ADMIN.md, PRODUCT_REQUIREMENTS.md, BUSINESS_MODEL.md

---

## Table of Contents

1. [UX Philosophy and Design Principles](#1-ux-philosophy-and-design-principles)
2. [Product Experience Architecture](#2-product-experience-architecture)
3. [Design System — Compass](#3-design-system--compass)
4. [Login and Authentication UX](#4-login-and-authentication-ux)
5. [Responsive Strategy](#5-responsive-strategy)
6. [Navigation Architecture](#6-navigation-architecture)
7. [Dashboard Experience](#7-dashboard-experience)
8. [Quote Creation Experience](#8-quote-creation-experience)
9. [Bivro Intelligence UX Patterns](#9-bivro-intelligence-ux-patterns)
10. [Company AI Brain UX](#10-company-ai-brain-ux)
11. [Permission-Aware UX](#11-permission-aware-ux)
12. [Core Component Catalog](#12-core-component-catalog)
13. [Table UX System](#13-table-ux-system)
14. [Form UX](#14-form-ux)
15. [Accessibility](#15-accessibility)
16. [Performance Perception UX](#16-performance-perception-ux)
17. [Empty States and Onboarding](#17-empty-states-and-onboarding)
18. [Platform Portal UX](#18-platform-portal-ux)
19. [Cross-Document Consistency](#19-cross-document-consistency)
20. [Final Report](#20-final-report)

---

## 1. UX Philosophy and Design Principles

### 1.1 The Core Thesis

Bivro is an AI Operating System for moving companies. It is not a CRM with an AI widget bolted on. Intelligence is woven into every workflow, every surface, and every decision point.

The product must feel like a knowledgeable operations partner that already understands the company — not a software tool the user needs to configure before it works.

The measure of every UX decision is this: **does this reduce operational thinking, or does it add to it?**

### 1.2 Five UX Principles

**P1 — Surface Before Search**
The system finds what matters. Users should not hunt through menus and tables to understand what requires their attention. Priorities, risks, opportunities, and anomalies must present themselves.

**P2 — AI Proposes, Human Decides**
Every AI recommendation is a starting point, not an endpoint. AI output is always editable, always explainable, always dismissible. Nothing AI generates is locked. The user's judgment overrides the machine at every step. This is a non-negotiable product commitment (see PRODUCT_REQUIREMENTS.md §2.1).

**P3 — Calm Over Noise**
Operational products are used for hours every day. The visual language must not exhaust users. Density without chaos. Purpose without decoration. Professional without cold. The interface should feel like a well-organized, lit workspace — not a dashboard PowerPoint or an excitement machine.

**P4 — Speed as Respect**
Latency is disrespectful of the user's time. The product must feel instant. Optimistic updates, smart skeletons, background processing, and streaming responses all serve this principle. The interface communicates progress, not absence.

**P5 — Transparent Intelligence**
Trust is built through explainability. The AI's reasoning is never hidden. Every recommendation answers: what, why, how confident, what data was used. Users who understand why Bivro suggested something are users who trust and correct it — which makes the system smarter.

### 1.3 What Bivro Is Not

- Not a chatbot interface. AI is embedded throughout the product, not concentrated in a chat panel.
- Not a reporting dashboard. Charts support decisions; they do not replace them.
- Not a configuration-heavy CRM. The product learns and adapts; it does not require the user to set up rules for everything.
- Not a generic SaaS template. The visual identity, information architecture, and interaction patterns are specific to this domain.

### 1.4 Domain Vocabulary

Bivro surfaces match the operator's mental model, not the software's internal model:

| Industry term | Bivro term | Never use |
|---------------|------------|-----------|
| Moving job | Job | Order, record, ticket |
| Quote / Estimate | Quote | Invoice (until invoiced) |
| Crew member | Employee | User, resource |
| Moving company | Company | Tenant, client, account |
| Owner (business owner) | Owner | Admin, superuser |
| Office staff | Office | Staff user, agent |

---

## 2. Product Experience Architecture

### 2.1 Two Separate Products

Bivro operates two completely distinct product experiences. They must never feel accidentally mixed.

**Company Portal** — `app.bivro.io` or `{slug}.bivro.io`
- Used by: Owner and Office users of a moving company
- This is the operating system for a moving company
- Each company's portal is isolated from every other company's portal
- The company's name and branding are visually prominent — this is their workspace

**Platform Portal** — `admin.bivro.io`
- Used by: Authorized Bivro internal staff only
- This is the operating system for Bivro the company
- Eight platform roles with configurable permissions (see PLATFORM_ADMIN.md §2)
- Governed by separate auth domain, separate session pool, separate audit trail

### 2.2 Visual Separation Rules

The two portals must never share enough visual identity to cause confusion.

**Company Portal visual context:**
- Default light theme (office environment, extended daily use)
- Company name displayed prominently in navigation chrome
- Bivro brand is subtle — this is the company's workspace, not a Bivro billboard
- Current user name and role visible at all times
- Company logo / color accent if configured

**Platform Portal visual context:**
- Visually authoritative, distinct color treatment from Company Portal
- "BIVRO PLATFORM ADMIN" displayed persistently in navigation chrome — not a banner that can be scrolled past, built into the nav itself
- Higher visual contrast, more formal tone
- Platform role displayed in user menu (e.g., "Customer Success")

**Support session indicator (Platform Portal accessing company data):**
- Persistent amber banner pinned to the top of every page — it cannot be dismissed
- Content: "SUPPORT SESSION · Viewing [Company Name] · Reason: [operator-entered reason] · [HH:MM:SS elapsed] · Expires in [N] min · [Extend Session] [End Session]"
- Timer counts down live
- At 5 minutes remaining: banner pulses with amber highlight and intensified color
- At expiry: session ends automatically, redirect to Platform Portal with "Session expired" notification
- Every page rendered during this session shows this banner — no exceptions
- Required by PLATFORM_ADMIN.md §5 (support access protocol)

### 2.3 Domain Separation Rules

- Company Portal users never see Platform Portal chrome, routes, or data
- Platform Portal users never see Company Portal chrome unless they are in an active, audited support session
- Company Portal users attempting to access `admin.bivro.io` receive a 403 with no further information
- All platform admin sessions are separate from company user sessions (separate session pool; see PLATFORM_ADMIN.md §3 and ARCHITECTURE.md §19)

---

## 3. Design System — Compass

Bivro's design system is named **Compass**. Compass is built for operational density, daily use, and intelligence-forward workflows. It is not a general-purpose design system. Every decision in Compass is validated against the question: does this help an operator run a moving company effectively?

### 3.1 Design Language Identity

**Personality attributes:** Intelligent. Calm. Precise. Trustworthy. Operationally powerful.

**Personality anti-attributes:** Playful. Flashy. Marketing-y. Overwhelming. Generic SaaS.

Compass uses restraint. Color is used to communicate, not to decorate. Motion serves function, not delight. Every pixel earns its place.

### 3.2 Color System

Compass defines color by semantic role, not by aesthetic preference. Colors carry meaning. Using a color outside its defined role is a bug.

#### Surface System

| Token | Light value description | Dark value description | Use |
|-------|------------------------|----------------------|-----|
| `surface-base` | Warm near-white (not pure #FFF) | Deep cool slate | Page background |
| `surface-raised` | White | Dark slate | Cards, panels, sidebar |
| `surface-overlay` | White | Dark slate-blue | Modals, drawers |
| `surface-sunken` | Cool light gray | Very dark slate | Input backgrounds, code blocks, inset areas |
| `surface-divider` | Light warm gray | Dark divider | Borders, dividers, row separators |

Bivro V1 ships with light mode as default. Dark mode is architecturally supported but not required for V1 launch.

#### Brand Colors

| Token | Description | Use |
|-------|-------------|-----|
| `ink-900` | Deep slate-indigo (primary brand) | Primary buttons, active nav, logo, selected states |
| `ink-700` | Medium slate-indigo | Secondary interactive elements, hover states of ink-900 elements |
| `ink-500` | Mid slate | Tertiary labels, secondary borders |
| `ink-100` | Very light slate tint | Selected row backgrounds, pill backgrounds |
| `signal-600` | Blue-violet (interactive) | Focus rings, links, secondary CTAs |
| `signal-100` | Light blue-violet tint | Focus ring fill area, selection overlay |

The `ink` palette is deliberately not a generic corporate blue. It reads as authoritative and intelligent without being cold or impersonal.

#### AI-Exclusive Color Family

**These colors are used exclusively for AI elements. No other UI element in Bivro uses these colors. When a user sees teal, they know it is intelligence.**

| Token | Description | Use |
|-------|-------------|-----|
| `ai-600` | Deep teal (AI primary) | AI recommendation card headers, AI action buttons, AI chip borders |
| `ai-400` | Mid teal | AI confidence badges, AI sparkle icons, AI panel accents |
| `ai-100` | Very light teal tint | AI card backgrounds, AI panel surfaces |
| `ai-warm-500` | Amber-teal hybrid | Low-confidence AI state, AI warnings |

No button, badge, status indicator, navigation element, or chart in Bivro uses teal. The AI color family is a reserved namespace.

#### Semantic Colors

| Token | Meaning | Example uses |
|-------|---------|-------------|
| `success-700` | Positive outcome | Job complete, payment received, quote accepted |
| `success-100` | Success surface | Accepted badge background |
| `warning-700` | Attention required | Overdue invoice, missing crew, low stock |
| `warning-100` | Warning surface | Overdue badge background |
| `danger-700` | Error or destructive | Delete confirmation, failed payment, permission denied |
| `danger-100` | Danger surface | Error badge background, danger button (ghost) |
| `info-600` | Informational, passive | System messages, help text accents |
| `info-100` | Info surface | Info badge background |

#### Financial Colors

Financial colors appear only in financial contexts (revenue, cost, margin) and are always guarded by permission checks.

| Token | Meaning |
|-------|---------|
| `profit-positive` | Positive margin — distinct green, not success-700 |
| `profit-neutral` | Near-zero margin |
| `profit-negative` | Negative margin — distinct red, not danger-700 |

The visual distinction between `profit-positive` and `success-700` is intentional: financial profit is categorically different from an operational success state.

### 3.3 Typography

**Primary typeface:** Geist (open source, created by Vercel, variable font, exceptional legibility at 12–15px in operational density contexts)

**Fallback stack:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

**Monospace:** Geist Mono (IDs, codes, timestamps, command palette)

#### Type Scale

| Name | Size | Weight | Line height | Use |
|------|------|--------|-------------|-----|
| `display-xl` | 28px | 700 | 1.2 | Dashboard headlines, empty state titles |
| `display-lg` | 24px | 700 | 1.2 | Page titles, major modal headers |
| `display-md` | 20px | 600 | 1.3 | Card headers, section titles |
| `heading` | 16px | 600 | 1.4 | Sub-section headers, table column headers |
| `body-lg` | 15px | 400 | 1.5 | Primary body text |
| `body` | 14px | 400 | 1.5 | Default body, form labels, table cell text |
| `body-sm` | 13px | 400 | 1.5 | Secondary labels, metadata, nav labels |
| `caption` | 12px | 400 | 1.4 | Timestamps, helper text, badges |
| `mono` | 13px | 400 | 1.5 | IDs, codes, command palette input |

**Rule:** Never use font sizes below 12px in the product. 12px caption is already at the floor.

### 3.4 Spacing System

Base unit: **4px**. All spacing values are multiples of 4px.

| Token | Value | Common use |
|-------|-------|-----------|
| `space-1` | 4px | Minimum gap, icon inner padding, tight chip padding |
| `space-2` | 8px | Icon-to-label gap, badge horizontal padding |
| `space-3` | 12px | Input horizontal padding, inline element gaps |
| `space-4` | 16px | Standard card padding, form field vertical gap |
| `space-5` | 20px | Medium section gap |
| `space-6` | 24px | Card vertical padding, standard component gap |
| `space-8` | 32px | Section breaks, major vertical rhythm |
| `space-10` | 40px | Large section separators |
| `space-12` | 48px | Page-level vertical rhythm |
| `space-16` | 64px | Empty state vertical spacing |
| `space-24` | 96px | Hero section spacing |

### 3.5 Border Radius System

| Token | Value | Use |
|-------|-------|-----|
| `radius-sm` | 4px | Badges, chips, secondary buttons, table row hover |
| `radius-md` | 6px | Inputs, primary buttons, small cards |
| `radius-lg` | 10px | Standard cards, modals, drawers |
| `radius-xl` | 16px | Large panels, onboarding cards, AI summary panels |
| `radius-full` | 9999px | Avatars, pill badges, toggle buttons |

### 3.6 Elevation

Five elevation levels. Used to communicate the spatial layer of a surface, not as decoration.

| Level | Box shadow | Use |
|-------|-----------|-----|
| 0 | None | Base surface, inset areas, table row backgrounds |
| 1 | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | Card resting state |
| 2 | `0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Raised cards, dropdown menus |
| 3 | `0 8px 16px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)` | Modals, popovers |
| 4 | `0 16px 32px rgba(0,0,0,0.14), 0 8px 16px rgba(0,0,0,0.08)` | Drawers, command palette |
| 5 | `0 24px 48px rgba(0,0,0,0.20), 0 12px 24px rgba(0,0,0,0.10)` | Full-screen overlay sheets |

### 3.7 Density System

Table and list density is configurable per-table, not globally forced. Three density levels:

| Level | Row height | Cell padding | Use |
|-------|------------|-------------|-----|
| Compact | 32px | 8px vertical | Power users, monitoring, secondary tables |
| Default | 40px | 12px vertical | Standard daily operational use |
| Comfortable | 48px | 16px vertical | Customer consultation, tablet contexts |

Default is "Default." Users can switch per-table; preference is persisted.

### 3.8 Motion

**Duration scale:**

| Name | Duration | Use |
|------|----------|-----|
| `instant` | 0ms | JavaScript-only state changes, no visual |
| `quick` | 80ms | Interactive micro-states: button press, checkbox tick, toggle |
| `standard` | 150ms | Panel transitions, dropdown open/close, toast appear |
| `deliberate` | 250ms | Drawer open/close, modal appear/disappear |
| `transition` | 400ms | Page-level transitions, major layout shifts |

**Easing:**
- Elements entering view: `ease-out` (fast start, graceful finish)
- Elements leaving view: `ease-in` (accelerates out)
- Elements repositioning: `ease-in-out`
- AI thinking state: custom slow pulse — `cubic-bezier(0.4, 0, 0.6, 1)` repeated — communicates deliberate computation, not loading

**Reduced motion:** When `prefers-reduced-motion: reduce` is active, all decorative animations are removed. Functional transitions (drawer open, modal appear) are retained but instantaneous. AI thinking indicator becomes a static teal dot rather than an animated pulse.

### 3.9 Iconography

**Icon set:** Lucide (MIT licensed, clean, consistent stroke-based icons, React-native compatible)

**Size scale:**

| Size | Context |
|------|---------|
| 14px | Inline text, badge icons |
| 16px | Standard button icons, nav icons (compact), table action icons |
| 20px | Large button icons, section headers, empty state icons |
| 24px | Display icons, empty state illustrations |

**Rules:**
- Never use icons as the sole means of communicating meaning. Always pair with a visible label or tooltip.
- AI-specific icon: a distinct sparkle/constellation icon used exclusively on AI elements. Never use this icon on non-AI elements.
- Destructive icons (trash, archive) are always rendered in `danger-700`.

### 3.10 Interactive States

**Focus:**
- 2px solid `signal-600` ring, 2px offset from element boundary
- Visible in all themes and against all background colors
- Never removed with `outline: none` without an equivalent custom implementation
- Focus ring must achieve 3:1 contrast against adjacent colors

**Hover:**
- Table rows: background shifts to `surface-raised`
- Interactive cards: elevation increases by 1 level; cursor becomes pointer
- Buttons: brightness adjustment (+5%) with 80ms ease-out
- Links: underline appears on hover; color stable

**Selected/Active:**
- List items (navigation): `ink-100` background with 3px `ink-900` left border
- Table rows: `signal-100` background with checkbox shown
- Tabs: `ink-900` bottom border, label weight increases to 600

**Destructive action pattern:**
1. Destructive buttons (`danger-700` filled) are never presented as the primary CTA in a workflow
2. Single entity delete: confirmation popover with explicit description ("Archive this customer?")
3. Irreversible operations: modal with type-to-confirm (user types entity name or "DELETE")
4. Bulk destructive: modal with item count + list of affected items + type-to-confirm

**AI visual states:**

| State | Appearance |
|-------|-----------|
| `ai-idle` | No visible indicator |
| `ai-thinking` | Animated `ai-400` pulse dot + "Bivro is analyzing..." label (teal) |
| `ai-ready` | `ai-100` chip with sparkle icon + recommendation count |
| `ai-suggestion-active` | Card with `ai-600` 3px left border, `ai-100` background, sparkle icon |
| `ai-low-confidence` | `ai-warm-500` border (amber-teal), dotted border style, explicit confidence label |
| `ai-dismissed` | Collapsed to single ghost line "Suggestion dismissed · Undo" |
| `ai-accepted` | Brief check animation at `ai-400`, then integrates into form data naturally |

---

## 4. Login and Authentication UX

Authentication uses two completely separate login surfaces. Company users and Platform users must never see the same login page.

### 4.1 Company Login

**URL:** `app.bivro.io` or `{slug}.bivro.io`

**Visual identity:**
- Bivro wordmark, small, top-left or centered
- "Logging into [Company Name]" — this text must always be present. Users must always know which company workspace they are entering.
- Light background, clean form-centered layout

**Flow:**
1. Email input → Continue
2. Password input → Sign in
3. If MFA configured: MFA step (see §4.5)
4. Redirect to dashboard or intended URL

**Tenant routing:**
- If accessed via `{slug}.bivro.io`: company pre-selected, company name displayed immediately
- If accessed via `app.bivro.io` and user belongs to multiple companies (future V2 feature — not V1): company selector screen shown before dashboard
- In V1, each user belongs to exactly one company; no multi-company switching

**States:**
- Invalid credentials: "Incorrect email or password" — do not specify which is wrong
- Account locked: "Too many attempts. Try again in [N] minutes."
- Company suspended: redirect to suspended state page (§4.7)
- Company archived: redirect to archived state page (§4.8)

### 4.2 Bivro Platform Login

**URL:** `admin.bivro.io`

**Visual identity:**
- Distinctly different from Company Portal login — different background treatment, formal authority
- Persistent header: "BIVRO PLATFORM ADMINISTRATION"
- Subtext: "Authorized personnel only. All sessions are audited."
- No company name or company branding — this is a Bivro internal system

**Flow:**
1. Email input → Continue
2. Password input → Sign in
3. MFA step (enforced — not optional for Platform Portal)
4. Redirect to Platform Dashboard

**Security messaging:** Platform login always displays "This system is restricted to authorized Bivro staff. Unauthorized access is a policy violation." This is not a threat — it is a clear statement of access expectations.

**States:**
- Invalid credentials: same generic message as Company Portal (no specificity)
- MFA failure: "Incorrect code. [N] attempts remaining before lockout."
- IP not in allowlist (if configured): "Access denied from this location."

### 4.3 Invitation Acceptance

**URL:** `app.bivro.io/invite/[token]` (token is a one-time use, hashed server-side; see DATABASE_ARCHITECTURE.md §6.27)

**Invitation landing page:**
- "You've been invited to join [Company Name]"
- Invited by: "[Inviter Name]" (snapshotted at invitation time)
- Role: "[Office]" (V1 has only Owner and Office roles; invitations are always for Office)
- Invitation expires: "[Date and time]"
- CTA: "Accept and create your password"

**Password creation:**
- Password field + confirmation field
- Live strength indicator (weak / fair / strong / very strong)
- Requirements displayed inline (min length, complexity)
- On submit: account created, session established, redirect to dashboard

**First login experience after invitation:**
- Welcome screen: "Welcome to [Company Name] on Bivro"
- Visible role and permission summary: "Your access has been configured by [Owner name]"
- CTA: "Go to dashboard"

### 4.4 Password Reset

**Trigger:** "Forgot password?" link on login page

**Flow:**
1. Email input: "Enter your work email"
2. Submit: "If this email is registered, you'll receive a reset link."
   - Security principle: never confirm or deny existence of an account
3. Email received: link valid for 60 minutes, one-time use
4. Password reset page: new password + confirmation + strength indicator
5. On success: "Password updated. You're now signed in." → redirect to dashboard

### 4.5 Multi-Factor Authentication (MFA)

**Company Portal MFA (optional, configured by Owner):**
- TOTP code entry (6 digits)
- Auto-submit on 6th digit entry
- "Remember this device for 30 days" checkbox (configurable)
- Backup code option: "Use a backup code instead" → single-use code input
- "Lost access to authenticator?" → support contact link

**Platform Portal MFA (enforced, not optional):**
- Same TOTP flow, no "remember this device" option — platform sessions always require MFA
- MFA failure: lockout after 5 failures, requires security contact

### 4.6 Expired Invitation

**URL behavior:** accessing an expired invitation token redirects to a dedicated page

**Content:**
- "This invitation has expired"
- Expiry date displayed
- "Invitations expire after 7 days for security."
- CTA: "Request a new invitation" — opens a form to email the company contact, or displays the company's support contact
- Never display the expired token value or any account information

### 4.7 Suspended Company

**Trigger:** Bivro Platform marks a company as suspended (non-payment, policy violation, etc.)

**Owner experience:**
- Login succeeds (Owner can always log in)
- Post-login page (not dashboard): "Your Bivro account has been suspended"
- Reason displayed if company-facing reason was set
- "[Support email] · [Help center link]"
- No operational UI accessible
- No data visible

**Office user experience:**
- Login attempt: "This account is currently unavailable. Please contact your company administrator."
- No further detail

### 4.8 Archived Company

**Trigger:** Company has been archived (end of subscription, churned)

**Owner experience:**
- Login succeeds
- Post-login page: "This account has been archived"
- Data export request form available: "Request an export of your data"
- No operational UI accessible

**Office user experience:**
- "This account is no longer active."
- No access

### 4.9 Unauthorized Access (403)

**Trigger:** Accessing a URL the user's permissions do not allow

**Page:**
- Professional 403 page (not a generic server error)
- "You don't have permission to access this."
- [Go to dashboard] button
- No route information exposed (do not confirm or deny the route exists)
- WCAG-compliant, keyboard navigable

### 4.10 Session Expiration

**During active use (session expires while user is on page):**
- Non-blocking modal overlay: "Your session has expired for security. Sign in to continue."
- Current URL is preserved — after re-login, user is redirected back
- Form data in progress: warn that unsaved changes may be lost, offer to copy draft content

**On navigation (accessing page with expired session):**
- Redirect to login page with a single "Your session expired. Please sign in." banner shown once
- No repeated banners

**Platform Portal sessions:** Shorter duration than Company Portal sessions. Expiry handled identically but with stricter timeout (no "remember me" or extended sessions).

---

## 5. Responsive Strategy

Bivro targets four device classes. Responsiveness is not shrinking a desktop layout. Each device class has its own UX strategy.

### 5.1 Breakpoints

| Class | Range | Viewport reference |
|-------|-------|-------------------|
| Mobile | 0–767px | iPhone, Android phones |
| Tablet | 768–1023px | iPad, Android tablets |
| Laptop | 1024–1439px | 13" and 14" MacBook, Dell XPS, ThinkPad |
| Desktop | 1440px+ | External monitors, large displays |

**The laptop is the primary Bivro environment.** Design and test first at 1280×800 (13" laptop native resolution, standard scaling). Everything must work at this resolution without horizontal scroll, hidden critical content, or forced vertical scrolling through primary workflows.

### 5.2 Desktop (1440px+)

Optimized for: dispatch, planning, multi-panel workflows, data comparison, live operational overview.

- Full sidebar navigation with expanded labels and icons
- Dashboard: 3-column widget grid
- Multi-panel workflows available: quote builder with AI panel + live preview simultaneously visible
- Job detail: master-detail split (list left, detail right) without requiring navigation
- Wide tables: all columns visible, column resizing enabled
- Dispatch board: calendar view and crew assignment panel side-by-side
- Maximum content width: 1440px inner — avoid runaway line lengths on ultra-wide monitors

### 5.3 Laptop (1024–1439px)

This is the primary and most critical responsive breakpoint.

- Sidebar: icon-only by default (saves ~180px); labels on hover (tooltip) or on expand toggle
- Dashboard: 2-column widget grid; compact widget variants
- Quote builder: tabbed panels (AI panel in separate tab, not side-by-side)
- Tables: key columns visible, secondary columns hidden by default with a "Columns" toggle
- Maximum inner content width: 1024px — ensures readable line lengths at 13"
- No primary navigation items must require scroll in the sidebar

Critical targets at 1280×800 resolution:
- Primary navigation fully visible without scroll
- Dashboard's "attention required" section visible above the fold
- Quote builder line item table usable without horizontal scroll for standard columns
- Modal max-width: 640px — never touches screen edges

### 5.4 Tablet (768–1023px)

Optimized for: office mobility, customer consultation, quote review, operational overview.

- Primary navigation: bottom tab bar with 5 most-used items (Dashboard, Quotes, Jobs, Customers, More)
- "More" in bottom bar opens slide-out drawer with full navigation
- Dashboard: 2-column compact grid
- Quote review: full-screen optimized, horizontal scroll only for secondary columns
- Tables: max 4 columns visible; row tap opens drawer with full record
- Touch targets: minimum 44×44px for all interactive elements
- Customer consultation mode: quote summary presented in a clean, customer-facing-friendly layout
- Forms: comfortable field sizing, full-width inputs

### 5.5 Mobile (0–767px)

Optimized for: fast decisions, approvals, notifications, customer lookup, job overview, AI recommendations, urgent operational actions.

**Navigation:**
- Bottom tab bar: Dashboard, Quotes, Jobs, Notifications, More
- No sidebar — all navigation via bottom bar or slide-out drawer
- FAB (Floating Action Button, `ink-900`) for primary action on each screen

**Data presentation:**
- Tables never appear on mobile. All tabular data is replaced by card lists.
- Each card: primary identifier, status badge, 2–3 key fields, action button
- Cards use swipe-to-reveal for secondary actions (e.g., swipe left → archive, call)

**Modals:**
- No dialog modals on mobile. Use bottom sheets or full-screen overlays.
- Bottom sheets: slide up from bottom, drag handle, 3 snap points (40%, 80%, 100%)

**Forms:**
- Long forms presented as step sequences (one logical section per screen)
- Pull to refresh on lists
- Large touch targets on all actions (minimum 44×44px)

**AI Recommendations:**
- Card stack at top of dashboard
- Swipe to dismiss a recommendation
- "View All" expands to full list

**Approvals and urgent actions:**
- Full-width action buttons at bottom of screen
- Quote approval: large [Approve] [Reject] buttons with explicit summary above

**Quote review on mobile:**
- Summary card: total, service count, status, customer name, move date
- [Expand Line Items] reveals scrollable detail view
- Editing not available on mobile — read-only review with "Edit on desktop" guidance (V1)

**Operational data:**
- Recent activity feed replaces dense operational tables
- Job card: status, customer name, address, crew count, time window
- Tap job card → job detail full-screen overlay

---

## 6. Navigation Architecture

### 6.1 Company Portal Navigation

#### Primary Navigation (Left Sidebar)

The sidebar is the primary navigation. On desktop: full width with labels. On laptop: icon-only default with label on hover. On tablet and mobile: replaced by bottom bar.

**Navigation items (in order):**

| Item | Icon | Badge | Notes |
|------|------|-------|-------|
| Dashboard | Home | None | Always visible |
| Leads | Funnel | Unread/new count | Hidden if `leads.view` not granted |
| Customers | People | None | Hidden if `customers.view` not granted |
| Quotes | FileText | Draft/sent count | Hidden if `quotes.view` not granted |
| Jobs | Truck | Today's job count | Hidden if `jobs.view` not granted |
| Planning | Calendar | None | Dispatch/schedule view; hidden if `jobs.view` not granted |
| Invoices | Receipt | Overdue count | Hidden if `invoices.view` not granted |
| Bivro Intelligence | Sparkle (AI icon) | None | Hidden if `ai.view_suggestions` not granted |

Permission-aware rendering: navigation items for modules the user cannot access are **hidden**, not disabled. A user without `invoices.view` does not see "Invoices" in the nav. They do not see a disabled "Invoices" item.

**Sidebar footer (always visible):**
- Notifications bell + unread count
- Settings gear (items inside settings filtered by permission)
- User avatar + name + role — clicking opens account menu

#### Secondary Navigation (In-Page Tabs)

Context-specific tabs appear within the content area for modules with multiple views:

| Module | Tabs |
|--------|------|
| Leads | Active · Won · Lost · Archived |
| Quotes | All · Drafts · Sent · Accepted · Expired |
| Jobs | Today · Upcoming · Completed · Cancelled |
| Invoices | All · Draft · Sent · Paid · Overdue |
| Settings | Company · Services · Users · Permissions · Templates · Integrations |
| Bivro Intelligence | CEO Brief · Insights · Patterns · Coaching |

#### Breadcrumbs

Maximum 4 levels deep. Always clickable.

```
Customers > Liam Thompson > Quotes > Q-2041
Jobs > Today > J-0891 — Thompson Household Move
Settings > Users > Emma Clarke
```

Breadcrumbs appear below the page title, above the primary content area.

#### Global Search

**Keyboard shortcut:** `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux)

- Full-width overlay panel, elevation level 4
- Opens with input pre-focused
- Results grouped by entity type: Customers, Quotes, Jobs, Leads, Invoices
- Each result: entity name, status badge, key metadata (customer name, date, amount)
- Recent items shown without typing (last 8 visited entities)
- No-results state: "No results for '[query]'" + "Try: New Customer, New Quote"
- Permission-aware: returns only entities the user can access
- Search never leaks hidden data: a user without `invoices.view` does not see invoice results

**Search keyboard behavior:**
- Arrow keys navigate results
- Enter opens selected result
- Escape closes search
- Tab cycles through result groups

#### Command Palette (Power User Extension)

Accessed via same `Cmd+K` shortcut; command mode triggered by typing `/`:

| Command | Action |
|---------|--------|
| `/new-quote` | Open new quote builder |
| `/new-customer` | Open new customer form |
| `/new-lead` | Open new lead form |
| `/new-invoice` | Open new invoice form |
| `/settings` | Go to settings |
| `/help` | Open help center |

#### Quick Create Button

`+` button in navigation chrome, top-right (desktop/laptop) or FAB (mobile).

Opens a minimal drawer with quick-create options:
- Quote
- Customer
- Lead

Quick-create forms are abbreviated versions of full forms — capture the minimum required fields, with a "Complete details" link to the full form.

#### Recent Items

Last 8 visited entities, shown in Global Search without typing. Stored in `localStorage`, cleared on logout. Never stored server-side (privacy: recent items are local to the browser session).

### 6.2 Platform Portal Navigation

The Platform Portal has a completely separate navigation structure. It is designed for Bivro internal staff managing the platform itself.

**Primary navigation items (left sidebar):**

| Item | Notes |
|------|-------|
| Overview | Platform dashboard: tenant health, revenue, support queue |
| Companies | Tenant management: search, filter, view, manage company accounts |
| Subscriptions | Subscription plan management and company subscription status |
| Support Access | Break-glass access log; initiate, extend, terminate support sessions |
| Audit Log | Platform audit trail (hash-chained, read-only; see PLATFORM_ADMIN.md §11) |
| Platform Users | Bivro internal staff accounts and roles |
| Roles & Permissions | Platform role configuration (8 platform roles; see PLATFORM_ADMIN.md §2) |
| Billing & Finance | Subscription revenue, invoices, Stripe data |
| System Health | Uptime, error rates, database health, AI cost tracking |
| Reports | Platform-level analytics and export |

**Navigation chrome — persistent platform indicator:**
- "BIVRO PLATFORM ADMIN" text chip built into the top of the sidebar — not a dismissible banner
- Current platform user's name and platform role displayed in sidebar footer
- Session duration indicator

**Role-based nav visibility:** Platform navigation items are shown or hidden based on the authenticated platform user's role permissions (see PLATFORM_ADMIN.md §2.2 for the platform permission matrix).

---

## 7. Dashboard Experience

### 7.1 Philosophy

The dashboard's single most important function: **tell the user what needs their attention right now.**

It is not a wall of charts. It is not a status report. It is an intelligent briefing that updates in real time.

A dashboard where the user immediately knows what to do next has succeeded. A dashboard where the user has to interpret 12 charts to figure out what is wrong has failed.

### 7.2 Dashboard Layout

The dashboard is organized in a priority hierarchy. Items at the top are the most time-sensitive or highest-value. Charts and analytics are at the bottom.

**Section 1: AI CEO Brief** (see §9.9)
- Collapsible panel at the top
- Once read and collapsed, it stays collapsed until the next day's brief is generated
- First open of the day: expanded by default

**Section 2: Attention Required**
- Only surfaces items that genuinely require action — not every active record
- Examples: quote awaiting approval, job missing crew assignment, overdue invoice, AI recommendation flagged as urgent, critical data incomplete
- Empty state: "Nothing requires your attention right now." — celebrated with a subtle success indicator
- Items sorted by: time-sensitivity, then business impact
- Each item: entity type + brief description + CTA button + time indicator ("2 hours ago", "Overdue by 3 days")

**Section 3: Today's Operations**
- Compact timeline of today's jobs
- Crew deployment summary: "3 crews active · 2 vehicles in field · 1 vehicle at depot"
- Live via Supabase Realtime (see ARCHITECTURE.md §10)
- Click any job → opens job detail drawer

**Section 4: Quote Follow-ups**
- Quotes sent but not responded to, sorted by send date (oldest first)
- "Quote Q-2041 sent to Thompson Family · 5 days ago · No response"
- CTA: [Send Reminder] [Mark as Won] [Mark as Lost]
- Appears only if user has `quotes.view` and `quotes.send`

**Section 5: Business Health**
- Compact KPI row (not full charts): Revenue this month, Quotes sent, Jobs completed, Average margin (if `quotes.view_cost_price` granted)
- Sparkline trend per metric (last 30 days)
- Tapping/clicking any KPI goes to the corresponding analytics view

**Section 6: Profit Opportunities** (AI-driven, collapsible)
- AI-identified revenue and efficiency opportunities
- Visually distinct: `ai-100` background panel, AI icon
- Examples: "3 customers who moved 12 months ago — follow up for repeat move", "Your average discount on long-distance jobs is 18% — industry average is 9%"
- [View All] expands full Profit Leak analysis (Enterprise tier)

### 7.3 Owner vs. Office Dashboard

Owner dashboard: full access to all sections including financial KPIs.

Office dashboard: sections filtered by effective permissions:
- Without `analytics.view_financial`: Business Health hides revenue and margin; shows only operational metrics
- Without `quotes.view`: Quote Follow-ups section hidden
- Without `jobs.view`: Today's Operations hidden

The dashboard layout adapts silently — no "you don't have permission to see this section" messages. Sections simply aren't rendered.

### 7.4 Dashboard Breakpoint Behavior

| Breakpoint | Layout |
|------------|--------|
| Desktop (1440px+) | 3-column grid for Health KPIs; 2-column for Today's Ops + Quote Follow-ups |
| Laptop (1024–1439px) | 2-column grid; compact card variants |
| Tablet (768–1023px) | 2-column compact; Touch-friendly KPI cards |
| Mobile (0–767px) | Single column; AI CEO Brief as a compact card; Attention Required prominent; heavy summarization |

---

## 8. Quote Creation Experience

Quote creation is Bivro's flagship workflow. It must be the best moving company quoting experience ever built for this industry.

### 8.1 Three Quoting Modes

(As defined in PRODUCT_REQUIREMENTS.md §2.1 — frozen)

**Manual:** Operator builds the quote entirely. Grid-based line item editor. No AI involvement unless explicitly triggered. For operators who want complete control or for atypical jobs.

**AI-Generated:** Operator provides job details. AI generates a complete draft (services, quantities, hours, pricing). Operator reviews and approves or edits. AI quote is always a starting point.

**Hybrid (recommended default):** AI generates a draft based on intake. Operator reviews and adjusts. AI handles the 80%, human handles the 20%.

The mode is selectable at quote creation. The default mode is configurable in Settings → Company.

### 8.2 Quote Creation Entry Points

- "New Quote" from sidebar
- Quick create from `+` button
- From a Customer record: "Create Quote"
- From a Lead record: "Convert to Quote"
- From a Job record: "Create Additional Quote"

### 8.3 Quote Builder — Intake Flow

The quote builder is a guided multi-step process, not a single enormous form.

**Step 1 — Customer + Date**
- Customer select (search existing) or "Create new customer" inline
- Move date (date picker with time window: morning / afternoon / full day)
- Move type: Local (same metro) / Long-Distance (different city or region)
- Urgency: Standard / Rush (within 48 hours)

**Step 2 — Origin Address**
- Address autocomplete
- Floor number (numeric)
- Elevator available? (toggle)
- Elevator reservation required? (toggle, visible when elevator = yes)
- Parking situation: Street (easy) / Street (difficult, permit needed) / Private driveway / Loading dock / No parking nearby
- Distance to truck / entrance (meters or feet, based on company locale setting)
- Special access notes (freetext)

**Step 3 — Destination Address**
- Same fields as Origin
- "Same as origin" toggle (for storage deliveries or returns)

**Step 4 — Inventory + Special Items**
- Property type: Studio / 1BR / 2BR / 3BR / 4BR+ / Commercial / Office
- Approximate item volume (AI uses this to estimate crew and hours)
- Checkbox list for special items: Piano / Safe / Artwork / Antiques / Large appliances / Pool table / Gym equipment / Other
- Freetext inventory description field (optional, enhances AI accuracy)
- Estimated packing need: None / Partial (fragile items only) / Full service packing

**Step 5 — AI Analysis + Line Items**
This is the primary quote editing surface. See §8.4.

**Progress indicator:**
- Horizontal step bar at top (Steps 1–5)
- Steps completed show a check
- User can navigate back to any completed step
- Forward navigation requires current step to be valid

### 8.4 Quote Editing Surface (Step 5)

**Layout (laptop/desktop):**
- Left: Quote line item table (70% width)
- Right: AI Analysis panel (30% width)

**Layout (tablet):** AI panel becomes a collapsible bottom sheet triggered by "AI Analysis" button

**Layout (mobile):** Quote summary card + expandable line items; AI panel is a separate tab

#### Line Item Table

Each row is one line item on the quote.

| Column | Description | Notes |
|--------|-------------|-------|
| Service | Service name from catalog or custom | Autocomplete from service catalog |
| Quantity / Hours / Distance / Fixed | Value for the pricing mode | Shows only the relevant field per pricing mode |
| Unit Price | Sell price per unit | Editable by users with `quotes.change_pricing` |
| VAT | VAT rate applied | Dropdown; defaults to company VAT setting |
| Discount | Percentage or fixed amount | Requires `quotes.apply_discount` |
| Line Total | Computed: qty × unit price - discount + VAT | Read-only, updates live |
| Actions | Reorder (drag handle) · Delete | — |

**Cost price row (permission-gated):**
Visible only to users with `quotes.view_cost_price`:
| Cost Per Unit | Total Cost | Margin % | Margin Amount |

Margin is always computed, never stored: `margin_percent = (sell - cost) / sell × 100`. (See DATABASE_ARCHITECTURE.md P9 — no stored derived fields.)

**Adding line items:**
- "Add Service" opens service catalog selector (searchable, filtered by pricing mode)
- "Add Custom Item" opens a blank line item row for one-off entries
- Drag to reorder line items
- Keyboard shortcut: `Tab` from last field of a row → opens new row

**Service catalog sidebar:**
- Searchable list of all company **active** services (default + custom) — inactive services do not appear here
- Filter by category (Labor, Materials, Surcharges, Specialty, Transport)
- Click service → appends a new line item pre-filled with the catalog's default pricing mode, unit price, and VAT rate
- Catalog prices are editable per quote — editing a price on a quote never changes the catalog's default price
- If the AI recommends an inactive service, a distinct suggestion card appears: "Add [Service Name] — currently inactive in your catalog. [Add to Quote] [Reactivate in Settings]"

**VAT handling:**
- VAT is applied per-line (different services may have different VAT rates)
- Company default VAT rate pre-fills; adjustable per line
- VAT total displayed in the financial summary separately

#### Live Financial Summary

Pinned to the right of the line item area (desktop) or below the table (mobile).

| Field | Visibility |
|-------|-----------|
| Subtotal (before VAT/discount) | All users with `quotes.view` |
| Total Discount | All users with `quotes.view` |
| VAT | All users with `quotes.view` |
| **Total (to customer)** | All users with `quotes.view` |
| Estimated Total Cost | `quotes.view_cost_price` only |
| Estimated Gross Profit | `quotes.view_cost_price` only |
| Estimated Margin % | `quotes.view_cost_price` only |

All values update in real time as line items are edited. No refresh required.

Financial fields are never rendered as empty placeholders for users without the permission — they are entirely absent from the DOM.

### 8.5 AI Quote Coach (Right Panel)

The AI panel is the embedded AI Quote Coach. It analyzes the quote in real time and surfaces recommendations, warnings, and observations.

**Panel states:**
- `ai-thinking`: "Bivro is analyzing your quote..." with pulsing teal indicator — appears after any significant input change
- `ai-ready`: Recommendation summary loaded
- `ai-idle`: No analysis pending (new blank quote before input)

**Primary recommendation block:**
```
Bivro suggests:
  5 employees · 7.5 estimated hours
  Based on 42 similar jobs from your company
  Confidence: High

  [Apply Recommendation] [Modify] [Why?]
```

**Inline warnings (AI Warning pattern):**
- "This quote is 31% below your average for a 3BR local move."
- "Stair surcharge may be applicable — you indicated 4 flights."
- "No travel time included for this distance."

**Inline observations:**
- "You usually add 1 hour buffer to piano-included moves. Not currently included."

**Applying AI recommendations:**
- [Apply All]: replaces relevant line items with AI recommendations
- [Apply Selected]: checkbox each recommendation to apply individually
- Applying always shows what changed with a brief diff indicator
- Any AI-applied value is immediately editable — no locked AI values

**Why? Interaction:**
Clicking "Why?" opens an expanded panel:
- Primary data source: "42 similar jobs from your company in the last 12 months"
- Key factors used:
  - Property type: 3BR apartment
  - Floors: 4 (no elevator)
  - Special items: None
  - Move distance: 12km
- Assumptions made: "Standard parking conditions at both addresses"
- What would improve this estimate: "More completed jobs in your history, updated cost prices in your service catalog"
- Company pattern match: "High — this matches your most common job type"

### 8.6 Quote States and Actions

| State | Description | Available actions |
|-------|-------------|------------------|
| Draft | Being edited | Save, Preview, Send |
| Sent | Emailed to customer | Resend, Mark Won, Mark Lost, Duplicate |
| Accepted | Customer accepted | Create Job, Duplicate |
| Expired | Validity period passed | Duplicate, Archive |
| Archived | Manually archived | Restore, Duplicate |

**Sending a quote:**
- [Send Quote] button in quote header
- Requires `quotes.send` permission
- Preview of quote email shown before sending
- Customer email pre-filled from customer record; editable before send
- Optional cover message field

**Auto-save:** Quote drafts auto-save every 30 seconds. "Draft saved [time]" indicator bottom-left. Draft survives browser close.

---

## 9. Bivro Intelligence UX Patterns

AI must not exist only as a chatbot. Bivro Intelligence is embedded throughout the product. These are the reusable UI patterns that compose the AI experience.

Every AI element uses the AI-exclusive color family (`ai-*` tokens). No non-AI element uses teal. The visual distinction is maintained rigorously.

### 9.1 AI Recommendation Card

The primary AI output component. Used when AI has a specific, actionable recommendation.

**Structure:**
```
┌─────────────────────────────────────────────┐
│ ✦ Bivro Intelligence          Confidence: High │ ← ai-100 background, ai-600 border
├─────────────────────────────────────────────┤
│ Recommendation headline (1-2 sentences,     │
│ plain language — no jargon)                 │
│                                             │
│ "Based on 42 similar jobs from your company"│ ← Evidence summary
│                                             │
│ [Accept]  [Modify]  [Dismiss]  [Why?]       │
└─────────────────────────────────────────────┘
```

**States:**
- Default: full card shown
- Dismissed: collapses to ghost line "Suggestion dismissed · Undo" (5 second undo window)
- Accepted: brief check animation at `ai-400`, then card integrates into the form data and disappears

**Rules:**
- Never block workflow — always dismissible
- "Accept" never applies irreversible changes without a visible diff
- "Modify" opens the edited element inline; AI-suggested value shown as starting point

### 9.2 AI Observation

Passive insight. No immediate action required. Does not change any data.

**Structure:**
- Smaller than Recommendation Card
- `ai-100` background, `ai-600` 3px left border
- `ai-400` sparkle icon
- Observation text in `body` size
- [Got it] to dismiss | No action required

**Example:** "You typically schedule 5-person crews for 3-bedroom moves."

**Rule:** Once dismissed, this specific observation is never shown again in the same context.

### 9.3 AI Warning

AI has detected something that may be a problem. User can always proceed.

**Structure:**
- `ai-warm-500` (amber-teal) border, dotted border style (distinct from operational warnings)
- Warning icon + bold headline
- Warning body
- [Review] [I'm aware — proceed]

**Example:** "This quote is 34% below your average for similar jobs."

**Rule:** Never blocks the user. "I'm aware — proceed" always exists. Warning is recorded in audit log as acknowledged.

### 9.4 AI Opportunity

AI has identified a business opportunity.

**Structure:**
- `ai-600` border, teal upward-arrow indicator
- Opportunity headline
- Business impact estimate if available ("Est. ~$X revenue opportunity")
- [View Details] [Remind Me Later] [Dismiss]

**Example:** "3 customers who moved last year haven't rebooked. A follow-up could convert to repeat moves."

### 9.5 Confidence Display

AI confidence is displayed using a qualitative label with brief context. Never a raw number.

| Score range | Label | Visual treatment | Accompanying context |
|-------------|-------|-----------------|---------------------|
| 90–100 | "Very High" | Solid `ai-400` chip | "Based on 100+ similar jobs" |
| 70–89 | "High" | Solid `ai-400` chip, secondary style | "Based on 42 similar jobs" |
| 50–69 | "Moderate" | `ai-warm-500` chip | "Based on 12 similar jobs — limited history" |
| 30–49 | "Low" | `ai-warm-500` dotted chip | "Based on fewer than 10 jobs — early estimate" |
| 0–29 | Not surfaced as recommendation | Shown only as Observation with explicit uncertainty | "Insufficient history for a reliable estimate" |

**Rule: Never create false precision.** "High" is better than "87%". Confidence labels are calibrated to what a human would say out loud.

Low-confidence recommendations use:
- Dotted border instead of solid
- `ai-warm-500` amber-teal tones instead of full teal
- Larger, more prominent disclaimer text
- "I'm less certain here — here's why:" before the reasoning

### 9.6 AI Reasoning — "Why?" Interaction

Every AI recommendation has a "Why?" button. This is a core trust-building mechanism.

When activated, "Why?" expands an information panel:

**Structure:**
```
Why I recommended this:
────────────────────────────────────
Primary basis:
  "42 similar jobs in your company (last 12 months)"

Factors I considered:
  • Property type: 3-bedroom apartment
  • Floor access: 4 flights, no elevator
  • Special items: None
  • Distance: 12km local move

Assumptions I made:
  • Standard parking at both addresses
  • No furniture disassembly needed
  • Average crew speed (your company baseline)

What would change this:
  • Updated cost prices in your service catalog
  • More completed jobs of this type in your history
  • Explicit inventory details if provided

Company pattern match:
  • High — this is your most common job type
  • Last 5 similar jobs: actual hours ranged 6.5 – 8.5 hrs
────────────────────────────────────
[Close]
```

**Rules:**
- "Why?" is always present on Recommendation Cards
- Reasoning text uses plain language, not ML terminology
- Never reference other companies' data
- If a factor was NOT available, say so: "Distance was estimated from postal codes — not confirmed street addresses"

### 9.7 AI Learning Confirmation

When the AI has observed a repeated deviation from its suggestion, it asks to adapt.

**Trigger:** User has overridden the same type of recommendation 5+ times.

**Interaction:**
```
┌──────────────────────────────────────────┐
│ ✦ Should I adjust future suggestions?   │
│                                          │
│ You've adjusted my crew recommendation   │
│ for 3BR local moves 8 times.             │
│                                          │
│ Should I adapt to suggest one more crew  │
│ member for this job type by default?     │
│                                          │
│ [Yes, adapt]  [No — keep as is]  [Remind me again] │
└──────────────────────────────────────────┘
```

**On "Yes, adapt":**
- Confirmed learning: "Bivro has updated its suggestions for 3BR local moves. You can review and edit learned patterns in Settings → Bivro Intelligence."
- Pattern added to Confirmed Patterns (AI Memory Tier 1; see AI_ENGINE.md §5)

**On "No — keep as is":**
- Override recorded but not learned — AI continues to suggest its previous recommendation
- Message: "Understood. I'll continue making my original suggestion."

**Rule:** Never use ML terminology like "training", "model", "algorithm". Use plain language.

### 9.8 AI Monthly Evolution Report

A monthly digest of AI learning progress, surfaced as a notification + detail panel.

**Where:** Bivro Intelligence section → "Monthly Reports" tab

**Contents:**
- "This month's highlights" — plain prose summary
- Patterns confirmed this month (new + updated)
- Recommendations made vs. accepted vs. overridden — ratio
- Notable business observations detected
- Accuracy trend: "My price estimates were within 8% of actual on average, compared to 15% last month"
- Opportunities identified that were acted on

**Tone:** Conversational, honest, specific. Not a metrics dump.

**Who sees it:** Owner always. Office users with `ai.view_suggestions`.

### 9.9 AI CEO Brief

A morning briefing generated fresh each day. Appears at the top of the dashboard.

**Characteristics:**
- Generated at a scheduled time (configurable; default: 7:00 AM company local time)
- 3–5 sentences of plain prose
- Specific to this company's data only
- Attributions at bottom: "Generated at 7:03 AM · Based on your last 90 days · Powered by Bivro Intelligence"

**Example:**
```
Good morning, Alex. Today you have 4 jobs running across 3 crews. 
Quote Q-2041 for the Harrison move has your highest margin this week at 38%. 
Two quotes sent 5+ days ago haven't received a response — a quick follow-up 
today could close them. Your average job completion time improved 14% this 
month compared to last month.
```

**Expanded view:** Tapping "See details" expands with linked items (e.g., tapping the quote name → opens that quote).

**Collapsed state:** Once read, collapses to a one-line summary. Re-expands on tap. Next day's brief replaces it.

**Low-history state:** "Bivro is still learning your company's patterns. Briefs will become more specific after your first 20 completed jobs."

### 9.10 AI Replay

Available in: Job detail → "AI Replay" tab (after job is completed)

A retrospective of AI recommendations vs. actual outcomes on a completed job.

**Structure:**
- Timeline of the job from quote creation to completion
- At each AI decision point: what AI recommended, what the operator chose, what actually happened
- Outcome comparison: AI forecast vs. actual (hours, crew, revenue, profit if permitted)
- Learning output: "AI's labor estimate was 12% off on this job. Pattern has been recorded."

**Purpose:** Builds trust through transparency. Users understand why Bivro makes the suggestions it does and see that it is learning.

### 9.11 AI Simulation

**Tier:** Enterprise only (see AI_ENGINE.md §11)

Allows operators to model "what if?" scenarios before committing to a decision.

**Examples:**
- "What if I increase my crew size from 4 to 5 on this job type?"
- "What if I raise my standard moving rate by 10%?"

**Structure:**
- Input: current scenario (auto-filled from company data)
- Adjustment controls: change a variable
- Output: projected impact (revenue, cost, margin, estimated hours, customer price)
- Comparison: current vs. simulated side-by-side

### 9.12 AI Profit Leak Detection

AI continuously analyzes company data and surfaces identified inefficiencies.

**Where:** Bivro Intelligence → Profit Opportunities tab

**Structure per identified leak:**
```
📍 Discount rate too high on long-distance moves

Your average discount: 18%
Industry reference: 8–12%
Estimated revenue impact: ~$1,200/month

Based on: 23 long-distance quotes from the past 6 months

[View Quotes]  [Adjust Pricing]  [Dismiss]
```

**Tone:** Factual, opportunity-framed, never accusatory.

### 9.13 AI Quote Coach

Real-time advisory during quote creation. Lives in the AI Analysis right panel (§8.5).

**Behavior:**
- Activates as soon as job details are entered
- Updates with each significant input change
- Surfaces missing information: "You haven't added a stair surcharge — you indicated 4 flights."
- Flags inconsistencies: "Your crew estimate seems low for 4 bedrooms + 4 flights."
- Suggests services: "For a 3BR with full packing, you may want to add Packing Materials."
- Never blocks quote entry; always advisory

---

## 10. Company AI Brain UX

Each company has an isolated AI Brain. The UX communicates this clearly, accessibly, and without technical jargon.

**The core message:** "Bivro learns how your company works."

Never reference machine learning, neural networks, models, or training. Always speak in outcomes: "I noticed you usually add one hour to moves of this type."

### 10.1 AI Brain Settings

**Location:** Settings → Bivro Intelligence (Owner only)

**Four panels:**

#### Panel 1: Learned Patterns

List of patterns AI has confirmed from the company's history.

```
Moving Labor — 3BR Apartment
  "4 crew members · 5.5 hours average"
  Based on: 42 completed jobs · Last updated: 2 weeks ago · Confidence: High
  [Review Details]  [Delete]
```

Owners can delete individual patterns. Deleting a pattern does not delete the underlying job data — only the learned pattern is removed. AI will re-derive it if future data supports it.

#### Panel 2: Proposed Learning

Patterns AI has observed but not yet confirmed as company behavior.

```
Difficult parking adjustment
  "You tend to add 45 minutes when parking is marked Difficult (observed in 8 of 12 jobs)"
  [Accept as pattern]  [Reject]  [Ask me again in 30 days]
```

#### Panel 3: Memory Transparency

A plain-language summary of what data Bivro has learned from:

```
Bivro's suggestions for your company are based on:
  • 67 completed jobs
  • 91 quote outcomes (accepted / lost)
  • 213 AI recommendations reviewed
  • 34 accepted recommendations
  • 52 modified recommendations
  • 18 rejected recommendations

Your data never affects suggestions for any other company.
```

This panel is always visible. There is no "hide" option. Transparency about the data basis is a product principle.

#### Panel 4: Data Controls

```
[Reset learned patterns]
  Clears all confirmed patterns. AI will relearn from your existing job history.
  Your job records, quotes, and customers are not affected.

[Delete all Bivro memory for this company]
  ⚠ Permanent. All patterns, observations, and learning events will be deleted.
  AI suggestions will revert to industry defaults until enough data is relearned.
  Type your company name to confirm: ___________
```

Both actions require explicit Owner confirmation. Both actions are logged in the company's activity log.

### 10.2 Cold Start UX

A new company has no historical data. AI cannot provide company-specific recommendations.

**Honest cold-start messaging:**
- Never show a confident recommendation without data to support it
- Industry defaults are used until company data accumulates
- Every AI output during cold start is labeled: "Industry default · Not yet company-specific"

**Progress communication:**
```
Bivro is learning your company
━━━━━━━━━━━━━━━━━━━━━━━━━━━
3 / 20 learning jobs completed

After approximately 20 completed jobs, Bivro's suggestions 
will become specific to how your company works.
```

### 10.3 AI Confidence Maturity States

| Jobs completed | AI state label | UI treatment |
|----------------|---------------|-------------|
| 0–5 | "Using industry defaults" | Amber observation label on all AI output |
| 6–15 | "Starting to learn" | Low-confidence indicators, specific disclaimers |
| 16–30 | "Learning in progress" | Moderate confidence, improving |
| 31–60 | "Company patterns emerging" | High confidence on established patterns |
| 60+ | "Deep company knowledge" | Full confidence on well-established patterns |

### 10.4 Correction UX

When a user overrides an AI-generated value:

- A subtle "Did I get this wrong?" UI element appears in the AI panel (not intrusive — small, dismissible)
- [Yes, remember this] → triggers AI Learning Confirmation (§9.7)
- [No, one-time change] → override recorded as feedback but AI does not adapt
- No response → override recorded as implicit feedback after 30 seconds

---

## 11. Permission-Aware UX

### 11.1 The Four Permission States

The UI responds to effective permissions in four ways. The Owner never encounters states 1–4.

**State 1 — Hidden**
The element does not exist in the UI. Used when the user lacks `view` access to a module or data type.
- Examples: Invoice module in nav (no `invoices.view`), cost price column in quote table (no `quotes.view_cost_price`)
- Rule: Never render a skeleton, empty placeholder, or "coming soon" for hidden content. Absence is the signal.
- Rule: Never expose the existence of hidden content through DOM, aria labels, or search results.

**State 2 — Read-Only**
The user can see the content but not modify it. Used when the user has `view` but not `edit`/`create`/`delete` permission.
- Examples: Viewing a customer record without `customers.edit` — all fields shown, all edit controls absent
- Editing controls are absent (not disabled) — the edit button doesn't exist, not just grayed out
- Exception: A single "View" CTA may exist where a user might otherwise expect an action; it navigates to the detail view

**State 3 — Disabled with Explanation**
The user can see an action but cannot perform it. Used sparingly — only when the user is likely to expect the action and needs to understand why it is unavailable.
- Tooltip (not modal): "Requires the quotes.send permission. Contact your administrator."
- Never say "you don't have permission" — say "this action requires [permission name]"
- Use this for mid-workflow permission walls where the user has already invested effort

**State 4 — Request Approval**
For high-value actions that the Owner can grant on the fly. Not implemented in V1. Reserved for V2+ escalation workflows.

### 11.2 Information Leak Prevention

Permission checks must extend to every data surface, not just the primary UI.

| Surface | Rule |
|---------|------|
| Table columns | Cost price / margin columns not rendered for users without `quotes.view_cost_price` — not hidden by CSS, absent from DOM |
| Search results | Results filtered to entities the user can access; invoice results absent for users without `invoices.view` |
| Global search | Searching a customer name does not surface invoice totals without `invoices.view` |
| AI responses | AI prompt includes the user's effective permissions; AI omits cost/financial language for users without `quotes.view_cost_price` |
| Notifications | Notification text never includes cost, margin, or financial data |
| Exports | Exports filtered by effective permissions; cost/margin columns excluded if user lacks `quotes.view_cost_price` |
| URL direct access | Accessing `/invoices` without `invoices.view` returns a permission 403 page — not a blank layout |
| Mobile cards | Summary cards never include cost/margin data without permission — no matter how abbreviated the card |
| API responses | tRPC procedures enforce permission server-side; client-side checks are display-only defense-in-depth |

### 11.3 Owner UX Rules

- Owner never sees permission dialogs
- Owner never sees disabled states caused by permissions
- Owner never sees the permission state explanations shown to Office users
- Every feature, every record, every setting is fully accessible to Owner
- Owner UI is the full product — the "unrestricted" path has no UI artifacts from the permission system

### 11.4 Permission Group UI

**Location:** Settings → Permissions (requires `settings.permissions`)

**Permission Group Management:**
- Create named groups: "Dispatcher", "Estimator", "Finance"
- Each group: list of toggles organized by resource (as defined in PRODUCT_REQUIREMENTS.md §3.3)
- Toggle: on = permission granted to group members
- Visual grouping matches the permission catalogue structure (Customers, Leads, Quotes, Jobs, Employees, Vehicles, Invoices, Payments, AI Features, Analytics, Settings)

**User assignment:**
- Office user profile: "Permission Groups" multi-select
- Individual overrides: per-permission grant/deny on top of group settings
- Effective permission summary shown at bottom of user profile: "This user can: [list of effective permissions]"

---

## 12. Core Component Catalog

### 12.1 Buttons

**Variants:**

| Variant | Use | Visual |
|---------|-----|--------|
| Primary | The single most important action on a surface | Filled `ink-900` background, white text |
| Secondary | Secondary actions | `ink-900` border, `ink-900` text, transparent background |
| Ghost | Tertiary, contextual actions | No border, `ink-700` text, transparent background |
| Danger | Destructive actions | Filled `danger-700` background, white text |
| AI Action | AI-specific actions (Accept recommendation, Apply AI, etc.) | Filled `ai-600` background, white text |
| Link | Inline text actions | No visual button; text in `signal-600`, underline on hover |

**Sizes:**

| Size | Height | Padding | Font size | Use |
|------|--------|---------|-----------|-----|
| Small (sm) | 28px | 8px horizontal | 13px | Compact tables, inline actions, badges |
| Medium (md) | 36px | 16px horizontal | 14px | Default, most contexts |
| Large (lg) | 44px | 20px horizontal | 15px | CTAs, mobile primary actions |

**States (all variants):**
- Default
- Hover: brightness shift +5%, 80ms ease-out
- Pressed/Active: brightness shift -5%
- Disabled: 40% opacity, `cursor: not-allowed`
- Loading: spinner replaces label text; button width preserved; click blocked

**Rules:**
- Never use "Submit" as button label — use the action verb: "Send Quote", "Save Changes", "Create Customer", "Delete Record"
- Only one Primary button per view section — never two primary buttons side by side
- Destructive button never appears as the most prominent action; always secondary to the cancel/safe path
- Loading state must be set immediately on click to prevent double-submission

### 12.2 Text Inputs

**Height:** 36px (default), 44px (large — tablet-optimized forms)

**Structure:**
```
[Label — always above, never inside]
[Input field]
[Helper text or inline error — below]
```

**States:**
- Default: `ink-500` border, `surface-sunken` background
- Focus: `signal-600` 2px ring, border brightens
- Filled: `ink-900` text
- Disabled: grayed background, `cursor: not-allowed`, `aria-disabled="true"`
- Error: `danger-700` border, error icon, inline error text below
- Success (used sparingly, e.g., username availability): `success-700` icon right of field

**Rules:**
- Label always above the input. Never use placeholder-as-label.
- Placeholder text shows format hint only: "e.g., john@example.com" or "YYYY-MM-DD"
- Never rely on placeholder for required information — placeholder disappears on focus

### 12.3 Address Input

Address entry is a specialized component used throughout Bivro (quote intake, customer records, company settings).

**Structure:**
1. Address line 1 (autocomplete via geocoding)
2. Address line 2 (optional, unit/apt)
3. City (auto-filled from geocode)
4. State/Province (auto-filled)
5. Postal code (auto-filled)
6. Country (dropdown, auto-filled)

**After address is entered:**
7. Floor number (numeric input)
8. Elevator available (yes/no toggle)
9. Elevator reservation needed (appears only when elevator = yes)
10. Parking situation (Easy / Moderate — permit required / Difficult / Loading dock)
11. Distance to truck/entrance (numeric, unit label: "meters" or "feet")
12. Access notes (freetext, optional)

**Autocomplete behavior:**
- Suggestions appear after 3 characters
- Keyboard-navigable dropdown
- Selecting a suggestion auto-fills city, state, postal, country
- "Can't find your address? Enter manually" option

### 12.4 Date and Time Pickers

**Date picker:**
- Calendar panel opens on click/focus
- Also accepts typed input: YYYY-MM-DD, MM/DD/YYYY (locale-aware)
- Previous/next month navigation
- Today button
- Date range picker variant for report filters (same component, range mode)
- Keyboard: arrow keys navigate days, Enter selects, Escape closes

**Time picker:**
- Hour:Minute dropdowns (12h or 24h based on company locale setting)
- Also accepts typed time
- Time window selector variant: [Morning (8–12)] [Afternoon (12–17)] [Full Day] [Custom time]

### 12.5 Select and Combobox

**Select:** Native-styled dropdown for a small fixed list (<20 options)
**Combobox:** Searchable select for longer or dynamic lists (service catalog, customer search, employee assignment)

**Combobox behavior:**
- Text input triggers search (minimum 1 character)
- Results appear in floating panel, elevation 3
- Keyboard: arrow keys navigate, Enter selects, Escape closes
- "No results" state with optional "Create new" link
- Multi-select combobox: shows selected items as chips inside the input

### 12.6 Tables

See Section 13 for full table UX specification.

### 12.7 Drawers

Right-side slide-in panel. Used for: record details, quick edits, AI analysis, support panels.

**Widths:**
- Narrow (320px): notification details, quick actions
- Standard (440px): most record detail drawers
- Wide (640px): quote review, complex AI analysis, settings panels

**On desktop/laptop:** slides in from right, overlays content with a backdrop (not full-screen)
**On tablet:** same as desktop
**On mobile:** becomes a bottom sheet (see §12.9)

**Behavior:**
- Backdrop click → closes if no unsaved changes; prompts if changes exist
- Escape key → same as backdrop click
- `×` button always present in drawer header
- Focus trapped inside drawer while open
- `aria-modal="true"` — screen reader does not interact with background content

### 12.8 Modals

Center-screen overlays. Used for confirmations, forms that must be completed before proceeding, and critical alerts.

**Sizes:**
| Size | Width | Use |
|------|-------|-----|
| Small (sm) | 360px | Simple confirmations, 1–2 fields |
| Medium (md) | 480px | Short forms, permission explanations |
| Large (lg) | 640px | Medium-complexity forms, multi-step confirmations |
| Extra large (xl) | 800px | Complex forms, full document previews |

**Behavior:**
- Always centered, vertically ~30% from top
- Backdrop dims page content; backdrop click closes (unless unsaved changes)
- Escape key closes
- Focus trapped inside modal
- `aria-modal="true"`, `role="dialog"`, `aria-labelledby` pointing to modal heading
- Never scrolls content behind modal

**On mobile:** Modal becomes full-screen sheet

### 12.9 Bottom Sheets (Mobile and Tablet Only)

- Slides up from bottom of screen
- Drag handle bar at top (affordance for dismissal)
- Three snap points: 40% (peek), 80% (standard), 100% (full screen)
- Backdrop dims content behind; tap backdrop to dismiss
- Drag below lowest snap point → dismiss

### 12.10 Badges and Status Indicators

**Badge:** A small label used to communicate status, count, or category.

**Standard badge sizes:**
- Small (height 18px): sidebar nav counts, row count chips
- Medium (height 22px): standard status badges in tables and cards
- Large (height 26px): prominent status in detail views

**All badges include text label.** Color alone is never the sole differentiator.

**Canonical status colors:**

Lead status:
- New: `info-100` background, `info-600` text
- Contacted: `warning-100` background, `warning-700` text
- Quoted: purple tint (distinct from info and primary — leads with active quotes need visual separation)
- Won: `success-100` background, `success-700` text
- Lost: `surface-raised` background, `ink-500` text (muted)

Quote status:
- Draft: `surface-raised` background, `ink-500` text
- Sent: `info-100` background, `info-600` text
- Accepted: `success-100` background, `success-700` text
- Expired: `warning-100` background, `warning-700` text
- Archived: `surface-raised` background, `ink-500` text

Job status:
- Scheduled: `info-100` background, `info-600` text
- In Progress: `ink-100` background, `ink-700` text (active, operational)
- Completed: `success-100` background, `success-700` text
- Cancelled: `danger-100` background, `danger-700` text

Invoice status:
- Draft: `surface-raised`, `ink-500`
- Sent: `info-100`, `info-600`
- Paid: `success-100`, `success-700`
- Overdue: `danger-100`, `danger-700`

**Rule:** Status colors are fixed and consistent across the entire product. The same status always uses the same color. Visual consistency enables scanning and pattern recognition.

### 12.11 Notifications and Toasts

**Toast notifications (in-app):**
- Appear from top-right corner
- Auto-dismiss: 5 seconds (informational), 8 seconds (success), persistent until dismissed (error)
- Maximum 4 toasts visible simultaneously — additional toasts queue
- Each toast: type icon + message + optional action link + dismiss ×
- Types: Info (`info-600`), Success (`success-700`), Warning (`warning-700`), Error (`danger-700`), AI (`ai-400`)

**Notification center:**
- Accessible via bell icon in navigation
- Slide-out panel from right
- Grouped by entity type and date
- Mark all read, clear all
- Individual dismiss per notification
- Types with examples:
  - Quote: "Quote Q-2041 accepted by Thompson Family"
  - Job: "Job J-0891 marked as completed"
  - Payment: "Payment received for Invoice INV-0312"
  - AI: "Bivro detected a new pricing opportunity"
  - System: "Your company plan renews in 7 days"

### 12.12 Skeleton Loaders

**Rules:**
- Shape matches final content exactly — a skeleton for a 3-column card uses 3 columns
- Shimmer animation: left-to-right sweep, 1.5 second loop
- Color: `surface-divider` base with lighter shimmer
- Appear immediately — no threshold delay before showing skeleton
- Duration: visible until content is ready; never timeout to error state without a proper error handling path

**AI output skeletons:**
- Use `ai-100` background instead of `surface-divider` — communicates "AI is processing"
- Pulse animation (not shimmer) — deliberate, slower rhythm communicates computation

### 12.13 Empty States

See Section 17 for full empty state and onboarding specification.

### 12.14 Confirmation Flows

**Level 1 — Low risk (reversible, non-destructive):**
Popover confirmation. "Are you sure you want to archive this customer?" [Cancel] [Archive]
Used for: archiving records, removing assignments, canceling quotes

**Level 2 — Medium risk (soft-delete, recoverable):**
Modal confirmation. Shows entity name and clear description of action.
"Archive Customer: Liam Thompson · This customer and their quotes will be hidden but not deleted. You can restore them from Settings → Archived Records." [Cancel] [Archive Customer]

**Level 3 — High risk (irreversible or system-wide impact):**
Modal with type-to-confirm. User must type the entity name or "DELETE".
"Delete Learned Patterns · This will permanently remove all AI learning patterns for Allianz Moving Co. Type the company name to confirm: [___]" [Cancel] [Delete]

---

## 13. Table UX System

### 13.1 Table Structure

Bivro tables are dense, data-rich, and power-user-friendly. They are the primary data interaction surface for desktop/laptop users.

Standard column order: [Selection checkbox] | [Primary identifier] | [Status] | [Key fields...] | [Dates] | [Row actions]

### 13.2 Sorting

- Click column header → sort ascending
- Second click → sort descending
- Third click → remove sort (column returns to default order)
- Sort direction indicated by arrow icon in column header
- **Multi-column sort:** `Shift+Click` additional column headers
- Sort state persists in URL query parameters (shareable sorted view)
- Default sort: determined per entity (e.g., Quotes sort by created_at desc by default)

### 13.3 Filtering

**Filter bar:**
- Activated by "Filter" button above table
- Filter chips appear when active: `Status: Active | Created: Last 30 days | Customer: Thompson`
- Click chip to edit, × on chip to remove
- Clear all link

**Per-column filter:**
- Available by right-clicking a column header or via column options menu
- Filter type by data type: text (contains / starts with / equals / is empty), date (range / before / after), status (multi-select checkboxes), number (greater than / less than / between)

**Filter persistence:**
- Active filters persist within the session
- Saved views persist filters permanently (see §13.5)

**Permission-aware filters:**
- Filter options for permission-gated fields do not appear for users without that permission
- A user without `quotes.view_cost_price` has no "Filter by margin" option — the field does not exist for them

### 13.4 Column Management

**Column visibility:**
- "Columns" button → panel listing all available columns with checkboxes
- Check/uncheck to show/hide
- Order by drag-and-drop within the column panel
- Permission-aware: cost_price columns do not appear in this list for unauthorized users

**Column resizing:**
- Drag column dividers to resize
- Double-click divider: auto-fit column to its content
- Minimum column width: 80px
- Maximum: unrestricted (table gets horizontal scroll if columns overflow)

**Sticky columns:**
- First column (primary identifier / name) always sticky during horizontal scroll
- Selection checkbox column always sticky

### 13.5 Saved Views

**Default views:** Provided per entity. Cannot be deleted.

| Entity | Default views |
|--------|--------------|
| Quotes | All · Drafts · Sent · Accepted · Archived |
| Jobs | Today · Upcoming · Completed · Cancelled |
| Leads | Active · Won · Lost |
| Invoices | All · Unpaid · Overdue · Paid |

**Custom views:**
- "Save current view" button → name the view
- Saves: active filters, column visibility, column order, sort state
- Personal by default (visible only to the creating user)
- Owner can mark a view as "Company default" — visible to all users as an additional default tab

### 13.6 Bulk Actions

- Checkbox in header row: select all visible (current page)
- `Shift+Click` to select range
- Bulk action bar appears at bottom of table when any rows are selected
- Bar contents: "[N] selected · [Primary bulk action] · [Secondary actions] · [Deselect all]"
- Bulk action examples (context-dependent): Send reminder, Archive, Export, Assign crew, Mark as paid
- Unavailable bulk actions for the user's permissions are omitted from the bar (never shown disabled)
- Bulk destructive: modal with item count + sample of affected items + confirm

### 13.7 Row Actions

- Hovering a row → row actions appear in the rightmost column
- Primary actions (1–2 max): visible as icon buttons
- "More" (`•••`) opens a popover with additional actions
- Most common primary action is also triggered by clicking the row (row click = view detail)
- Keyboard: selected row → Enter = view detail, context menu key = more actions

### 13.8 Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate rows |
| `Enter` | Open selected row (view detail) |
| `Space` | Toggle row selection |
| `Escape` | Clear row selection |
| `Shift+↑/↓` | Extend selection |
| `Cmd+A` | Select all visible rows |

### 13.9 Pagination and Virtualization

**Pagination (default for all tables):**
- 25 rows per page (default); options: 25 / 50 / 100
- Page controls at table bottom: `← Previous · Page N of M · Next →`
- Direct page input for tables with many pages
- Page state persists in URL query parameters

**Virtualization (exception cases):**
- Used for tables known to exceed 500 rows where pagination disrupts workflow
- Examples: import review tables, bulk employee record tables
- Standard pagination is preferred for all operational tables — predictability over infinite scroll

**Rule:** Never use infinite scroll for operational tables. Users lose location in a list when content continuously appends.

### 13.10 Mobile and Tablet Table Transformation

**Mobile (0–767px):** Tables are replaced by card lists.
Each card displays:
- Primary identifier (name, quote number, job number) in `heading` weight
- Status badge
- 2–3 key fields relevant to the entity (e.g., move date, customer name, total)
- One primary action button (context-appropriate: "View", "Send", "Complete")
- Swipe-to-reveal secondary actions (archive, edit)

**Tablet (768–1023px):**
- Table remains as a table with 4–5 columns maximum
- Hidden columns accessible by tapping "Show more" per row or via a detail drawer
- All sorting, filtering, and saved views still accessible via a filter sheet

---

## 14. Form UX

### 14.1 Autosave

Autosave applies to: Quote builder, customer forms, employee records, settings.

**Behavior:**
- Autosave triggers 30 seconds after the first content is entered (not on every keystroke)
- Visual indicator: "Draft saved at 2:43 PM" — bottom-left of form, subtle `body-sm` style
- Manual save always available ("Save Draft" button in form header)
- Database-persisted — autosaved drafts survive browser close and device change

**No autosave for:** Confirmation dialogs, quick-create forms, single-field inline edits (these save explicitly on action).

### 14.2 Validation Timing

| Stage | Behavior |
|-------|---------|
| Typing | No validation (except real-time format hints like email @ detection) |
| Field blur | Validate the field that just lost focus |
| Form submit attempt | Validate all required fields simultaneously |

**Rules:**
- Never validate on every keystroke — it is annoying and disruptive
- Show inline error immediately when a field is blurred with an invalid value
- On submit with multiple errors: show all field-level errors simultaneously, do not process one at a time
- Never rely solely on a disabled submit button to communicate validation state — always show which fields have errors

### 14.3 Inline Errors

```
[Label]
[Input — red border]
⚠ This field is required.    ← danger-700 text, error icon, body-sm size
```

- Error text appears below the field
- Error text is linked to the input via `aria-describedby`
- Error clears when the field value becomes valid (on each keystroke after first error)
- Multiple validation rules: all relevant error messages shown simultaneously (not just the first)

**Form-level error summary (when multiple errors on submit):**
```
Please fix the following:
• Move date is required
• Customer is required
• Origin address is required
```
Summary appears above the form. Each item is a link that scrolls to and focuses the relevant field.

### 14.4 Unsaved Changes

**In-page navigation:**
- Route change triggers a Bivro-level dialog (not a browser `beforeunload`): "You have unsaved changes in this form. Save your draft or discard to continue."
- Options: [Save Draft] [Discard Changes] [Continue Editing]

**Browser/tab close:**
- Browser `beforeunload` event fires: generic browser dialog warning
- This is a fallback — in-app navigation is always preferred

### 14.5 Smart Defaults

Forms pre-fill where data is available or where a reasonable default exists:

| Field | Default |
|-------|---------|
| Move date | 2 business days from today |
| Quote validity | 14 days (configurable in Settings → Company) |
| VAT rate | Company's default VAT rate setting |
| Service prices | Catalog default prices (editable per quote) |
| Currency | Company's configured currency |
| Crew estimate | AI recommendation (editable) |
| Hours estimate | AI recommendation (editable) |

Smart defaults are always editable. They are starting points, not constraints.

### 14.6 Keyboard-First Entry

- Tab order matches visual order (top-to-bottom, left-to-right)
- All interactive form elements reachable by keyboard
- Date picker accepts typed dates (YYYY-MM-DD or locale-appropriate)
- Combobox: type to filter, arrow keys navigate, Enter selects, Escape closes
- Enter on a single-field form submits it
- Enter in a multi-field form moves focus to the next field (does not submit)

### 14.7 AI Suggestions in Forms

AI suggestions appear as contextual hints, not auto-applied values:

- Ghost text in input: the suggested value appears in `ink-500` color, inline with the cursor
- Press `Tab` to accept the ghost text suggestion
- Any other keystroke replaces or dismisses the suggestion
- AI suggestions are labeled with a subtle sparkle icon so they are distinguishable from typed text
- AI suggestions never auto-apply — they are always explicit user actions

### 14.8 Progressive Disclosure

- Core required fields are always visible
- Optional or advanced fields grouped under "Advanced options" expandable section
- Expandable state persists within a session (if a user opens Advanced, it stays open)
- Long forms divided into logical steps (see Quote intake §8.3 for example)
- Never show a form so long that the primary action button requires scrolling to find

---

## 15. Accessibility

**Target:** WCAG 2.2 Level AA across all Company Portal and Platform Portal pages.

### 15.1 Keyboard Navigation

- All interactive elements reachable via `Tab`
- Logical tab order: left-to-right, top-to-bottom, matching the visual reading flow
- "Skip to main content" link as the first focusable element on all pages
- "Skip to navigation" link as the second focusable element
- Modal: focus trapped inside while modal is open; focus returns to trigger element on close
- Drawer: focus trapped inside while open; focus returns to trigger element on close
- Dropdown/popover menus: arrow keys navigate items, Enter selects, Escape closes

### 15.2 Screen Reader Semantics

**Landmark regions:**
- `<nav>` for primary and secondary navigation
- `<main>` for the primary content area
- `<aside>` for supplementary panels (AI analysis, detail drawers)
- `<header>` for page-level header

**Page titles:** `document.title` updates on every navigation — "Dashboard — Bivro", "Quotes — Bivro", "Quote Q-2041 — Bivro". This is required for screen reader users to understand page changes in a SPA.

**Dynamic content:**
- `aria-live="polite"` on notification toast regions
- `aria-live="assertive"` only for critical alerts (errors, session expiry)
- `aria-live="polite"` on AI analysis output area — announces when AI completes analysis

**Tables:**
- `<thead>`, `<tbody>` always present
- Column headers: `<th scope="col">`
- Row headers where applicable: `<th scope="row">`
- Table caption for screen readers (may be visually hidden with `sr-only` class)

**Icons:**
- Decorative icons: `aria-hidden="true"`
- Functional icon buttons: `aria-label="[action]"` on the button element
- Status icons paired with text: icon is `aria-hidden="true"`, text communicates the status

**ARIA patterns used:**
- Combobox: ARIA 1.2 combobox pattern
- Tabs: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`
- Modal dialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- Tooltip: `role="tooltip"` with `aria-describedby` on the trigger

### 15.3 Color Contrast

| Context | Minimum ratio | Target |
|---------|--------------|--------|
| Body text on background | 4.5:1 | 7:1+ |
| Large text (18px+ or 14px bold+) on background | 3:1 | 4.5:1+ |
| UI components (borders, icons) against background | 3:1 | 4.5:1+ |
| Focus ring against adjacent colors | 3:1 | 4.5:1+ |
| Placeholder text | 4.5:1 | — |

Color is never the sole differentiator for any state. Every status badge includes text. Every error state includes an icon and text. Every validation state includes text.

### 15.4 Focus Visibility

- 2px solid `signal-600` ring, 2px offset from element boundary
- Ring is visible in both light and dark mode against all background colors
- Never use `outline: none` without a custom focus ring implemented as a replacement
- High-contrast mode: focus ring switches to `currentColor` for compatibility

### 15.5 Reduced Motion

When `prefers-reduced-motion: reduce` is active:
- All decorative animations (shimmer on skeleton, idle pulse effects) are removed
- Functional transitions (drawer open, modal appear, toast slide) become instantaneous (`transition: none`)
- AI thinking indicator becomes a static teal dot — no animation
- Carousel/slider transitions become instantaneous cuts (not slides)
- Page transitions become instantaneous

### 15.6 Touch Targets

| Context | Minimum size |
|---------|-------------|
| All interactive elements (mobile) | 44×44px |
| Secondary elements with adequate surrounding spacing (mobile) | 36×36px |
| Interactive elements (desktop/laptop) | 24×24px visual minimum, 32×32px actual hit area |

Padding is preferred over increasing visual element size to meet touch targets.

### 15.7 Error Communication

- Form errors always communicate via text (not only color change or icon)
- Error summary at top of form on submit (for multi-error forms)
- `aria-invalid="true"` on invalid inputs
- Error text associated with input via `aria-describedby`
- Inline error text minimum contrast: 4.5:1

---

## 16. Performance Perception UX

The product must feel fast. This section defines the UX rules that create perceived speed, even when complex work is happening in the background.

### 16.1 Optimistic Updates

Optimistic updates apply to operations expected to succeed and where the consequence of a failure is recoverable.

| Operation | Optimistic update |
|-----------|-----------------|
| Changing quote status (e.g., mark as sent) | Status badge updates immediately |
| Toggling a permission | Toggle switches immediately |
| Dismissing an AI recommendation | Card collapses immediately |
| Assigning crew to a job | Assignment reflects immediately |
| Archiving a record | Record disappears from list immediately |

**On server error:** Optimistic update reverts. Inline notification appears: "Failed to save — [Retry]". Previous state is restored.

**Rules:**
- Optimistic updates apply only to simple state changes, never to financial transactions, invoice creation, or destructive operations
- Retry on failure is always available — never silent failure

### 16.2 Loading State Thresholds

| Threshold | UI behavior |
|-----------|------------|
| < 150ms | No loading indicator — appears instant |
| 150ms – 500ms | Skeleton loaders replace content shape |
| 500ms – 2000ms | Skeleton + subtle spinner in page header |
| > 2000ms | Skeleton + spinner + contextual message: "Loading [entity type]..." |
| > 5000ms | "This is taking longer than usual." + Cancel option where possible |

### 16.3 Background Refresh

- Dashboard: data refreshed every 60 seconds via Supabase Realtime subscriptions (ARCHITECTURE.md §10)
- Job list (Today view): refreshed every 30 seconds
- No full page reload required for background data updates
- New or changed items appear with a subtle highlight animation (150ms ease-in-out) so users notice the update
- "Updated [time ago]" indicator shows last refresh time in corner of live-updating areas

### 16.4 AI Response Handling

AI analysis takes longer than standard database queries. The UX makes this feel deliberate, not broken.

| AI response time | UX behavior |
|------------------|------------|
| < 1s | Skeleton → content (standard flow) |
| 1s – 3s | Pulsing `ai-100` skeleton with "Bivro is analyzing..." label |
| 3s – 8s | Progress message updates: "Reviewing your company's similar jobs..." |
| > 8s | "Analysis is taking a moment — your result will appear when ready." No timeout. |

**Streaming AI responses:**
Where AI output is streamed token-by-token (e.g., CEO Brief, coaching text), text appears progressively. The placeholder skeleton fills with text character by character. Never shows all text at once after a delay.

**Failed AI requests:**
- Error displayed inline in the AI panel: "Analysis unavailable — [Retry]"
- The quote builder, form, or dashboard continues working without the AI output
- The user can proceed without AI — AI failure never blocks workflow

### 16.5 Offline and Unstable Network

**Offline detection:**
- Subtle banner in navigation chrome: "No internet connection — some features may be unavailable"
- Not an intrusive alert — it appears quietly at the top of the navigation area
- Disappears automatically when connection resumes

**Offline behavior (V1):**
- Read-cached data may still be visible (browser cache)
- Write operations fail gracefully with: "This action requires a connection. Reconnect and try again."
- In-progress form data is preserved via autosave (last autosaved state is intact)
- No silent data loss

---

## 17. Empty States and Onboarding

### 17.1 Onboarding Philosophy

A new moving company has no customers, no jobs, no AI history. The product must be genuinely useful from day one, honest about what it doesn't yet know, and guide the operator through setup without being condescending.

Cold-start AI rule: **Never present AI confidence as if data exists when it doesn't.** Industry defaults must be labeled as such. The AI must earn trust through accuracy, not by simulating it.

### 17.2 Guided Onboarding Sequence

After company account creation, the Owner is guided through a setup checklist. The checklist is persistent in the sidebar until dismissed. It can be skipped but not permanently hidden until complete.

**Onboarding steps:**

**Step 1 — Company Profile**
Fields: Company name, trading name (if different), address, phone, email, website (optional), currency, default VAT rate, primary language/locale.

**Step 2 — Service Catalog**
- Bivro seeds 19 default services from the V1 onboarding template (see PRODUCT_REQUIREMENTS.md §2.2)
- All 19 services are active by default; Owner can deactivate any that the company does not offer
- Owner sets the company's own prices: "Edit Price" inline per service
- Owner can add unlimited custom services beyond the seed set
- Skip option: "I'll configure prices later" — services remain at $0 default prices until configured
- Note: this is the company's own isolated catalog; no other company can see or share it

**Step 3 — Add Employees (Records)**
- Note: employees do not get login access in V1 — these are crew records for dispatch
- Add name, phone, role (mover, driver, supervisor, etc.)
- Import from CSV option
- Skip option: "I'll add employees later"

**Step 4 — Add Vehicles**
- Vehicle type (van, truck, long-haul, sprinter), registration number, capacity
- Skip option: "I'll add vehicles later"

**Step 5 — Permission Groups (if Office users will be added)**
- Pre-built group templates: "Dispatcher", "Estimator", "Finance Manager", "Office Admin"
- Each template pre-selects a sensible permission set
- Owner adjusts and names their own groups
- Skip option: "I'm the only user for now"

**Step 6 — Invite Office Users**
- Email + select permission group
- Multiple invitations in one step
- Skip option

**Step 7 — Create First Quote**
- Guided quote creation with elevated AI coaching
- AI Quote Coach labels each suggestion as "Industry default · Not yet company-specific"
- Completion of the first quote generates a visible "✓ First quote created" milestone

### 17.2.1 Settings → Services (Ongoing Catalog Management)

After onboarding, the company manages its service catalog in **Settings → Services** (requires `settings.services` permission, or Owner).

**Catalog view:**
- List of all services grouped by category: Labor · Materials · Transport · Specialty · Surcharges · Custom
- Each service row: name, default pricing mode, default price, status badge (Active/Inactive/Archived), sort handle
- Seeded services show a "Bivro Default" chip — cannot be deleted; can be deactivated
- Custom services show no chip — can be archived or deleted if unused

**Per-service actions:**
- [Edit] — opens a service configuration drawer
- [Deactivate] — hides from quote builder; service and all historical line items preserved
- [Reactivate] — restores to active state in quote builder
- [Archive] (custom services only) — archives the service; preserves all historical quotes
- [Delete] (custom services only, if never used on a quote or invoice) — permanent deletion with confirmation

**Service configuration drawer:**
- Customer-facing name (displayed on quotes and PDFs)
- Internal name (optional; shown only to office users)
- Description (optional; shown on quote PDF below the service name)
- Category (Labor / Materials / Transport / Specialty / Surcharge)
- Default pricing mode (fixed / hourly / quantity / distance / manual)
- Default unit label (e.g., "hours", "items", "km")
- Default unit price (in company currency — editable per-quote always)
- Default cost price (internal; optional)
- Default VAT rate (defaults to company VAT setting)
- Sort order (drag-and-drop in the list view)
- Customer-facing toggle: show/hide from customer quote PDF (separate from active/inactive)

**Historical snapshot protection (UX communication):**
When an Owner or user attempts to rename or reprice an active service that exists on historical quotes, a non-blocking informational notice appears:
```
"Changing this service's name or price will apply to future quotes only.
 Historical quotes and invoices will not be affected — they retain the
 original values from when they were created."
```
This is an informational notice only, not a confirmation dialog — the edit proceeds normally.

**AI service recommendation UX (Settings → Services):**
If the AI has recommended adding a new custom service pattern, a "Suggested by Bivro Intelligence" section appears at the top of the Service Catalog settings page:
- "Bivro noticed you've added a similar line item manually [N] times. Add 'Gym Equipment Move' as a service?"
- [Add to Catalog] [Dismiss]
- Approving opens the service configuration drawer pre-populated with the AI's suggested name, category, and default pricing mode
- The operator reviews and saves — the AI does not create the service directly

### 17.3 Module Empty States

Empty states must feel helpful, not like a dead end. Each empty state:
- Has a relevant contextual illustration (SVG icon group, not a generic placeholder)
- Has a clear headline explaining the context
- Has 1–2 lines of body text explaining how to start
- Has a clear primary action

**Customers — no customers:**
- Headline: "No customers yet"
- Body: "Add your first customer to start creating quotes."
- Actions: [New Customer] [Import from CSV]

**Leads — no leads:**
- Headline: "Your leads pipeline is empty"
- Body: "Leads track potential customers before they become confirmed jobs."
- Actions: [New Lead]

**Quotes — no quotes:**
- Headline: "No quotes yet"
- Body: "Create your first quote for a customer or lead."
- Actions: [New Quote]

**Jobs — no jobs (but quotes exist):**
- Headline: "No jobs yet"
- Body: "Jobs are created automatically when a customer accepts a quote. Your accepted quotes will appear here."
- Actions: [View Quotes]

**Jobs — no jobs (no quotes either):**
- Headline: "No jobs yet"
- Body: "Your confirmed moves will appear here. Start by creating a quote."
- Actions: [New Quote]

**Invoices — no invoices:**
- Headline: "No invoices yet"
- Body: "Invoices are generated from completed jobs."
- Actions: [View Jobs]

**Bivro Intelligence — cold start:**
- Headline: "Bivro is learning your company"
- Body: "As you complete more jobs and quotes, Bivro builds a picture of how your company works. Suggestions become company-specific after approximately 20 completed jobs."
- Progress bar: "0 / ~20 learning jobs"
- Actions: [Create First Quote]

**Bivro Intelligence — partial data (6–20 jobs):**
- Headline: "Bivro Intelligence is improving"
- Body: "Suggestions are now partially informed by your company data. They'll become more accurate with each completed job."
- Progress bar: "[N] / ~20 learning jobs"

### 17.4 AI Confidence Maturity States

As the company completes jobs, AI confidence matures progressively. This is communicated clearly throughout the product.

| Stage | Jobs completed | AI label on suggestions | UI treatment |
|-------|---------------|------------------------|-------------|
| Cold start | 0–5 | "Industry default — not yet personalized" | Amber observation badge on every AI suggestion |
| Early learning | 6–15 | "Partially based on your company data" | Moderate confidence indicators; explicit disclaimers |
| Learning | 16–30 | "Based on your company data (limited history)" | Low-to-moderate confidence; improving trend shown |
| Established | 31–60 | "Based on your company's [N] similar jobs" | High confidence on established patterns |
| Deep knowledge | 60+ | "Based on [N] jobs from your company" | Full confidence; full AI capabilities active |

---

## 18. Platform Portal UX

The Platform Portal (`admin.bivro.io`) is the operating system for Bivro internal staff. Its UX is designed for an entirely different user — a Bivro employee managing customer tenants, subscriptions, and platform health.

This section defines UX behavior specific to the Platform Portal. Cross-references PLATFORM_ADMIN.md throughout.

### 18.1 Platform Dashboard (Overview)

The Platform Dashboard gives Bivro staff a real-time overview of the platform.

**Panels:**
- Active companies: total count, today's active count, new this week
- Subscription health: trial companies, companies near renewal, overdue payments
- Support queue: open support sessions, recent access events
- Recent platform activity: last 10 audit log entries
- System health: uptime, error rate, AI request volume, database status

Different platform roles see different panels (see PLATFORM_ADMIN.md §2.2 for role permissions).

### 18.2 Company Management

**Search and filter:**
- Search by company name, slug, or owner email
- Filter by: subscription tier (Free/Starter/Pro/Business/Enterprise), status (active/suspended/archived/trial), country, sign-up date range

**Company list table:**
| Column | Content |
|--------|---------|
| Company Name | Name + slug badge |
| Status | Active / Suspended / Archived / Trial badge |
| Subscription | Tier badge + renewal date |
| Owner | Owner email |
| Created | Sign-up date |
| Last Active | Last login timestamp |
| Actions | View · Support Access · Suspend · Archive |

**Company detail view:**
- Company overview: profile, subscription, usage metrics
- Users tab: Owner and Office users for this company
- Subscription tab: current plan, overrides, billing history
- Support Access tab: support session log for this company
- Audit Log tab: company-specific platform audit entries
- Settings tab: company feature flags and overrides

### 18.3 Support Access (Break-Glass)

**Location:** Platform Portal → Support Access OR Company detail → Support Access tab

**Initiating a support session:**
1. Select company from search
2. "Request Support Access" button (requires platform role with support access permission)
3. Required field: Reason for access (freetext, minimum 20 characters)
4. Session duration: 30 minutes (default), 1 hour, 2 hours (maximum)
5. Confirmation screen: "You are about to access [Company Name] as a support agent. This session will be audited. The company owner will be notified." → [Confirm] [Cancel]
6. On confirm: support session created, audit log entry written, company owner notified by email

**During a support session:**
- Every page in the Company Portal shows the persistent amber support session banner (§2.2)
- All actions taken within the session are logged with `support_session_id`
- Session can be ended early via [End Session] in the banner

**Post-session:**
- Session end logged with timestamp
- Full audit trail linkable via `support_session_id`
- Company owner receives session end notification

### 18.4 Platform Audit Log

**Location:** Platform Portal → Audit Log

**Characteristics:**
- Append-only, hash-chained (see PLATFORM_ADMIN.md §11.12 and AI_ENGINE.md §3.5)
- 7-year retention, cannot be deleted by any platform user including Platform Owner
- Tamper detection: UI indicates if hash chain integrity fails

**Filter options:**
- Date range
- Actor (platform user)
- Action type (login, company access, subscription change, support session, etc.)
- Target company

**Table columns:**
| Column | Content |
|--------|---------|
| Timestamp | Date + time to the second |
| Actor | Platform user email + snapshotted roles |
| Action | Human-readable action description |
| Target | Resource type + resource ID |
| Company | Target company (if applicable) |
| IP | Actor IP address |
| Session | Support session ID (if applicable) |

**Each row expandable:** Shows full `before_state` / `after_state` JSON diff in a readable diff view.

### 18.5 Subscription Management

**Location:** Platform Portal → Subscriptions

- View all company subscriptions
- Filter by tier and status
- Subscription plan editor: adjust plan features, pricing (Platform Owner / Platform Admin only)
- Company subscription overrides: grant specific feature access outside of tier limits
- Trial management: extend trials, convert trial → paid, cancel trial

### 18.6 Platform User Management

**Location:** Platform Portal → Platform Users

- List of all Bivro internal staff with platform access
- Create, edit, suspend, deactivate platform user accounts
- Assign and remove platform roles (see PLATFORM_ADMIN.md §2.1 — 8 platform roles)
- Individual permission overrides at platform level
- All changes logged in platform audit log

---

## 19. Cross-Document Consistency

This section records the consistency verification performed against all cross-referenced documents before finalizing this specification.

### 19.1 Verified Agreements

| Claim in this document | Verified against | Status |
|------------------------|-----------------|--------|
| Two roles: Owner (unrestricted) and Office (configurable) | PRODUCT_REQUIREMENTS.md §2.0, product_freeze.md | ✅ Consistent |
| Employees do not log in (V1) | PRODUCT_REQUIREMENTS.md §2.0, product_freeze.md | ✅ Consistent |
| Three quoting modes: Manual, AI-Generated, Hybrid | PRODUCT_REQUIREMENTS.md §2.1, product_freeze.md | ✅ Consistent |
| Every AI value is editable; nothing AI generates is locked | PRODUCT_REQUIREMENTS.md §2.1 | ✅ Consistent |
| quotes.view_cost_price gates cost/margin visibility | PRODUCT_REQUIREMENTS.md §3.3 | ✅ Consistent |
| Five pricing modes: fixed, hourly, quantity, distance, manual | PRODUCT_REQUIREMENTS.md §2.3 | ✅ Consistent |
| Company Portal: app.bivro.io / {slug}.bivro.io | ARCHITECTURE.md §19, PLATFORM_ADMIN.md | ✅ Consistent |
| Platform Portal: admin.bivro.io | ARCHITECTURE.md §19, PLATFORM_ADMIN.md §1 | ✅ Consistent |
| Support session: break-glass, mandatory reason, time-limited, audit-logged | PLATFORM_ADMIN.md §5 | ✅ Consistent |
| platform_audit_log: append-only, hash-chained, 7-year retention | PLATFORM_ADMIN.md §11.12 | ✅ Consistent |
| 8 platform roles | PLATFORM_ADMIN.md §2.1 | ✅ Consistent |
| AI proposes, human decides | AI_ENGINE.md §1, PRODUCT_REQUIREMENTS.md §2.1 | ✅ Consistent |
| Per-company isolated AI Brain — no cross-company learning | AI_ENGINE.md §2 | ✅ Consistent |
| Confidence score 0–100 (5 factors) | AI_ENGINE.md §5 | ✅ Consistent — displayed as qualitative label per this document |
| Three AI model tiers (Haiku/Sonnet/Opus) | AI_ENGINE.md §14 | ✅ Consistent — not exposed to users; internal architecture only |
| Subscription tiers: Free, Starter, Professional, Business, Enterprise | PLATFORM_ADMIN.md §8.1, DATABASE_ARCHITECTURE.md §3 | ✅ Consistent |
| Margin computed, never stored | DATABASE_ARCHITECTURE.md P9 | ✅ Consistent — this document specifies margin as computed on read |
| Soft deletes on business entities | DATABASE_ARCHITECTURE.md P10 | ✅ Consistent — "archive" terminology used throughout |
| Money in cents, no float | DATABASE_ARCHITECTURE.md P7 | ✅ Consistent — no float arithmetic in financial summary spec |

### 19.2 Identified Inconsistencies

#### Medium Inconsistency — Permission count

**Location:** Prior session summary vs. PRODUCT_REQUIREMENTS.md §3.3

**Conflict:**
- Prior session conversation summary stated: "35 permissions across 9 resources"
- `PRODUCT_REQUIREMENTS.md §3.3` current permission catalogue: 57 permissions across 11 resource groups (Customers, Leads, Quotes, Jobs, Employees, Vehicles, Invoices, Payments, AI Features, Analytics, Settings)

**This document's action:** References PRODUCT_REQUIREMENTS.md §3.3 as canonical. The 57-permission catalogue is treated as the current authoritative specification. The session summary reference to "35 permissions across 9 resources" appears to be outdated.

**No blocking action required** — PRODUCT_REQUIREMENTS.md is the live specification and this document follows it. The inconsistency is a historical artifact.

### 19.3 No Critical Inconsistencies Found

No frozen product decisions were silently changed. No new product features were introduced. No new permissions were defined. The UX specification follows the domain model exactly as specified in cross-referenced documents.

---

## 20. Final Report

### UX Principles Established (5)

1. **Surface Before Search** — system surfaces priorities; users don't hunt
2. **AI Proposes, Human Decides** — every recommendation is editable, explainable, dismissible, overridable
3. **Calm Over Noise** — operational density without visual chaos; optimized for daily multi-hour use
4. **Speed as Respect** — optimistic updates, streaming, smart skeletons, background refresh
5. **Transparent Intelligence** — every AI recommendation has a visible "Why?" path; reasoning is never hidden

### Portal Experiences Defined

**Company Portal** (`app.bivro.io` / `{slug}.bivro.io`):
- Light default theme, company-branded chrome
- Full navigation architecture (§6.1)
- Attention-first dashboard with AI CEO Brief
- Quote creation as flagship workflow
- Permission-aware UX throughout

**Platform Portal** (`admin.bivro.io`):
- Visually authoritative, distinctly different from Company Portal
- "BIVRO PLATFORM ADMIN" persistent in navigation chrome
- Support session persistent amber banner (unmistakable, undismissable)
- Full Platform UX defined in §18

### Responsive Strategy

- **Desktop (1440px+):** Multi-panel, wide tables, dispatch board, full nav
- **Laptop (1024–1439px):** Primary target — compact sidebar, 2-column layouts, 1280×800 verified
- **Tablet (768–1023px):** Bottom nav, drawer navigation, consultation-optimized
- **Mobile (0–767px):** Card-based (no tables), bottom sheets, swipe interactions, FAB primary actions

### AI UX Patterns (13 defined)

AI Recommendation Card · AI Observation · AI Warning · AI Opportunity · Confidence Display · "Why?" Reasoning · Learning Confirmation · Monthly Evolution Report · CEO Brief · AI Replay · AI Simulation · Profit Leak Detection · Quote Coach

All 13 patterns use the exclusive `ai-*` teal color family. No other UI element in the product uses teal.

### Permission-Aware UX Rules

- Owner: never sees permission states — full product access
- Office: four response states (Hidden / Read-Only / Disabled with Explanation / Request Approval)
- Information leak prevention across: DOM, search, AI responses, notifications, exports, URLs, mobile cards
- `quotes.view_cost_price` enforced across table columns, financial summary, AI responses, exports, and mobile summaries

### Quote Workflow UX

- Three modes: Manual / AI-Generated / Hybrid
- Multi-step intake: Customer → Origin → Destination → Inventory → AI Review + Line Items
- Persistent AI Quote Coach in right panel (real-time, always advisory)
- Live financial summary (permission-gated for cost/margin fields)
- Autosave every 30 seconds, database-persisted
- Service catalog sidebar with search and category filter

### Design System Decisions

- **System name:** Compass
- **Primary typeface:** Geist (open source, MIT)
- **Icon set:** Lucide (MIT)
- **Base spacing unit:** 4px
- **Color philosophy:** Semantic-first; AI colors exclusively reserved for AI elements
- **Density:** Three levels (Compact / Default / Comfortable), per-table
- **Motion:** Quick (80ms) for micro-interactions; Deliberate (250ms) for drawers/modals; Respect `prefers-reduced-motion`
- **Theme:** Light default; dark mode architecturally supported (V1 launch: light only)

---

### Critical Contradictions: None

### High Contradictions: None

### Medium Contradictions: 1

1. **Permission count:** Prior session summary (35 permissions / 9 resources) vs. PRODUCT_REQUIREMENTS.md §3.3 current catalogue (57 permissions / 11 resources). PRODUCT_REQUIREMENTS.md is treated as canonical. Prior summary appears outdated. **No blocking action — PRODUCT_REQUIREMENTS.md governs.**

*Resolved from prior version:* Service catalog count inconsistency resolved — canonical initial seed is 19 services (versioned onboarding template, not a permanent invariant); defined in PRODUCT_REQUIREMENTS.md §2.2.

---

**UI/UX architecture foundation passed.**
