---
name: Calm Technical Engineer
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434651'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#747782'
  outline-variant: '#c3c6d3'
  surface-tint: '#335caa'
  primary: '#00347b'
  on-primary: '#ffffff'
  primary-container: '#1f4b99'
  on-primary-container: '#a5bfff'
  inverse-primary: '#afc6ff'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fc'
  on-secondary-container: '#57657a'
  tertiary: '#003f39'
  on-tertiary: '#ffffff'
  tertiary-container: '#005850'
  on-tertiary-container: '#63d1c3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d9e2ff'
  primary-fixed-dim: '#afc6ff'
  on-primary-fixed: '#001944'
  on-primary-fixed-variant: '#134391'
  secondary-fixed: '#d5e3fc'
  secondary-fixed-dim: '#b9c7df'
  on-secondary-fixed: '#0d1c2e'
  on-secondary-fixed-variant: '#3a485b'
  tertiary-fixed: '#89f5e7'
  tertiary-fixed-dim: '#6bd8cb'
  on-tertiary-fixed: '#00201d'
  on-tertiary-fixed-variant: '#005049'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Geist
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Geist
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-body:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.875rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style

This design system establishes a focused, calm, and rigorous environment for technical interview preparation. Built for software engineers, technical leads, and engineering candidates, the visual language rejects gamified hype and hyperactive badges in favor of quiet competence, clarity, and utilitarian precision. 

The aesthetic synthesizes modern corporate developer-tooling precision with minimalist editorial structure. It draws inspiration from IDE consoles, technical whitepapers, and high-end workstation tooling:
- **Tone:** Authoritative, measured, analytical, and low-cognitive-load.
- **Visual Texture:** Monochromatic control surfaces with selective primary deep navy/slate accents, crisp structural dividers, and deliberate monospaced metrics.
- **Design Philosophy:** Low-contrast visual boundaries prevent fatigue during prolonged mock sessions and algorithmic problem-solving sprints.

## Colors

The palette balances the requested custom slate/navy blue (`#1F4B99`) with neutral architectural slates to evoke quiet focus and engineering rigor.

- **Primary (`#1F4B99`):** Command blue. Utilized strictly for primary actions, current interview phase indicators, and focused states.
- **Secondary (`#475569`):** Balanced slate. Drives secondary controls, active tab headers, and contextual metadata anchors.
- **Tertiary (`#0D9488`):** Deep sage/teal. Reserved for algorithmic validation states, clean unit-test passes, and benchmark markers without harshness.
- **Neutral (`#64748B`):** Cool slate. Forms the foundation of structural borders, de-emphasized values, inactive states, and assistive layout lines.
- **Surfaces & Canvas:** Clean paper white (`#FFFFFF`) against an off-white baseline background (`#F8FAFC`). Muted panel surfaces sit at `#F1F5F9` with card backgrounds remaining pure white with refined outlines.
- **Semantic Accents:** Warnings utilize subdued amber (`#D97706`), while runtime/syntax errors utilize soft crimson (`#DC2626`). Both appear against muted tinted fills rather than saturated alerts.

## Typography

The type system pairs **Geist**—a geometric, neutral, and highly readable grotesque engineered for modern developer interfaces—with **JetBrains Mono** for code fragments, telemetry, time complexity matrices, and status indicators.

- **Headlines & Interface Text:** Geist maintains an objective, unpretentious voice. Its tight letterforms remain crisp under system-level rendering.
- **Telemetry, Timestamps & Tokens:** JetBrains Mono provides structural rhythm for numerical stats (e.g., latency, time elapsed, algorithmic complexity $O(n \log n)$), ensuring tabular figures align without layout shift.
- **Contrast & Legibility:** Headings use medium and semibold weights (`500`/`600`) to assert structure without looking loud or heavy. Body copy prioritizes relaxed line heights for sustained reading during code analysis and problem descriptions.

## Layout & Spacing

The layout is built upon an analytical, multi-pane workbench philosophy.

- **Grid Architecture:** Desktop views deploy a fixed-responsive 12-column architecture or structured split-view panels (e.g., interview transcript/prompt on the left, code workspace/rubric on the right). Gutters adhere strictly to `1.25rem` (20px) to maximize horizontal data density while preserving distinct modular separation.
- **Breakpoints:**
  - *Desktop (`≥ 1280px`):* Multi-pane split workbench, fixed sidebars, max content container of `1440px`.
  - *Tablet (`768px – 1279px`):* Collapsible secondary sidebar; collapsible dual-panel vertical split.
  - *Mobile (`< 768px`):* Stacked single-column card flows with persistent bottom-pinned controls and reduced margins (`1rem`).
- **Rhythm:** Spacing tokens govern internal component buffers and flex layouts. Tight values (`space-xs`, `space-sm`) are reserved for metadata badges, input padding, and code tree hierarchies, while `space-lg` and `space-xl` enforce separation between logical sections.

## Elevation & Depth

This system avoids blurred heavy shadows and faux-3D layering in favor of **low-contrast outlines, tonal containment, and hair-line paneling**. Depth is technical and flat:

- **Borders over Shadows:** Surfaces sit on an architectural base. Visual grouping is achieved via a consistent `1px` border (`#E2E8F0` on active light surfaces, `#CBD5E1` on interactive boundaries).
- **Subtle Surface Tiers:**
  - *Base Layer:* `#F8FAFC` (App background).
  - *Panel/Card Layer:* `#FFFFFF` (Resting state for questions, code blocks, feedback modules).
  - *Embedded Tray/Inset:* `#F1F5F9` (Console output, raw logs, parameters, unit tests).
- **Interaction Elevation:** Focused or hovered cards and controls do not cast dramatic drop-shadows. Instead, they shift border contrast to `#1F4B99` or `#94A3B8`, accompanied by an extremely faint ambient key-line shadow: `0 1px 2px 0 rgba(15, 23, 42, 0.05)`.
- **Modals & Overlays:** Sheet drawers and command palettes use a clean dark overlay (`rgba(15, 23, 42, 0.40)`) with crisp containment edges.

## Shapes

The design system employs a **Soft (`1`)** roundedness profile:
- Primary interactive components (buttons, input fields, badges) use a base radius of `0.25rem` (4px).
- Larger containers, system cards, and editor split-frames utilize `rounded-lg` at `0.5rem` (8px).
- Modals, tooltips, and floating floating bars cap out at `rounded-xl` (`0.75rem` / 12px).
- Pill shapes are excluded entirely to maintain an intentional, engineered workstation feel rather than a consumer-app look.

## Components

### Buttons
- **Primary:** Solid `#1F4B99` fill, white text, 4px border-radius, height 36px (desktop). Hover: `#173A77`. Active: `#132F60`. Focus: `2px` offset ring in `#1F4B99`.
- **Secondary / Outline:** Background transparent, border `1px solid #CBD5E1`, text `#334155`. Hover: background `#F8FAFC`, border `#94A3B8`.
- **Ghost / Tertiary:** Borderless, text `#475569`, padding `space-xs` `space-sm`. Hover: `#F1F5F9`.
- **Technical Action (Run Code / Submit):** Primary button with optional prepended monospace icon or keycap hint (e.g., `⌘↵`).

### Input Fields & Textareas
- Base height 36px, `1px solid #CBD5E1`, surface `#FFFFFF`, text `#0F172A`, placeholder `#94A3B8`.
- Focused state: border color `#1F4B99` with sharp `0 0 0 1px #1F4B99`.
- Monospace variant used for code parameters, regex filters, and algorithmic inputs using `JetBrains Mono`.

### Cards & Panels
- Background `#FFFFFF`, border `1px solid #E2E8F0`, corner radius `0.5rem` (`rounded-lg`).
- Header area separated by a horizontal `1px solid #F1F5F9` rule with title set in `headline-sm` or `body-md` semibold.
- Zero drop-shadow in rest state; clean inset padding of `space-md` or `space-lg`.

### Chips & Status Indicators
- Status badges use `JetBrains Mono` at `label-sm`.
- Flat pastel fills with matching borders:
  - *Optimal / Passed:* Fill `#F0FDFA`, border `1px solid #CCFBF1`, text `#0F766E`.
  - *In Progress / Neutral:* Fill `#F1F5F9`, border `1px solid #E2E8F0`, text `#475569`.
  - *Action Required / Review:* Fill `#FEF2F2`, border `1px solid #FEE2E2`, text `#B91C1C`.
- Avoid round dot indicators; use bracketed tokens (e.g., `[PASS]`, `[O(n)]`, `[READY]`) or square 6px indicators.

### Checkboxes & Radio Controls
- Dimensions: 16px × 16px. Border: `1px solid #94A3B8`, radius 2px for checkboxes, circular for radios.
- Checked state: `#1F4B99` solid background with crisp white tick.

### Lists & Rubrics
- Clean row dividers (`1px solid #F1F5F9`). Alternating hover state: `#F8FAFC`.
- Performance rubrics (e.g., System Design, Complexity, Communication) display split columns: competency title on the left, quantitative or categorical rating pill on the right.

### Code Snippet & Terminal Blocks
- Background `#0F172A` (deep dark slate) or `#F8FAFC` (subtle light inset), border `1px solid #E2E8F0`. 
- Padding: `space-md`. Font: `code-body` (`JetBrains Mono`), supporting line-number gutters and subdued inline syntax highlights.