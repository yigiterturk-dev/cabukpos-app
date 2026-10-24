# ÇabukPOS — Suitable public functional reference dossier

## Brief

- Existing product: ÇabukPOS restaurant POS. User requests equivalent useful functionality while explicitly forbidding copying Suitable's design.
- Audience: cashier, waiter, kitchen staff, dispatcher, courier, owner.
- Goal: complete routine restaurant workflows and expose controls where the operator needs them.
- Scope: exploratory public reference analysis, functional comparison only. Existing ÇabukPOS design remains authoritative. No new brand/art-direction project or production deployment is authorized by this document.

## Reference matrix

### E1 — https://suitablepos.com/suitablepos-kilavuz

- User-selected quality: good courier screens and complete operating features.
- Observed: public guide describes order stages, courier reports, optional repeating sound, compact kitchen controls, single-product split payments.
- Inferred: these functions reduce screen switching during peak service. This is a hypothesis, not a measured usability result.
- Unavailable: authenticated live POS, current private UI, provider contracts, actual delivery API behavior, mobile Employee screens, live GPS and payment execution.
- No live performance, CSS, motion, accessibility or reliability comparison is claimed.

### E2 — https://suitablepos.com/assets/img/guide/odeme5.png

- Observed visually in browser: published 1600×865 screenshot. Unpaid items are at left; a split action is beside an item; calculator and payment controls occupy the other side.
- Guide separately describes choosing a number of shares, then paying selected shares.
- Transferable principle: split an individual shared dish without forcing the whole bill into an equal division.
- Signature excluded: calculator layout, icons, orange navigation, brand, typography, assets and copy.
- Limit: screenshot is documentary evidence, not an interactive test of their implementation. Exact monetary rounding is unknown.

### E3 — https://suitablepos.com/assets/img/guide/mutfak2.png

- Observed visually in browser: dense kitchen card grid with page indicator, card-count controls, scale slider and compact toggle.
- Guide describes text/product information, preparation stages and compact mode for busy periods.
- Transferable principle: let kitchen staff change density/readability and filter tickets while retaining the same ticket workflow.
- Signature excluded: header, red strip, exact arrangement, controls, assets and styling.
- Limit: no rendered mobile reference or computed CSS/JS evidence is available; no animation or breakpoint behavior is inferred from the image.

### E4 — previously inspected courier images

- https://suitablepos.com/assets/img/guide/kurye1.png
- https://suitablepos.com/assets/img/guide/kurye2.png
- https://suitablepos.com/assets/img/guide/kuryesistemi1.png
- Observed: courier list, selected-courier report, map, platform/order/payment columns. These informed the preceding functional comparison; no images or UI code were copied into the product.

## Synthesis / implementation ledger

- Already implemented locally: dispatch stages, ready/assignment, courier workload, dated order history, CSV/print, opt-in foreground location sharing, guarded server endpoints.
- This iteration: single-line shares with automatic remaining-share count, conserved rounding of monetary gross and quantity, compact kitchen search/stage/page/readability controls, persistent sound/repeat preferences.
- Found in our implementation: independently rounding three fractional quantities could lose a cent. Corrected by selecting the nearest representable quantity that preserves both remaining gross and quantity; discounts remain proportionally allocated. Shares may differ within existing 0.001-unit precision; the UI states this. Tests cover 108 price/quantity/division combinations and actual server sync.
- Still unverified/unimplemented: external courier provider call, multi-marker overview/route optimization, background mobile tracking, provider-specific automatic status updates, field hardware/GPS verification. Do not advertise these as completed.
- Keep existing identity, layouts and terminology. Documented behavior is a requirement candidate; reference screenshots are not art-direction authority or runtime certification.

## Gate

### 2026-10-25 breadth review

The public guide's 20-module contents were surveyed beyond courier screenshots. The operational comparison, repository evidence, unknowns and ordered gaps are recorded in `docs/suitable-workflow-comparison.md`. Detailed reading focused on provider setup, order controls, kitchen, payment and courier lifecycle. Stock/production sections were read separately because the first text extraction was truncated. This is not a claim that all 262 images or authenticated screens were inspected.

User requirement corrected: newly provisioned platform connections auto-accept by default and issue kitchen tickets; the sample incoming platform order uses that workflow. Existing opt-outs are preserved. External courier dispatch remains a separate unimplemented integration.

REFERENCE GATE: PASS

Scope of pass: public functional analysis only. Desktop screenshots observed; mobile/live implementation explicitly unavailable. No premium-design handoff or production approval is granted.
