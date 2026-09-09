# Equals-Style Palette — Design

**Date:** 2026-09-09
**Status:** Approved for planning
**Scope:** `frontend/` — every page, not a single screen

## Goal

Re-skin the entire frontend in the palette taken from the Equals landing page
reference: lavender, cyan, mint, yellow and cream on white, with black ink.

The current theme is deliberately monochrome. Its `globals.css` carries the
rule this design must not break:

> Status colors (green/amber/red) are kept ONLY for semantic alert & health
> states.

That rule survives. Colour becomes decorative *everywhere except* alert
severity and device health, where colour continues to carry meaning.

## Decisions taken

| Decision | Choice |
|---|---|
| Status colours | Reskin chrome; alert severity and health keep saturated green/amber/red |
| Interior boldness | **Two-tier** — landing and login get the full treatment; inside the app, surfaces stay white/cream with a lavender sidebar |
| Typography | Unchanged. The request was a colour theme; Fira Sans / Fraunces stay |

The boldness decision was made against rendered mockups. The alternative
("Immersive": lavender as the page background throughout) was considered and
rejected because dense tables and Recharts panels read poorly on a tinted
ground.

## The palette

Extracted by sampling the reference image by region, not by eye. Contrast is
measured against the ink colour `#1A1225`.

| Token | Hex | Source region | Ink contrast |
|---|---|---|---|
| `--color-shm-lavender` | `#DBC2F8` | hero background | 11.31:1 |
| `--color-shm-lavender-soft` | `#E8CBFD` | testimonial card | 12.44:1 |
| `--color-shm-cyan` | `#39D3E3` | feature block | 10.03:1 |
| `--color-shm-cyan-soft` | `#C4FEFA` | card | 16.34:1 |
| `--color-shm-mint` | `#86FAC1` | feature block | 14.22:1 |
| `--color-shm-yellow-pastel` | `#FAFD9D` | feature block | 16.94:1 |
| `--color-shm-gold` | `#F2C466` | card | 11.12:1 |
| `--color-shm-coral` | `#FB7F87` | testimonial card | 7.33:1 |
| `--color-shm-cream` | `#EEEEE6` | section background | 15.56:1 |

Every pastel clears AA for normal text with ink on top. They are all used as
**backgrounds only** — never as text, never as 1px strokes (§5).

`--color-shm-yellow-pastel` is named to avoid colliding with the existing
`--color-shm-yellow: #f7a707`, which is the semantic warning colour and keeps
its name and value.

## 1. Token architecture

`globals.css` remains the single source of truth. Tailwind v4 is CSS-first
here, so there is no `tailwind.config`. Three moves, in order of leverage:

**Warm the neutrals.** `--color-slate-*` carries 517 uses (346 text, 112
border, 59 background). Shifting the ramp from pure grey to a cream-tinted grey
derived from `#EEEEE6` re-themes all 517 without touching a component.

**Warm the ink.** `--color-shm-navy-*` carries 209 uses and stays the dark ramp;
`#000000` becomes `#1A1225`, a plum-black that belongs to the lavender family.

This ramp **cannot** be repointed at lavender. `shm-navy-900` serves both text
(17 uses) and backgrounds (14 uses); remapping it would render 17 pieces of body
text as lavender on white. Separating ink from surface is why the accent tokens
below are new rather than substituted.

**Add the accent tokens** listed in the palette table. They are additive: no
existing utility changes meaning.

Roughly 730 of the ~930 colour utilities re-theme from these token edits alone.

## 2. Targeted component edits

The remaining ~200 uses are places where a surface must actually *become*
lavender or cyan rather than inherit a warmed neutral:

| Location | Change |
|---|---|
| `components/layout/sidebar.tsx:177` | `bg-shm-navy-900` → lavender surface, ink text |
| `app/page.tsx:91,101` | hero gradient `from/via/to-shm-navy-*` → lavender hero |
| `app/page.tsx` feature sections | cyan / mint / yellow colour blocks, per the reference |
| `app/(auth)/login/page.tsx` | split panel gets the lavender treatment |
| `components/ui/button.tsx` | primary action fill |
| `components/layout/app-shell.tsx:86` | top chrome |
| `components/ui/*` active/hover states | cyan accent |

## 3. Charts

56 hardcoded hex values exist, mostly Recharts axis and grid colours
(`#e2e8f0`, `#cfdde9`, `#1f2937` in `analytics/page.tsx` and `graph-card.tsx`).
These become tokens.

Series colours are **deepened** palette hues, not the pastels themselves: a 1px
`#39D3E3` line on white is too faint to trace. All five clear 4:1 on white,
comfortably above the 3:1 non-text threshold:

| Series | Hex | On white |
|---|---|---|
| 1 | `#0E8C9B` | 4.01:1 |
| 2 | `#7C5BC7` | 5.03:1 |
| 3 | `#24866A` | 4.47:1 |
| 4 | `#A87516` | 4.02:1 |
| 5 | `#A34E8F` | 5.19:1 |

Red, amber and green hues are deliberately **excluded** from the categorical
ramp, so a chart series can never be mistaken for an alert state.

The `dataviz` skill must be loaded before any chart code is written.

## 4. Status colours — one real fix

`shm-green`, `shm-yellow` and `shm-red` keep their values. The badge pattern in
`components/ui/status-badge.tsx` — a 10-12% tint background with saturated text
— is sound and stays.

Measuring it did surface one genuine pre-existing failure:

| Badge | Text on its own tint | Verdict |
|---|---|---|
| red | `#cc1c16` on `#FAE8E8` | 4.75:1 — passes |
| amber | `#b45309` on `#FEF4E1` | 4.60:1 — passes |
| **green** | `#379745` on `#EBF5EC` | **3.31:1 — fails AA** |

Badge text is 11px, so it needs 4.5:1. Fix: add `--color-shm-green-text:
#2A7A36` (4.78:1) for text on tint, leaving `--color-shm-green: #379745` for
dots and fills, where the 3:1 non-text threshold applies and it passes.

This is in scope only because the work already touches how status colours are
defined. No other status behaviour changes.

**Constraint:** do not convert badges to solid saturated fills with white text.
White on `#f7a707` is 2.00:1 and would fail badly.

## 5. Accessibility rules

- Pastels are backgrounds only — never text, never thin strokes.
- Every text/background pair verified at AA (4.5:1) before it ships.
- Chart series verified at 3:1 minimum against their plot background.
- Colour is never the sole carrier of alert state; the existing badge text
  labels (`CRIT`, `WARN`, `OK`) remain.

## 6. Sequencing

| # | Phase | Gate |
|---|---|---|
| 1 | Token edits in `globals.css` (neutrals, ink, accents, green-text) | `next build` clean; app renders warmed neutrals |
| 2 | Landing page + login full treatment | Visual check |
| 3 | Sidebar, app-shell, buttons, active states | Visual check |
| 4 | Charts: hex → tokens, series ramp | Contrast re-measured |
| 5 | Sweep remaining hardcoded hex | `grep` finds no stray hex outside tokens |

Phase 1 is deliberately first and alone: it is the change with the widest blast
radius and the easiest revert, so any surprise shows up before component edits
are layered on.

## 7. Interaction with the MVC restructure

The approved-but-unreviewed MVC spec
(`2026-09-09-mvc-restructure-design.md`) renames `frontend/src/components/` to
`views/`. Theming edits file *contents*; the restructure moves *files*. They do
not collide logically, but the file paths named in §2 are pre-restructure paths.

**Do the theming first.** Then the restructure's `git mv` carries the new
colours along untouched. Restructuring first would leave every path in §2 stale.

## 8. Out of scope

- Typography, spacing, border radius, motion. Colour only.
- Dark mode. None exists today and none is added.
- The `frontend/public/brand/` assets. `company-logo.png` is a fixed brand mark
  and is not recoloured.
- Backend, Python services, firmware.
