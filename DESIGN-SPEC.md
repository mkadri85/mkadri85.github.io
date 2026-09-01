# mkadri85.github.io - Design spec: "Engineering print"
(v1, 2026-09-01. Authoritative for all prose pages. Demos are exempt by design.)

## Concept
The site reads like a well-set technical journal written by a working
engineer; the interactive demos stay dark NOC consoles. Reading is paper,
operating is a console - that contrast is the identity. The visual language
matches the figures published under Mohamed's name in Microwave Journal
(Nov 2026): navy ink, steel blue, light-blue panels, one amber accent.

## Tokens - dual theme, follows the system (prefers-color-scheme)
Light is defined on :root; dark overrides the same variables inside
@media (prefers-color-scheme: dark). Never hardcode a colour in a page.
All values verified 2026-09-01 (WCAG ratio / APCA Lc on their background):

| role      | light    | WCAG/APCA   | dark     | WCAG/APCA   |
|-----------|----------|-------------|----------|-------------|
| --bg      | #f7f9fb  | -           | #111926  | -           |
| --panel   | #e9f1f8  | -           | #1a2534  | -           |
| --line    | #c8d4de  | -           | #2b394c  | -           |
| --ink     | #1d2b3f  | 13.5 / 97   | #dbe4ee  | 13.7 / 89   |
| --head    | #14365c  | 11.6 / 94   | #e8eef6  | 15.1 / 95   |
| --mut     | #3f5166  | 7.7 / 84    | #aebccd  | 9.1 / 64    |
| --dim     | #4a5b6d  | 6.6 / 80    | #a8b8ca  | 7.9 / 62    |
| --accent  | #35648f  | 5.9 / 77    | #85aed4  | 7.6 / 55    |
| --amber   | #9a640b  | 4.7 / 71    | #e2a94e  | 8.4 / 60    |
| --warn    | #b3261e  | errors only | #ff8a80  | errors only |

Floors: body >= 7:1 and Lc >= 75 in both themes (achieved: 13+ / 89+).
Secondary text never below 4.5:1. Dark text is soft gray on dark navy -
never pure white on black (halation). Large decorative amber: #f5a623
light / #e2a94e dark, shapes only, never small text.

## Type
Display: Space Grotesk (600/700) - headings, nav brand. Retained: it is
         already his mark.
Body:    Source Serif 4 (400/600), 18px/1.65, measure 68-74ch. The print
         voice - this is the deliberate risk that separates the site from
         every sans dev blog.
Utility: IBM Plex Mono (400/500) - eyebrows, figure captions, dates, read
         time, tags. The instrument-panel voice.
Arabic:  Noto Naskh Arabic for AR body; Space Grotesk stays for latin brand.

## Layout
One shell: max-width 1200px. One content measure: 720px. Header: paper,
navy brand, 1px --line bottom rule, <=5 nav items. Footer mirrors header.
No floating share-rail ghosts; share row sits at article end.

## Signature: "the plate"
Figures, ToC, and callouts are typeset as numbered plates the way a journal
does: mono eyebrow (FIG. 3 / IN THIS ARTICLE / TABLE 1), navy rule above,
caption in --dim mono below. Echoes the published MWJ figures exactly.

## Rules
- One amber per viewport. If two things scream, neither is heard.
- Panels are --panel with 1px --line and 10px radius - like the printed
  stage cards, never drop-shadow cards.
- Demos (projects/mw-loop, consoles) keep their dark NOC styling. The
  transition INTO a demo is the only place a dark block appears on paper.
- Contrast floor: 4.5:1 for text, 3:1 for large display text.
- Focus states visible (2px steel outline); reduced-motion respected.
- Never reintroduce: #0a0e16 backgrounds on prose, violet-named blues,
  seven different max-widths.
