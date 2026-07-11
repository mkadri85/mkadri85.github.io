# Decision Log - mkadri85.github.io

Chronological record of the design and content decisions behind this site,
so future sessions (human or AI) inherit the reasoning, not just the result.

## 2026-07-05..07 - Site + blog foundation
- Dark single-page portfolio on GitHub Pages (this repo = production, main
  branch auto-deploys). Blog at /blog/ with two long-form articles.
- Articles cross-posted to Substack (mohamedkadri.substack.com) with
  canonical pointing here, and republished as LinkedIn articles.

## 2026-07-10 - Executive palette
- Problem: original neon teal (#34e0c8) + violet (#9a7bff) read
  "junior/startup" for a senior delivery-leadership brand.
- Decision: single steel-blue accent (#4f8fc9) on deep navy, matching the
  navy CV template (#16365f family). One accent hue only.
- Also: side portrait in hero (assets/portrait.jpg), bold sans wordmark
  (cursive retired), blue italic MK favicon.

## 2026-07-10 - Share card (OG) iterations
- v2: navy typographic card. v3: added portrait right. v4 (current): moved
  the site URL onto the navy panel for contrast. Versioned filenames on
  purpose - Meta/LinkedIn cache OG images by URL.

## 2026-07-11 - Credential honesty sweep
- Removed PMP everywhere (Mohamed completed PMP prep only - never certified).
  Removed ITIL-as-certification. Certs shown: MBA, CBAP, AZ-900 in progress.
- Anonymized end-customers (du -> Tier-1 UAE operator, MTN dropped,
  Zain -> Tier-1 KSA operator). Genericized PowerStar -> traffic-aware
  power adaptation, reframed as green-network story (CO2, green indicators).
- Metric ownership fixed: 11% OPEX belongs to energy only; 99.95%
  availability belongs to OSS migration only; 75% automation at 99.6% SLA.
- Downloadable CV behind the hero button = the Europe/master CV, regenerated
  from backend/assets/cv sources in the careeragent repo.

## 2026-07-11 - SEO + AI discovery
- Google Search Console verified (HTML file), Bing verified (BingSiteAuth),
  sitemap submitted both, IndexNow key hosted + all URLs submitted.
- Title/description shortened to Bing limits; og:site_name + WebSite JSON-LD
  added (Google was showing "GitHub Pages documentation" as site name).
- Favicon moved from data: URI to hosted files (Google cannot fetch data
  URIs - result showed a generic globe).
- llms.txt added; robots.txt explicitly welcomes AI crawlers.
- Person schema enriched: portrait image, jobTitle "Cloud and Digital
  Transformation Delivery Leader", sameAs -> LinkedIn, GitHub, Substack,
  npm (~mkadri - NOT mkadri85; verified via registry).

## 2026-07-11 - Mobile + routing
- Added hamburger menu (nav links were display:none on mobile with no
  replacement). Plain-CSS dropdown + small toggle script.
- Added homepage "Writing" cards so both articles are directly routed from
  the homepage (previously reachable only via /blog/).

## Positioning (mirrors the CV set in the careeragent repo)
- Brand spine: transformation delivery at scale, now cloud/AI-enabled.
  Telecom = proof of scale, not identity.
- Headline style: real searched job titles, not vanity phrases.
- Related repos: careeragent (CV presets + Telegram automation),
  guardplane (open-source proof piece), relay-marketing-console (showcase).
