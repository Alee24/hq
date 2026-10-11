# Central Software Command Center — UI/UX Design System Standard

This document is the mandatory design, layout, accessibility, and implementation standard for the Central Software Command Center codebase, synthesizing `PROFESSIONAL_UI_UX_DESIGN_SKILL.md` and the enterprise `ui-ux-pro` design system standard.

---

## 1. Core Principles
1. **Preserve Business Logic & Working Behavior**: Never break or alter existing API calls, validation, WebSocket events, terminal streams, or operational buttons.
2. **Spatial Grid (8pt / 4pt Rhythm)**:
   - Base spatial scale: 4px (`0.25rem`), 8px (`0.5rem`), 12px (`0.75rem`), 16px (`1rem`), 20px (`1.25rem`), 24px (`1.5rem`), 32px (`2rem`), 48px (`3rem`).
   - Zero arbitrary margins or padding like `p-[13px]`.
3. **Responsive Across All Viewports**:
   - Small Mobile (320px - 374px)
   - Mobile (375px - 599px)
   - Tablet (600px - 899px)
   - Desktop (900px - 1199px)
   - Large Desktop (1200px+)
   - **Zero horizontal page overflow** (`overflow-x-hidden` on main canvas).
4. **Touch & Ergonomics**:
   - Minimum interactive touch target: **44x44px** on mobile/tablet viewports.
5. **WCAG 2.1 AA / 2.2 Accessibility Compliance**:
   - Minimum **4.5:1** contrast ratio for normal body text.
   - Minimum **3:1** contrast ratio for large text and UI borders/badges.
   - High-contrast `:focus-visible` rings with offset (`ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-950`).
   - All interactive controls accessible via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`).
6. **8-State Interactive Component Matrix**:
   - Every button, input, row, and card supports: Default, Hover, Focus-Visible, Active, Disabled, Loading, Empty, Error.
7. **Semantic Status Colors**:
   - Online / Success: `emerald` (`text-emerald-400`, `bg-emerald-950/80`, `border-emerald-800/80`)
   - Warning / Degraded: `amber` (`text-amber-400`, `bg-amber-950/80`, `border-amber-800/80`)
   - Critical / Offline / Error: `rose` (`text-rose-400`, `bg-rose-950/80`, `border-rose-800/80`)
   - Info / Neutral: `sky` / `slate` (`text-sky-400`, `bg-sky-950/80`, `border-sky-800/80`)
   - Brand Primary: `brand` (`bg-brand-600 hover:bg-brand-500 text-white`)

---

## 2. Component Guidelines
- **Buttons**:
  - Primary: `bg-brand-600 hover:bg-brand-500 text-white rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-brand-500`
  - Secondary: `bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white rounded-lg px-3 py-1.5 text-xs font-medium`
  - Destructive: `bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300 rounded-lg px-3 py-1.5 text-xs font-medium`
  - Icon Button: `min-w-[36px] min-h-[36px] md:min-w-[32px] md:min-h-[32px] flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800`
- **Data Tables**:
  - Responsive container: `overflow-x-auto rounded-xl border border-slate-800 bg-slate-900`
  - Sticky header with `bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider`
  - Consistent cell padding: `py-3 px-4`
- **Modals & Dialogs**:
  - Fixed shell + scrollable content (`max-h-[85vh] flex flex-col`)
  - Escape key listener, backdrop dismissal, mobile bottom-sheet reflow
- **Cards & Gauges**:
  - Subtle borders: `border border-slate-800/80 bg-slate-900/90 rounded-xl p-4 md:p-5`
  - Actionable metrics, clean typography, tooltips for abbreviations.
