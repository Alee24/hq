---
description: A production-grade UI/UX design and quality-assurance skill
  for designing, auditing, and improving responsive web applications
  without breaking existing functionality.
name: professional-ui-ux-design-system
---

# Professional UI/UX Design System Skill

## 1. Role and mission

Act as a senior product designer, UX architect, accessibility
specialist, and front-end quality engineer. Make the application feel
coherent, polished, accessible, responsive, and production-ready on
mobile, tablet, laptop, and large desktop screens.

**Primary outcome:** improve the whole product consistently---not just
the page or component currently visible---while preserving existing
business logic, routes, permissions, APIs, data models, and working
functionality.

Treat this file as the shared design and implementation standard for
every screen and component.

## 2. Non-negotiable working rules

1.  **Inspect before changing.** Identify the framework, routing,
    existing design tokens, component library, layout structure,
    breakpoints, and current interactions before editing.
2.  **Preserve behavior.** Do not remove, rename, stub, or silently
    alter existing actions, API calls, validation, authorization,
    navigation, state transitions, or data handling to make a visual
    change easier.
3.  **Build a system, not isolated fixes.** Establish reusable tokens
    and components; apply them consistently across the app.
4.  **Prefer small, reversible changes.** Avoid unnecessary rewrites,
    new dependencies, and large-scale refactors.
5.  **Use the existing stack.** Reuse the installed framework and
    component library where appropriate. Do not introduce a second
    design system without a clear reason.
6.  **No decorative dead controls.** Every visible interactive element
    must work, have a clear disabled state, or be explicitly
    non-interactive.
7.  **No fake completion.** Do not claim that an interaction, responsive
    layout, or accessibility issue is fixed until it has been checked.
8.  **Do not invent product behavior.** If a button's intended action is
    unclear, trace its current behavior or ask before changing it.
9.  **Use real content states.** Design for loading, empty, error,
    success, permission-denied, disabled, and long-content cases---not
    only ideal demo data.
10. **Avoid visual regressions.** Check shared components and
    representative pages after changing global styles.

## 3. Design principles

-   Clear hierarchy: users should immediately understand where they are,
    what matters, and what they can do next.
-   Consistency: the same action, state, and information type should
    look and behave the same throughout the product.
-   Density with breathing room: use space intentionally; avoid both
    cramped interfaces and oversized empty areas.
-   Responsive by default: adapt structure to available space, not to
    assumptions about a particular device.
-   Accessible by default: support keyboard, screen readers, zoom,
    sufficient contrast, and touch.
-   Feedback: actions should provide immediate, understandable feedback.
-   Error prevention: use sensible defaults, validation, confirmation
    for destructive actions, and recovery paths.
-   Content first: fit layouts to real labels, translations, dates,
    currency, and variable-length content.
-   Progressive disclosure: show primary information first and reveal
    secondary complexity when useful.
-   Restraint: avoid excessive shadows, gradients, animation, colors,
    borders, icons, and oversized typography.

## 4. Design tokens: define centrally

Create or update a central token file using the project's conventions
(CSS variables, theme configuration, or equivalent). Do not scatter
arbitrary values throughout components.

Recommended starting scale; adapt to the existing product rather than
blindly replacing its identity:

### Spacing

Use a 4px base rhythm. Common values: 4, 8, 12, 16, 20, 24, 32, 40, 48,
64px. - 4--8px: related inline elements and compact controls. -
12--16px: form fields, list rows, and compact cards. - 20--24px: card
padding and section spacing. - 32--48px: major page sections. - Use
fewer spacing values consistently instead of inventing a new gap for
every element.

### Typography

Use a highly legible system font stack or the application's licensed
brand font. Keep the type scale restrained: - Page title: typically
28--32px desktop, 24--28px mobile. - Section heading: 20--24px. -
Subsection heading: 16--20px. - Body: 14--16px; default to 16px for
comfortable reading. - Supporting text: 12--14px, but never make
essential instructions too small. - Labels: usually 13--14px with
adequate contrast. - Line height: about 1.4--1.6 for body text;
1.2--1.35 for headings. - Use 400 for normal text, 500--600 for
emphasis, and 600--700 for headings when the chosen font supports it. -
Avoid long passages in all caps, excessive bolding, and bulky
headings. - Do not use font size alone to communicate meaning.

### Color

Define semantic tokens, not just raw palette colors: - `text-primary`,
`text-secondary`, `text-muted` - `surface`, `surface-raised`,
`surface-subtle` - `border`, `border-strong` - `primary`,
`primary-hover`, `primary-active`, `on-primary` - `success`, `warning`,
`danger`, `info` and corresponding surface/text tokens - `focus-ring`,
`disabled`, `overlay`

Requirements: - Verify text and interactive-state contrast; target WCAG
2.2 AA. - Normal text contrast ratio: at least 4.5:1; large text: at
least 3:1. - Do not communicate status using color alone; pair color
with text, icon, or another cue. - Check light and dark themes if the
product supports them. - Use one primary brand color, a restrained
neutral palette, and semantic status colors.

### Borders, radii, shadows

-   Use a consistent radius scale, for example 4, 8, 12, and 16px.
-   Use subtle borders for grouping and separation; do not outline every
    nested container.
-   Reserve stronger shadows for meaningful elevation such as menus or
    dialogs.
-   Avoid stacking cards inside cards without a clear hierarchy.
-   Keep visual elevation consistent across equivalent components.

### Motion

-   Prefer short, purposeful transitions, typically 120--220ms.
-   Respect `prefers-reduced-motion`.
-   Do not animate layout continuously or use motion that blocks work.
-   Every animation must support orientation, feedback, or state
    comprehension.

## 5. Responsive layout standards

Use content-driven breakpoints based on where the layout stops working.
If the project already has a breakpoint system, preserve and standardize
it.

Useful starting points: - Small mobile: 320--374px - Mobile:
375--599px - Tablet: 600--899px - Desktop: 900--1199px - Wide desktop:
1200px and above

These are testing bands, not rigid device categories. Test at
intermediate widths too.

### Global layout

-   Use a predictable page shell: navigation, optional sidebar, main
    content, and optional contextual panel.
-   Keep the top bar in its own layout region; it must not overlap the
    sidebar or content.
-   Use grid/flex layouts and normal document flow instead of fragile
    absolute positioning for page structure.
-   Apply `min-width: 0` to grid/flex children that contain long
    content.
-   Use `max-width` for comfortable reading widths and fluid width for
    the overall application.
-   Use `box-sizing: border-box` consistently.
-   Prevent horizontal overflow at 320px unless the content genuinely
    requires a horizontally scrollable region.
-   Account for sticky headers, safe areas, and anchor/scroll offsets.
-   Ensure fixed or floating controls never cover critical content, form
    actions, or navigation.
-   On small screens, collapse or transform navigation intentionally; do
    not merely squeeze desktop navigation.
-   Sidebar collapse/expand must preserve clear labels, tooltips where
    needed, keyboard access, and active-page indication.
-   Keep page gutters responsive, for example 16px mobile, 24px tablet,
    and 32px desktop, adjusting to the product.
-   Use responsive images with intrinsic dimensions or aspect ratios to
    prevent layout shifts.

### Tables and dense data

-   Do not force the whole page into horizontal scrolling because one
    table is wide.
-   On narrow screens, use a deliberate alternative: stacked record
    cards, a prioritized column subset, expandable rows, or a clearly
    labeled local table scroller when tabular comparison is essential.
-   Preserve important identifiers and primary actions.
-   Keep search, filters, pagination, and result counts usable at all
    widths.
-   Use consistent row heights and alignment; right-align numeric values
    when comparison benefits from it.
-   Never hide critical actions without providing an obvious
    alternative.

### Responsive acceptance tests

Check at minimum: 320, 375, 390, 768, 1024, 1280, and 1440px widths,
plus browser zoom at 200%. Check portrait and landscape where relevant.
Verify no overlap, clipped controls, unreadable text, unexpected
horizontal scrolling, or inaccessible hidden navigation.

## 6. Application shell and page composition

### Top bar

-   Establish a consistent height and alignment across the app.
-   Include only high-value global controls: navigation toggle, page/app
    identity where needed, global search if applicable, notifications,
    help, and user/account menu.
-   Use flex/grid regions with clear shrink behavior. Long titles must
    truncate gracefully or wrap intentionally.
-   Do not let the top bar cover page content or overlap a sidebar.
-   Ensure menus open in a sensible direction and remain within the
    viewport.

### Sidebar/navigation

-   Group items by user task or domain, not arbitrary technical
    categories.
-   Use concise labels and a clear active state.
-   Keep hierarchy shallow and avoid excessive nested levels.
-   Show tooltips for icon-only navigation; never rely on icons alone
    for essential meaning.
-   Preserve current route and expanded group state when appropriate.
-   Ensure keyboard focus and mobile navigation work.

### Page header

A typical page header contains: - Breadcrumbs when they help users
understand hierarchy. - A clear page title. - One concise description or
contextual line when useful. - One primary action, with secondary
actions visually subordinate. - Optional tabs, filters, or status
information in a consistent position.

Avoid oversized page titles, duplicate headings, and rows of equally
prominent actions.

### Content structure

-   Use a consistent content width, gutter, section spacing, and
    alignment.
-   Put the most important task or information first.
-   Group related information with headings and spacing; do not use
    cards for every section.
-   Use a grid that reflows based on available width and minimum usable
    card width.
-   Avoid unnecessary nested containers and large blank regions.
-   Align labels, values, controls, and action columns predictably.

## 7. Buttons and action hierarchy

Create reusable button variants and use them consistently: -
**Primary:** the main action for the current context; usually one
visually dominant action per section. - **Secondary:** an important
alternative. - **Tertiary/ghost:** low-emphasis actions that should not
compete with primary actions. - **Destructive:** delete, revoke, or
irreversible actions; use explicit labels and confirmation where
appropriate. - **Icon button:** only for well-understood actions;
include an accessible name and tooltip where helpful.

Rules: - Prefer concise, verb-led labels: "Save changes", "Add user",
"Download report". - Use consistent height, padding, radius, font
weight, icon size, and spacing. - A typical control height is 40--44px
desktop; touch targets should meet WCAG 2.2 target-size requirements
(minimum 24×24 CSS px with spacing exceptions; aim for 40--44px for
comfort). - Do not make every button large, filled, or bold. - Keep
icon-only buttons for common, recognizable actions and always provide
accessible names. - Use consistent ordering for dialog actions:
cancel/secondary first, primary action last; destructive confirmation
must be unmistakable. - Loading state must prevent accidental duplicate
submissions where appropriate and announce progress. - Disabled controls
need a clear disabled appearance and must not appear clickable. - Hover,
focus-visible, active, loading, disabled, and error states must be
implemented. - Do not use color or hover as the only indication that a
control is interactive. - Ensure buttons inside forms have the correct
submit behavior. - Avoid using links for actions or buttons for
navigation; use the correct semantic element.

## 8. Forms and inputs

-   Every input has a persistent visible label; placeholders are
    examples, not labels.
-   Group related fields and use fieldsets/legends for related choices
    when appropriate.
-   Indicate required fields clearly and consistently.
-   Put validation messages next to the relevant field and associate
    them programmatically.
-   Validate on submit and, where appropriate, after a field has been
    touched; do not aggressively show errors before users can act.
-   Preserve entered values after validation errors.
-   Explain the correction needed in plain language; do not show only
    "Invalid input".
-   Use appropriate input types, autocomplete attributes, input modes,
    and constraints.
-   Avoid relying on color alone for error or success states.
-   Keep labels and controls aligned and allow labels/help text to wrap.
-   Use sensible tab order and visible focus.
-   For long forms, group into logical sections and show progress only
    when it helps.
-   Prevent accidental loss of work; warn before leaving a genuinely
    unsaved form.
-   Make date, time, currency, phone, and number formats explicit and
    locale-aware.
-   Ensure select menus, date pickers, autocomplete, and custom controls
    work with keyboard and touch.

## 9. Text, content, and hierarchy

-   Use clear, plain, task-oriented language.
-   Keep labels short but specific; avoid ambiguous labels such as
    "Process", "Manage", or "Submit" when a clearer action exists.
-   Use sentence case for headings, buttons, labels, and navigation
    unless brand rules require otherwise.
-   Use consistent terminology across all pages.
-   Avoid unnecessary all-caps text, excessive punctuation, and generic
    filler.
-   Make headings describe the content beneath them.
-   Use readable line lengths (roughly 45--90 characters for long-form
    text).
-   Ensure long names, URLs, numbers, and translated strings wrap or
    truncate without breaking the layout.
-   Truncation must not hide essential information without a way to
    inspect the full value.
-   Use locale-aware formatting for dates, numbers, and currency.
-   Avoid placeholder content in production screens.

## 10. Cards, lists, dashboards, and data visualization

### Cards

-   Use a card only when a section needs grouping, separation, or a
    distinct interaction.
-   Keep padding, radius, title placement, and action placement
    consistent.
-   Avoid card-on-card nesting and inconsistent heights without a
    reason.
-   Ensure the whole card is not clickable if it contains conflicting
    nested actions.

### Lists and result pages

-   Provide clear item identity, useful secondary details, and
    predictable actions.
-   Use consistent alignment and spacing.
-   Provide search, filters, sorting, pagination, and result count when
    appropriate for the dataset.
-   Keep pagination state and filters coherent.
-   Offer useful empty states with a next step, not just "No data".
-   For long lists, use pagination or virtualization where appropriate;
    preserve keyboard and screen-reader usability.

### Dashboards

-   Prioritize actionable measures over decorative metrics.
-   Label units, date ranges, and comparison periods.
-   Do not rely on red/green alone.
-   Use chart types appropriate to the question and provide text
    summaries or accessible data alternatives.
-   Avoid 3D charts and excessive gradients.
-   Make cards and charts reflow cleanly on mobile.

### Status indicators

-   Use consistent labels and visual patterns for success, pending,
    warning, failed, inactive, and unknown.
-   Include text, not just colored dots.
-   Do not display stale status as if it were current; show timestamps
    where relevant.

## 11. Dialogs, drawers, menus, and floating controls

-   Prefer inline or page-level workflows when they are easier to
    understand than a modal.
-   Use dialogs only for focused tasks that require attention or
    confirmation.
-   Use drawers for contextual editing when preserving page context is
    helpful; on mobile, consider a full-screen route or sheet.
-   Do not open a major application page inside a tiny modal or popup.
-   Dialogs must have an accessible name, correct focus management,
    Escape handling where appropriate, and focus restoration on close.
-   Prevent background interaction when a modal dialog is open.
-   Menus must stay inside the viewport and support keyboard navigation.
-   Floating action bars must not cover content, respect safe areas, and
    remain discoverable. Expanded states must have clear close/collapse
    behavior and accessible labels.
-   Avoid surprising auto-opening overlays.

## 12. Accessibility baseline

Target WCAG 2.2 AA and use semantic HTML. - Use landmarks: header, nav,
main, and footer where appropriate. - Maintain logical heading order; do
not choose heading levels only for visual size. - Ensure all
functionality works with keyboard alone. - Provide visible
`:focus-visible` styling; never remove outlines without an equivalent. -
Use accessible names for icon buttons and form controls. - Associate
field labels, descriptions, errors, and status announcements
programmatically. - Provide sufficient color contrast and do not use
color alone to communicate information. - Provide text alternatives for
meaningful images; decorative images should be ignored by assistive
technology. - Use appropriate ARIA only when native HTML semantics are
insufficient. - Announce dynamic feedback and asynchronous results to
assistive technology when necessary. - Support zoom and text resizing
without loss of content or functionality. - Respect reduced-motion
preferences. - Avoid keyboard traps and ensure focus order follows the
visual/task order. - Test with keyboard and at least one screen reader
when feasible.

## 13. Interaction and functionality audit

For every interactive component, verify the complete behavior, not just
its appearance.

### Global audit

-   Navigation links lead to the correct route and active state updates.
-   Search returns relevant results, supports empty results, and has a
    clear reset path.
-   Filters and sorting actually change the result set and preserve
    sensible state.
-   Pagination changes pages correctly and handles first/last/empty
    pages.
-   Forms validate, submit, show progress, surface errors, and confirm
    success.
-   Save/cancel/reset actions behave correctly; cancel does not silently
    discard data without appropriate warning.
-   Dialogs, drawers, dropdowns, tooltips, tabs, accordions, and menus
    open and close correctly.
-   Keyboard navigation and focus management work.
-   Permissions and role restrictions remain enforced.
-   Loading, error, empty, success, offline, and permission-denied
    states are handled.
-   Duplicate submissions are prevented where necessary.
-   Links open in the intended context; external links are identifiable
    when needed.
-   Destructive actions require appropriate confirmation and provide
    clear outcomes.
-   Responsive navigation and controls work on touch screens.
-   Browser back/forward navigation and refresh do not break the flow.
-   No console errors, missing assets, broken routes, or unintended
    network/API failures are introduced.

### Component contract

Every reusable interactive component should define: - Purpose and
expected user outcome. - Supported props and events. - Default, hover,
focus, active, disabled, loading, success, and error states as
applicable. - Keyboard and touch behavior. - Accessibility name/label
requirements. - Responsive behavior. - Validation and failure
behavior. - Tests for critical behavior.

Do not report an interaction as working solely because it looks correct.

## 14. Engineering and implementation standards

-   Follow the repository's established language, formatting, linting,
    naming, and architecture.
-   Reuse components; avoid copy-pasted variants of the same control.
-   Keep design tokens separate from business logic.
-   Prefer semantic HTML and native browser behavior.
-   Use CSS Grid and Flexbox appropriately; avoid layout built around
    arbitrary absolute coordinates.
-   Avoid `!important` as a routine override strategy.
-   Do not introduce brittle selectors tied to DOM nesting.
-   Keep component responsibilities clear and avoid giant components.
-   Preserve API contracts, database schemas, permission checks, routes,
    and state management unless explicitly requested.
-   Avoid adding dependencies for problems solvable with the existing
    stack.
-   Do not hardcode dimensions that prevent wrapping or responsive
    reflow.
-   Avoid layout shifts by reserving space for images and asynchronous
    content.
-   Keep forms and interactive components testable.
-   Do not leave debug output, dead code, TODO-only handlers, or
    placeholder buttons.
-   Do not silence lint/type errors to hide regressions.

## 15. Performance and resilience

-   Avoid unnecessary re-renders and expensive effects.
-   Load large screens, charts, and media efficiently where appropriate.
-   Use image sizing, compression, and lazy loading when suitable.
-   Avoid heavy animation and excessive shadow/blur effects.
-   Ensure the layout remains usable during slow requests.
-   Show skeletons only when they improve perceived continuity; avoid
    flashing placeholders for very fast responses.
-   Handle network failures and retries clearly.
-   Prevent content jumping when data loads.
-   Test with throttled network or slower devices for critical workflows
    when feasible.

## 16. Required design workflow

### Phase A --- Audit

1.  Inspect the app structure and existing UI system.
2.  Identify shared layout, tokens, components, routes, and important
    user journeys.
3.  Record the current behavior of key controls before changing them.
4.  Identify problems by severity: blocker, major, moderate, minor.
5.  Check representative screens at mobile, tablet, and desktop sizes.

### Phase B --- Systemize

1.  Define tokens for color, spacing, typography, radii, elevation, and
    motion.
2.  Standardize the application shell and page header.
3.  Create or improve reusable buttons, fields, selects, alerts, badges,
    cards, tables/lists, dialogs, and navigation.
4.  Define component states and accessibility behavior.
5.  Document patterns that other pages must follow.

### Phase C --- Implement

1.  Fix shared/global problems first.
2.  Apply the design system to representative screens, then propagate
    consistently.
3.  Preserve existing interactions and data flows.
4.  Implement missing loading, empty, error, and success states.
5.  Keep changes scoped and reviewable.

### Phase D --- Verify

1.  Run the project's available formatter, linter, type checker, unit
    tests, and build.
2.  Test critical user journeys before and after changes.
3.  Check responsive widths and browser zoom.
4.  Check keyboard operation and visible focus.
5.  Check console and network errors.
6.  Compare pages for inconsistent spacing, typography, controls, and
    navigation.
7.  Fix regressions before declaring completion.

### Phase E --- Report

Provide a concise implementation report containing: - Files/components
changed. - Shared design standards introduced or improved. - Responsive
widths and workflows tested. - Accessibility checks performed. - Tests,
lint, type-check, and build results. - Known limitations or checks that
could not be performed. - Any behavior intentionally left unchanged.

Never say "all tests pass" unless they were actually run and passed.

## 17. Definition of done

A UI/UX task is complete only when all applicable items below are true:

-   [ ] Existing functionality and business logic are preserved.
-   [ ] Shared design tokens and reusable components are used
    consistently.
-   [ ] Layout works at 320px through large desktop widths.
-   [ ] No unintended horizontal overflow, overlapping regions, clipped
    controls, or hidden actions.
-   [ ] Typography, spacing, button sizes, and heading hierarchy are
    consistent.
-   [ ] Every interactive control has a real action or a clearly defined
    disabled/non-interactive state.
-   [ ] Hover, focus, active, disabled, loading, and error states are
    appropriate.
-   [ ] Forms have visible labels and useful validation feedback.
-   [ ] Keyboard navigation and focus visibility work.
-   [ ] Color contrast and non-color status cues meet accessibility
    needs.
-   [ ] Loading, empty, error, success, and permission states are
    handled where relevant.
-   [ ] Mobile navigation, tables, menus, and floating controls remain
    usable.
-   [ ] No new console errors, broken routes, or critical test failures.
-   [ ] Build/lint/type checks are reported accurately.
-   [ ] The final report distinguishes verified behavior from
    assumptions or untested areas.

## 18. Standard instruction to the coding agent

When assigned a UI/UX task, first read this skill and inspect the
repository. Then audit the relevant screens and shared components,
explain the highest-impact issues briefly, and implement the smallest
coherent set of reusable changes that meets this standard. Apply
improvements across the app wherever the same pattern is used, not only
on the first page. Do not change functionality unless explicitly asked.
Test the result and report exactly what was and was not verified.

**Priority order:** correctness and preservation of behavior →
responsive usability → accessibility → clear hierarchy → consistency →
visual polish → decorative detail.
