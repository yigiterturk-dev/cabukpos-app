# YanındaPOS vs SalonAppy — Exploratory Reference Dossier

## Brief

- Business: YanındaPOS
- Premium audience: Appointment-led service businesses in Türkiye
- Offer: Appointment, CRM, reminders, staff commission and payment/cash operations in one panel
- Proof currently visible: Product screenshots and feature descriptions; no customer proof found on the public landing page
- Desired perception: Fast, modern, self-serve and commercially complete alternative to legacy vertical software
- Protocol status: Standalone exploratory analysis; no Project Zero authority and no downstream production approval

## Reference matrix

### https://tr.salonappy.com/

- User-selected quality: Direct competitor, pricing/feature benchmark
- Observed messaging structure: Beauty-industry specialization, company scale, core features, device availability, references, pricing, add-on modules, FAQ and assisted sales form
- Observed page progression: Category promise → quantified trust → feature depth → desktop/mobile use → customer references → tiered packages → add-ons → FAQ → contact
- Observed visual system: Light, friendly SaaS presentation; blue pricing cards with green feature icons; dense but legible long-form sales page
- Observed interaction and motion: Pricing toggle and anchor navigation visible; user supplied a live desktop screenshot of pricing state
- Public implementation evidence: Public HTML exposes product, pricing, company metrics, mobile store links, feature pages, login and registration links
- Measurements: 3 core plans at 1,299 / 1,699 / 2,599 TRY per month; tax included. Public claims include 10+ years, 5,000+ salons, 81 Turkish provinces, 55 countries, 40 employees and 23 languages
- Transferable principle: Sell operational maturity with measurable proof, working conversion paths and ecosystem integrations
- Signature to avoid copying: Pink/blue beauty-sector branding and the exact card/feature arrangement
- Confidence and access limitation: High for public claims and the supplied pricing screenshot; authenticated product behavior was not inspected

### https://yanindapos.com/

- User-selected quality: Existing product to benchmark against SalonAppy
- Observed messaging structure: Multi-sector promise, product screenshots, feature modules, fixed-price plans, FAQ and final CTA
- Observed page progression: Broad promise → eight sector adaptations → feature screenshots → three plans → FAQ → CTA
- Observed visual system: Modern Next.js/Tailwind-style SaaS page with a clearer self-serve tone than SalonAppy
- Observed interaction and motion: Live browser control was unavailable because the installed browser package referenced a missing documentation asset. Public HTML was inspected directly instead
- Public implementation evidence: Next.js prerendered HTML, real screenshot asset paths and public copy. Most primary CTAs and footer legal/login links resolve to `#`; contact resolves to email
- Measurements: 3 plans at 2,000 / 3,500 / 5,000 TRY per month; VAT excluded. Eight advertised sectors. Five detailed product modules shown with screenshots
- Transferable principle: Keep the clear multi-sector positioning, product-first screenshots, no-commission promise and fast setup language
- Signature to avoid copying: Generic unverified SaaS claims without proof or functional conversion destinations
- Confidence and access limitation: High for public landing-page copy and link destinations; actual authenticated feature completeness was not verified

## Synthesis

- Shared principles: One-panel operations, tiered SaaS pricing, appointment/CRM/reminder workflow and assisted onboarding
- Productive tensions: YanındaPOS is broader and more self-serve; SalonAppy is narrower but far more proven and integrated
- Recommended hierarchy:
  1. Repair conversion and legal paths
  2. Add trust evidence and customer proof
  3. Close beauty-vertical operational gaps
  4. Prioritize ecosystem integrations and mobile access
  5. Defend the higher price with clear ROI or revise entry packaging
- Content requirements: Working demo/login, named customers, testimonials, migration promise, support SLA, security/data statement, integration badges, product comparison and ROI proof
- Technical implications: Real trial tenant/onboarding, authentication route, production legal pages, analytics on CTA funnel, import/export, channel integrations and a mobile/PWA roadmap
- Risks: Public site currently advertises a self-serve trial without a functional destination; price is higher than a proven competitor while tax treatment is less favorable; several capabilities may be marketing-only until verified in the authenticated product

## Gate

`REFERENCE GATE: BLOCKED — standalone analysis lacks Project Zero approval and authenticated product inspection; browser-control package was unavailable. Findings are suitable for prioritization, not final design authority.`
