---
version: alpha
name: SinoMedia-dashboard-design-analysis
description: An authoritative design specification for SinoMedia Crawler & Release Ops Dashboard — a high-density, professional multi-platform social media intelligence and Google Play release management platform. Built on a crisp, high-contrast dark/light design system with signature SinoMedia Orange (#f97316), high-visibility blue primary actions (#3b82f6), 2.0 stroke technical icon metrics, dense data tables, and centered rounded-2xl modal dialogs.

colors:
  primary: "#3b82f6"
  primary-deep: "#2563eb"
  primary-soft: "#60a5fa"
  brand-orange: "#f97316"
  brand-orange-deep: "#ea580c"
  ink: "#0f172a"
  ink-secondary: "#1e293b"
  ink-mute: "#64748b"
  ink-mute-2: "#94a3b8"
  ink-faint: "#cbd5e1"
  on-primary: "#ffffff"
  on-dark: "#f8fafc"
  canvas: "#ffffff"
  canvas-soft: "#f8fafc"
  canvas-dark: "#090d16"
  canvas-card-dark: "#0f172a"
  hairline: "#e2e8f0"
  hairline-dark: "#1e293b"
  hairline-strong: "#cbd5e1"
  status-emerald: "#10b981"
  status-amber: "#f59e0b"
  status-rose: "#f43f5e"
  status-purple: "#8b5cf6"

typography:
  display-xl:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.75px
  display-lg:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.5px
  heading-lg:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.25px
  heading-md:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
  caption:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0
  micro:
    fontFamily: "Inter, 'Outfit', system-ui, -apple-system, sans-serif"
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: 0.2px
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: 0

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  huge: 48px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 6px 12px
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 6px 12px
  button-danger-halt:
    backgroundColor: "{colors.status-rose}"
    textColor: "{colors.on-primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: 6px 12px
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 0px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  select-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 8px 12px
  sidebar-parent-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    fontWeight: 600
    rounded: "{rounded.md}"
    padding: 8px 12px
  sidebar-child-active:
    backgroundColor: "rgba(226, 232, 240, 0.8)"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    fontWeight: 700
    rounded: "{rounded.md}"
    padding: 6px 12px
  card-standard:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 16px
  modal-popup:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.2xl}"
    padding: 24px
  badge-provenance:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink-mute}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 6px
  badge-status-emerald:
    backgroundColor: "rgba(16, 185, 129, 0.1)"
    textColor: "{colors.status-emerald}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  badge-status-amber:
    backgroundColor: "rgba(245, 158, 11, 0.1)"
    textColor: "{colors.status-amber}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  badge-status-rose:
    backgroundColor: "rgba(244, 63, 94, 0.1)"
    textColor: "{colors.status-rose}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  badge-status-purple:
    backgroundColor: "rgba(139, 92, 246, 0.1)"
    textColor: "{colors.status-purple}"
    typography: "{typography.micro}"
    rounded: "{rounded.xs}"
    padding: 2px 8px
  code-block:
    backgroundColor: "{colors.canvas-card-dark}"
    textColor: "{colors.on-dark}"
    typography: "{typography.code}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview

SinoMedia Dashboard's design language is built specifically for high-density operational clarity, data transparency, and safety-gated execution control. Designed for managing multi-platform social media crawlers (Douyin, Weibo, Bilibili, Xiaohongshu) and Google Play release pipelines across 102+ mobile apps, the application features an unyielding commitment to high-contrast typography, explicit data provenance, and clear visual hierarchy.

The brand identity centers around **SinoMedia Orange** (`{colors.brand-orange}` — `#f97316`) for core platform branding and the Spider logo, coupled with an operational **Action Blue** (`{colors.primary}` — `#3b82f6`) for primary interactive controls. Semantic status colors — **Emerald** for live/success, **Amber** for review/warnings, **Rose/Red** for policy blocks/failures, and **Purple** for automation — provide instant visual triage.

Rather than relying on decorative gradients or soft low-contrast greys, SinoMedia enforces **bold, crisp typography** (`font-semibold` to `font-bold` throughout), 2.0 stroke SVG icons, explicit 5-point data provenance tags (`Play API`, `CI Webhook`, `Manual Action`), and centered `rounded-2xl` modal popups with backdrop blur.

**Key Characteristics:**
- **Dual Brand Palette**: SinoMedia Orange brand anchor (`#f97316`) + Action Blue execution primary (`#3b82f6`).
- **High Contrast Typography**: High-contrast text hierarchy (`font-semibold` menu labels, `font-bold` headings) using Inter/Outfit font stacks for maximum legibility.
- **Explicit Data Provenance**: Every metric card and data table explicitly renders data origin tags (`Play API`, `CI Webhook`, `Manual Action`, `Live 10s`) to ensure operators never act on unverified data.
- **Centered Rounded-24px Modal Dialogs**: Detailed inspect views (Release Readiness Gate, ASO GEO Warning Details, Batch Previews) use centered `rounded-2xl` popup modals with backdrop blur (`backdrop-blur-xs`) and clean circular close controls.
- **Safety-Gated Action Controls**: Destructive or high-risk actions (Rollout increase, Halt, Commit) require business justification, ticket/PR references, idempotency keys, and explicit before/after state delta previews.
- **Standardized Page Layout**: All subviews are contained within `<div className="px-4 md:px-8 py-6 max-w-[1400px] mx-auto space-y-6">` with single-level page headers and breadcrumb pathing in the sticky top header (`Header.tsx`).

## Colors

### Brand & Accent
- **SinoMedia Orange** (`{colors.brand-orange}` — `#f97316`): Primary brand identity anchor, spider logo mark, brand highlight.
- **Action Blue** (`{colors.primary}` — `#3b82f6`): Primary action buttons, active tab states, interactive focus rings.
- **Action Blue Deep** (`{colors.primary-deep}` — `#2563eb`): Hover/active state for primary interactive elements.
- **Status Emerald** (`{colors.status-emerald}` — `#10b981`): Live store, rollout health passed, pre-check success.
- **Status Amber** (`{colors.status-amber}` — `#f59e0b`): In-review SLA pending, key expiration warning, restricted action alert.
- **Status Rose** (`{colors.status-rose}` — `#f43f5e`): Policy blocked, ANR/Crash threshold failure, emergency halt recommendation.
- **Status Purple** (`{colors.status-purple}` — `#8b5cf6`): Automated batch jobs, canary rollout group indicators.

### Surface
- **Canvas** (`{colors.canvas}` — `#ffffff`): Light mode background surface.
- **Canvas Soft** (`{colors.canvas-soft}` — `#f8fafc`): Light grey background for alternate rows and cards.
- **Canvas Dark** (`{colors.canvas-dark}` — `#090d16`): Dark mode main backdrop.
- **Canvas Card Dark** (`{colors.canvas-card-dark}` — `#0f172a`): Dark mode card and modal surface.
- **Hairline** (`{colors.hairline}` — `#e2e8f0`): 1px subtle divider and card borders.
- **Hairline Dark** (`{colors.hairline-dark}` — `#1e293b`): Dark mode card and table borders.
- **Hairline Strong** (`{colors.hairline-strong}` — `#cbd5e1`): Focus states or high-contrast card separations.

### Text
- **Ink** (`{colors.ink}` — `#0f172a`): Primary heading text. Crisp, near-black slate.
- **Ink Secondary** (`{colors.ink-secondary}` — `#1e293b`): Body copy and menu items (`font-semibold`).
- **Ink Mute** (`{colors.ink-mute}` — `#64748b`): Subtitles, helper text, and table header labels.
- **Ink Mute 2** (`{colors.ink-mute-2}` — `#94a3b8`): Low-priority metadata and secondary labels.
- **Ink Faint** (`{colors.ink-faint}` — `#cbd5e1`): Disabled button labels, placeholders.
- **On Primary** (`{colors.on-primary}` — `#ffffff`): White text on Action Blue and status buttons.
- **On Dark** (`{colors.on-dark}` — `#f8fafc`): Light text on canvas-dark / card-dark surfaces.

## Typography

### Font Family

The primary font stack for UI controls and layout headings is **Inter** or **Outfit**, fallbacked by system sans-serif (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`).

For monospace metrics (VersionCodes, PackageNames, Commit SHAs, and Timestamps), the system mandates **system mono** (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas`).

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 32px | 700 | 1.2 | -0.75px | System section titles |
| `{typography.display-lg}` | 24px | 700 | 1.25 | -0.5px | Overview summary titles |
| `{typography.heading-lg}` | 18px | 700 | 1.3 | -0.25px | Page main header (`h1`) |
| `{typography.heading-md}` | 15px | 600 | 1.35 | 0 | Section & card titles |
| `{typography.body-md}` | 14px | 400 | 1.5 | 0 | Standard UI text |
| `{typography.body-sm}` | 13px | 400 | 1.45 | 0 | Compact card body |
| `{typography.caption}` | 12px | 500 | 1.4 | 0 | Button labels & subtitle (`p`) |
| `{typography.micro}` | 11px | 600 | 1.35 | 0.2px | Status pills & badge labels |
| `{typography.code}` | 11px | 500 | 1.45 | 0 | VersionCodes, PackageNames, SHAs |

### Principles
- **Crisp and Bold Weights**: SinoMedia values operational confidence; section titles use `font-bold` (700), navigation menus and critical metrics use `font-semibold` (600).
- **Explicit Mono Code Font**: Any raw data sourced directly from Google Play API or Git commits MUST use `{typography.code}` to visually separate text copy from code assets.
- **Micro Tracking**: Display sizes (`display-xl`, `display-lg`) use tight negative letter-spacing to present numeric KPIs as dense, solid editorial elements.

### Note on Font Substitutes
While **Outfit** provides geometric personality in marketing headers, the operational dashboard defaults to **Inter** for numeric alignment and high legibility. If Inter is unavailable, the fallback stack prioritizes standard system sans-serif without stylistic variance.

## Layout

### Spacing System
- **Base Grid**: 8px grid hierarchy defines all paddings, margins, and layout offsets.
- **Tokens**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.huge}` 48px.
- **Dashboard Section Padding**: Standard 24px (`py-6`) vertically and 16px to 32px (`px-4 md:px-8`) horizontally.
- **Inner Card Padding**: 16px (`p-4`) for regular data cards, 24px (`p-6`) for modals and complex summary panels.

### Container Scale
- **Max Width**: `1400px` (`max-w-[1400px] mx-auto`) to keep data grids readable on ultrawide monitors.
- **Sidebar Width**: `290px` when fully expanded to fit sub-navigation trees; collapses to `64px` icon-only view.
- **Header Height**: `56px` fixed sticky top bar.

### Layout Hierarchy
```
┌────────────────────────────────────────────────────────────────────────┐
│ Header (56px Sticky Top Bar: Breadcrumb + Theme Toggle + User Menu)   │
├─────────────┬──────────────────────────────────────────────────────────┤
│ Sidebar     │ Page Container (max-w-[1400px] mx-auto px-4 md:px-8)     │
│ (290px      │ ├─ Page Header (h1 title + p subtitle + top actions)     │
│ Sticky      │ ├─ Multi-Filter Control Bar                             │
│ Collapsible)│ ├─ Primary Data Table / Grid                              │
│             │ └─ Centered Modal Dialog Popup (on inspect action)       │
└─────────────┴──────────────────────────────────────────────────────────┘
```

### Whitespace Philosophy
Data density is prioritized over large whitespace bands. Gaps larger than `{spacing.huge}` (48px) are prohibited. Compact layouts permit scanning multiple rows of crawler queues and release states without intensive scrolling.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat, 1px hairline border | Standard cards, data tables, filter containers. |
| 1 | `box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05)` | Subtle depth for sidebar hover and sticky headers. |
| 2 | `box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.1)` | Hovered states of metric cards and control dropdowns. |
| 3 | `box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25)` | Centered modal popup dialogs and emergency halt notices. |

### Decorative Depth
The dashboard achieves depth using structural overlays and blurring rather than atmospheric drop shadows. Modal backdrops utilize `bg-black/60` coupled with `backdrop-blur-xs` to isolate execution gates from background data noise.

## Shapes & Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Status badges, provenance tags, inline micro labels. |
| `{rounded.sm}` | 6px | Keyboard shortcut kbd tags, compact code pills. |
| `{rounded.md}` | 8px | Action buttons, form select inputs, text-inputs, hover rows. |
| `{rounded.lg}` | 12px | Metric cards, container panels, upload dropzones. |
| `{rounded.xl}` | 16px | Large composite overview cards, chart layouts. |
| `{rounded.2xl}` | 24px | Centered modal popup dialogs (Release gates, audit modals). |
| `{rounded.full}` | 9999px | Circular close buttons (`&times;`), avatar badges, active indicators. |

### Icon & Asset Geometry
- **Icons**: Every system icon must be rendered at `size-4` (16px) or `size-5` (20px) inside navigation trees, buttons, and badges. 
- **Stroke Metric**: Enforce a uniform SVG stroke width of `stroke-[2]` (2.0 stroke weight). Fine strokes (1.0 or 1.5) read as weak and are prohibited.
- **Placeholders**: Do not use generic image placeholders; use SVG schemas or generated assets for visual consistency.

## Components

### Buttons

**`button-primary`** — Standard positive action button.
- Background `{colors.primary}` (Action Blue), text `{colors.on-primary}` (white), type `{typography.caption}`, padding `6px 12px` (`py-1.5 px-3`), rounded `{rounded.md}` (8px). 
- Hover state shifts to `{colors.primary-deep}`.

**`button-outline`** — Standard secondary trigger.
- Background `{colors.canvas}` (white), text `{colors.ink}` (slate), 1px solid `{colors.hairline-strong}` border, typography `{typography.caption}`, padding `6px 12px`, rounded `{rounded.md}` (8px).

**`button-danger-halt`** — High-priority warning / emergency stop action.
- Background `{colors.status-rose}` (rose-red), text `{colors.on-primary}` (white), typography `{typography.caption}`, padding `6px 12px`, rounded `{rounded.md}` (8px). 

**`button-link`** — Text inline trigger.
- Background transparent, text `{colors.primary}` (Action Blue), typography `{typography.caption}`, padding `0px`, rounded `{rounded.xs}`, hover text decoration is underline.

### Sidebar Navigation Menu (`Sidebar.tsx`)
- **Parent Trigger**: Background transparent, text color `{colors.ink-secondary}`, font-semibold, padding `8px 12px`.
- **Icon Styling**: Size `size-4` (16px), stroke metric `stroke-[2]`, text color `text-slate-700` (light mode) or `text-zinc-300` (dark mode).
- **Nested Accordion Indentation**: Uses `border-l-2 border-slate-200 dark:border-zinc-700` with left padding `pl-3` and left margin `ml-[21px]`.
- **Nested Active Item**: Background `rgba(226, 232, 240, 0.8)`, text color `{colors.ink}`, font-bold.

### Cards & Containers

**`card-standard`** — Default grid container.
- Background `{colors.canvas}`, padding `16px`, rounded `{rounded.lg}`, 1px hairline border `{colors.hairline}`.

**`modal-popup`** — Dialog modal template.
- Overlay: fixed fullscreen, `bg-black/60`, `backdrop-blur-xs`, items centered.
- Modal: background `{colors.canvas}`, padding `24px`, rounded `{rounded.2xl}`, shadow `{box-shadow Level 3}`.

**`code-block`** — Monospace data wrapper.
- Background `{colors.canvas-card-dark}` (slate dark), text `{colors.on-dark}`, typography `{typography.code}`, padding `12px`, rounded `{rounded.sm}`.

### Inputs & Forms

**`text-input`** — Default text entry.
- Background `{colors.canvas}`, text `{colors.ink}`, typography `{typography.body-md}`, padding `8px 12px`, rounded `{rounded.md}`, 1px hairline border `{colors.hairline-strong}`. Focus ring uses Action Blue.

**`select-input`** — Dropdown menu control.
- Same shape and styling as `text-input`, with a custom SVG arrow container on the right.

### Pills, Tags, and Badges

**`badge-provenance`** — Operational data source indicator.
- Background `{colors.canvas-soft}`, text `{colors.ink-mute}`, type `{typography.micro}`, padding `2px 6px`, rounded `{rounded.xs}` (4px).

**`badge-status-emerald`** — Success state indicator.
- Background `rgba(16, 185, 129, 0.1)`, text `{colors.status-emerald}`, type `{typography.micro}`, padding `2px 8px`, rounded `{rounded.xs}`.

**`badge-status-amber`** — Warning/review state indicator.
- Background `rgba(245, 158, 11, 0.1)`, text `{colors.status-amber}`, type `{typography.micro}`, padding `2px 8px`, rounded `{rounded.xs}`.

**`badge-status-rose`** — Failure/blocked state indicator.
- Background `rgba(244, 63, 94, 0.1)`, text `{colors.status-rose}`, type `{typography.micro}`, padding `2px 8px`, rounded `{rounded.xs}`.

**`badge-status-purple`** — Automation state indicator.
- Background `rgba(139, 92, 246, 0.1)`, text `{colors.status-purple}`, type `{typography.micro}`, padding `2px 8px`, rounded `{rounded.xs}`.

### Signature Components

**Safety-Gated Action Buttons & Audit Modal**
- Action buttons perform client-side readiness pre-checks. If status indicates warnings (e.g., `recommendation === 'halt_recommended'`), the primary button style is overridden to a red warning state `button-danger-halt`.
- Audit Modal blocks confirmation until operator inputs a valid business reason text and ticket identifier.

**Multi-Filter Control Bar**
- Flexible client-side filtering controls aligned horizontally within a Level 0 flat card container, containing search query text-input and multiple status dropdown selects.

## Do's and Don'ts

### Do
- Always use `font-semibold` or `font-bold` for menu items, headers, and metric titles to maintain sharp readability.
- Maintain `strokeWidth="2.0"` for all SVG icons in navigation and action buttons.
- Render centered `rounded-2xl` modal popups for detailed inspection views rather than side drawers.
- Enforce data provenance tags (`Play API`, `CI Webhook`, `Manual Action`) on all data tables.
- Use monospace fonts (`font-mono`) for versionCodes, packageNames, commit SHAs, and timestamps.
- Explicitly write "crawler", "crawl", "trình crawl" in internal documentation and UI labels when referring to scraping systems.

### Don't
- Don't use parenthetical notes or inline explanation comments inside UI titles, menu item labels, breadcrumbs, or dropdown options (e.g., use "Giám sát Crawler" instead of "Giám sát Crawler (Sức khỏe system)"). Keep all UI labels clean, concise, and production-ready.
- Don't use light grey or faint text for menu items or section titles.
- Don't add redundant full-width header card wrappers inside subpages; rely on the global `Header.tsx` breadcrumb.
- Don't enable high-risk release actions (+20% rollout, live 100%) without safety gate checks.
- Don't use flat low-contrast modal overlays — always use `bg-black/60 backdrop-blur-xs` with `rounded-2xl` popups.
- Never use Vietnamese translation terms like "cào" in system labels or documentation due to sensitivity context.

## Responsive Behavior

### Breakpoints

| Breakpoint | Width | Behavior |
|---|---|---|
| Desktop | ≥ 1024px | Sticky 290px sidebar, full 1400px page container, multi-column grids |
| Tablet | 768–1023px | Collapsible 64px icon-only sidebar, 2-column card grid |
| Mobile | < 768px | Slide-over mobile drawer sidebar, 1-column cards, scrollable data tables |

### Touch Targets
- On mobile devices, all button touch targets must maintain a minimum height of `38px` or vertical padding shifts upwards to maintain accessibility.
- Tap elements must have a minimum spacing offset of `8px` from adjacent clickable elements.

### Collapsing Strategy
- **Sidebar**: Mobile collapses completely and displays hamburger menu toggles in `Header.tsx`. Tablet shows collapsible icon bar.
- **Grids**: Grids collapse from 4-column → 2-column → 1-column layout smoothly.
- **Tables**: Large high-density tables permit horizontal scrolling (`overflow-x-auto`) to protect table cell integrity.

### Image & Layout Behavior
- Dashboard charts resize dynamically utilizing container width listeners.
- No media placeholders are allowed; fallback icons with standard styling will cover empty metric images.

## Architectural & UI Design Lessons (Bài học Thiết kế & Trải nghiệm Nâng cao)

### 1. Cấm dùng thẻ HTML Native Dropdown (`<select>`)
- **Vấn đề**: Thẻ `<select>` nguyên bản của HTML hiển thị khung menu vuông thô của hệ điều hành Windows/Edge, xanh đè chữ, vỡ font và lệch tông hoàn toàn với giao diện glassmorphic cao cấp.
- **Quy chuẩn**: Bắt buộc 100% các menu chọn/bộ lọc phải dùng component custom **`DropdownSelect`** (`@/components/dashboard/DropdownSelect`). Đảm bảo bo góc `rounded-lg`, hiệu ứng mờ thủy tinh (`backdrop-blur-xs shadow-lg`), tích hợp checkmark chọn item và hiệu ứng zoom-in (`animate-in zoom-in-95`).

### 2. Chuẩn Cảm giác Phản hồi Vật lý Apple Motion (Tactile Active Scale)
- **Quy chuẩn**: Mọi phần tử tương tác (Nút bấm, Tab switcher, Dropdown trigger, Radio option card, Xóa file) không bao giờ được đứng im khi người dùng nhấp chuột.
- **Cấu hình**: Bắt buộc bổ sung `active:scale-[0.97]` hoặc `active:scale-95` kết hợp với biến thiên mượt `transition-all duration-150 ease-out`.

### 3. Phòng chống Khựng/Đơ Giao diện khi Chuyển trang (Instant Next.js App Router Transitions)
- **Vấn đề**: Next.js App Router mặc định sẽ đứng yên ở trang cũ (gây cảm giác đơ/khựng) cho đến khi trang mới fetch xong dữ liệu từ Server.
- **Quy chuẩn**: Mỗi nhánh giao diện (Route Segment) như `dashboard/app/(main)/loading.tsx` hoặc `dash/release-ops/loading.tsx` bắt buộc phải có file **`loading.tsx`** để kích hoạt `Suspense Boundary`. Giúp URL đổi ngay lập tức (**0ms**) kèm thanh hiệu ứng Top Progress Bar và khung Skeleton phát sáng.

### 4. Bọc Lỗi Server Action & Bảo mật CSRF
- **Quy chuẩn**: Server Actions không bao giờ ném ngoại lệ unhandled trực tiếp (khiến Next.js trả lỗi mờ trong Production build). Luôn trả về object `{ success: boolean, error?: string }` và cấu hình CSRF chấp nhận cùng Origin Host trên Vercel Preview.

### 5. Quản lý Môi trường Deploy & Tên miền Cố định
- **Quy chuẩn**: Tách biệt rõ ràng 3 cấp tên miền trên Vercel CLI:
  - **Production URL**: `creative-lutech.vercel.app` / `creative.lutech.vn` (`npx vercel --prod`).
  - **Review Branch URL Cố định**: `creative-lutech-review.vercel.app` (`npx vercel` + `npx vercel alias set creative-lutech-review.vercel.app`).
  - **Preview Snapshot URL**: Tên miền Hash tạm thời duy nhất của lần build cũ.

## Iteration Guide

1. **Component Focus**: Address one component or module layout at a time to maintain high-density style alignment.
2. **Token Compliance**: Refer strictly to component naming keys and colors defined in the frontmatter blocks.
3. **Lint Verification**: Run `npx @google/design.md lint DESIGN.md` (or equivalent checks) to ensure structure conforms to specs.
4. **Dark/Light Contrast**: Confirm text contrast ratios meet WCAG AA requirements on both `canvas` (light) and `canvas-dark` (dark) layouts.
5. **Safety Compliance**: Any new rollout view must attach a safety confirmation modal before triggering backend functions.
6. **No "Cào" Terminology**: Strictly verify that code labels, component descriptors, and annotations use the word "crawl" or "crawler".
