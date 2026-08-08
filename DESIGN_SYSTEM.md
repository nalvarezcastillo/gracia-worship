# Gracia Worship Design System

> **Development rule:** Every new UI feature or redesign must reference and follow `DESIGN_SYSTEM.md`. If a new design decision conflicts with this document, update this document first before implementing the new UI.

## 1. Design Principles

- Clean, calm, compact, mobile-first, functional, and minimally decorated.
- Put information before ornament.
- Avoid marketing-style language and unnecessary emojis.
- Prefer lists over heavy cards.

## 2. Colors

| Role | Color |
| --- | --- |
| Primary green | `#22C55E` |
| Main background | `#09090B` |
| Elevated surface | `#18181B` |
| Border | `#27272A` |
| Primary text | `#FAFAFA` |
| Secondary text | `#A1A1AA` |
| Danger | Current rose/red destructive color used by the app |

Reserve green mainly for primary actions, selected states, success states, and active controls. Do not use it decoratively throughout the interface.

## 3. Typography

- Page title: 28px mobile, 32px desktop, bold.
- Section title: 20–24px, semibold.
- Item title: 16–18px, semibold.
- Body: 16px, regular.
- Metadata: 13–14px, secondary gray.

Use short, readable line lengths. Avoid unnecessary uppercase text.

## 4. Spacing

Use this scale whenever possible: 4px, 8px, 12px, 16px, 24px, 32px, and 48px.

Keep spacing compact inside rows and larger between sections. Avoid arbitrary values and excessive empty vertical space on mobile.

## 5. Border Radius

- Small controls: 10–12px.
- Buttons and inputs: 14–16px.
- Large containers: 18–24px.

Avoid mixing unrelated radius values.

## 6. Buttons

- Primary: green background; readable dark or white text according to the current implementation; minimum height 48px; radius 14–16px; clear pressed, disabled, and focus states.
- Secondary: dark neutral background, subtle border, white text.
- Danger: rose/red text or a subtle destructive background; never compete visually with the primary action.

All touch targets must be at least 44px.

## 7. Inputs

Use a dark surface, subtle border, white text, gray placeholder, visible green focus state, minimum height 48px, and clear labels above fields.

## 8. Lists and Cards

Prefer flat lists, subtle dividers, and compact rows. Use cards only when content needs clear grouping.

Avoid cards inside cards, heavy shadows, excessive borders, large empty containers, and oversized item rows.

## 9. Tabs and Segmented Controls

Use tabs or segmented controls for Audio, Letra, Partitura, Multitrack, and tonalidad selection.

They must be compact and touch-friendly. Active states use green; inactive states use muted gray. Avoid oversized pills and decorative animation.

## 10. Icons

Use the existing icon system consistently. Do not use emojis in the primary interface. Use thin, simple icons that support meaning rather than decoration, keep sizes consistent, and provide accessible labels for interactive icons.

## 11. Motion

Use 150–200ms transitions with subtle opacity, color, or small movement only. Avoid bouncing, dramatic scale effects, and distracting loading animations.

## 12. Mobile Behavior

- Design mobile-first and prevent horizontal overflow.
- Keep controls reachable with one hand.
- Ensure bottom navigation does not cover content.
- Allow long labels to wrap naturally and metadata to stack on small screens.
- Keep audio and PDF controls usable on iPhone.

## 13. Accessibility

Require visible keyboard focus, accessible button labels, sufficient contrast, semantic headings, and minimum 44px touch targets. Never hide an essential action only behind hover. Dialogs require a clear title and close action.

## 14. Writing Style

Public UI language must be Spanish, concise, direct, and functional, without commercial slogans, filler copy, or unnecessary technical language.

Good examples:

- Próximo servicio
- Agregar canción
- Guardar
- No hay audio disponible

Avoid:

- Todo lo que tu equipo necesita
- La solución definitiva para tu ministerio
- Marketing-style claims

## 15. Screen-Specific Guidance

### Home

- Keep the logo prominent and the header minimal.
- Do not add a subtitle.
- Prioritize service information.

### Songs

- Use a compact alphabetical list.
- Show the metadata line: `Tonalidad • BPM • Compás`.

### Song Detail

- Use a clear title and compact tonalidad selector.
- Provide Audio / Letra / Partitura / Multitrack navigation.
- Keep reference audio visible in Letra and Partitura.

### Service

- Use a professional run-sheet appearance, flat list, and subtle dividers.
- Do not nest song cards.

### Rehearsal

- Keep it read-only, focused, and minimally navigated.
- Do not show administrative controls.

### Admin

- Use functional forms and clear grouping without decorative complexity.

## 16. Development Rule

Every new UI feature or redesign must reference and follow `DESIGN_SYSTEM.md`.

If a new design decision conflicts with this document, update the document first before implementing the new UI.

## 17. Responsive Experience

- Design mobile-first and enhance the composition progressively for larger screens.
- Use Tailwind breakpoints consistently: mobile below `768px`, tablet from `768px` to `1023px`, and desktop from `1024px` (`lg`) onward.
- Never detect layout through the user agent. Responsive behavior belongs in CSS and component presentation.
- Mobile prioritizes one-column flows, controls of at least 44px, reachable actions, accordions and compact summaries without horizontal scrolling.
- Desktop should use additional width intentionally through balanced columns, supporting panels, denser metadata and whitespace. Do not merely stretch mobile layouts.
- Queries, state, mutations, validation, permissions and domain types must remain shared across every viewport.
- Prefer one component with responsive CSS when the information hierarchy and interaction order remain substantially the same.
- Create separate `Mobile` and `Desktop` presentation components only when markup or interaction composition is materially different. Keep their business logic in a shared parent, hook or helper.
- Do not render duplicated responsive trees when CSS can express the layout cleanly.
- Tablet should adapt naturally from the same components; do not introduce a third application layout.

## 18. Component Foundation

- Use `AppPage` for standard page padding, width and page headers.
- Use `AppSectionCard` for dashboard modules and `AppFormSection` for grouped form content.
- Use `AppList` and `AppListRow` for flat divided lists, and `AppEmptyState` when those lists have no content.
- Use `AppSearch` for labeled searches, `AppActionBar` for related actions, `AppStatusBadge` for compact status labels and `AppConfirmDialog` for confirmation overlays.
- Reuse the class tokens in `src/components/ui/styles.ts` for fields, labels, rows, focus states and expand/collapse transitions.
- Standard page spacing is 32px on mobile and 48px from `sm`; section spacing is 24px on mobile and 32px from `sm`.
- Standard controls are 48px high with a 16px radius. Row actions remain at least 44px high with a 12px radius.
- Standard cards use a 24px radius, the shared subtle border, elevated background and shared shadow.
- Standard motion duration is 200ms for hover, focus and expand/collapse transitions.
- Standard interface icon sizes are 16px, 18px, 20px and 24px. Choose the smallest size that remains clear.
