# Brand and Design Guidelines - mkadri85.github.io

Single source of truth for anyone (human or AI) editing this site.
If a change conflicts with this file, this file wins unless Mohamed says otherwise.

## Palette - "Executive Navy" (adopted 2026-07-10)

Every page on this site (home, blog index, all articles) and every derived
asset (OG cards, favicons, CV PDFs) uses this palette. The old neon
teal/violet palette (#34e0c8 / #9a7bff / #2dd4bf / #8b5cf6) is RETIRED -
never reintroduce it.

| Token      | Value                  | Use |
|------------|------------------------|-----|
| --bg       | #0a0e16                | page background |
| --bg2      | #0d1220                | alternate section background |
| --panel    | #121a29                | cards, panels |
| --panel2   | #17202f                | nested panels, chips |
| --line     | #243044                | borders, dividers |
| --ink      | #eef1f6                | primary text |
| --mut      | #9aa6b8                | secondary text |
| --dim      | #6a7689                | tertiary text |
| --accent   | #4f8fc9                | THE single accent (steel blue) |
| --accent2  | #77aede                | lighter accent, gradient end |
| --glow     | rgba(79,143,201,.10)   | glows, focus rings |

Rules:
- ONE accent family only. No second hue (no teal, violet, green, orange).
- Gradients run accent -> accent2 only.
- rgba tints derive from 79,143,201.
- CV PDFs use the print variant: navy #16365f / #24507f on white.

## Typography
- Headings: 'Space Grotesk', fallback Inter. Letter-spacing -0.02em.
- Body: Inter.
- Wordmark ("Mohamed Kadri" in nav): bold Space Grotesk with a short
  34px accent underline. The old cursive 'Great Vibes' wordmark is retired.
- Favicon: blue italic "MK" (Georgia serif italic, #4f8fc9 on #0b0e14 tile),
  served as hosted files /favicon.svg + /favicon-96.png. NEVER as a data:
  URI (Google's favicon crawler cannot read data URIs).

## Content rules (apply to every page and asset)
- ASCII only: no em/en dashes, smart quotes, ellipsis chars, middots.
- Anonymize end-customers: "a Tier-1 UAE operator" not "du"; "a Tier-1 KSA
  operator" not "Zain"; no "MTN". Employer names (Huawei, Etisalat Misr) OK.
- No vendor product names for delivered solutions ("network-level
  traffic-aware power adaptation", not "PowerStar"/"iPowerStar").
- Credentials: Mohamed holds MBA, CBAP, BEng. He does NOT hold PMP, ITIL or
  ISO certs - never claim them. "AZ-900 in progress" / "CSPO in progress"
  are the only allowed in-progress claims (flip to certified when earned).
- Metric ownership (never mix): 75% Level-1 automation AT 99.6% SLA (AIOps);
  99.95% availability = OSS migration only; 11% OPEX = energy/power
  adaptation only. Power-site count is UNCONFIRMED - say "network-wide".

## Social / share assets
- OG card: assets/og-cover-v4.png (1200x630, navy, portrait right, URL on
  navy panel). When replacing, bump the filename version (og-cover-v5.png)
  to bust Meta/LinkedIn caches, and update og:image + twitter:image.
- Portrait: assets/portrait.jpg (640x799 headshot, dark studio background).

## SEO / AI-discovery surface (do not delete)
- googleef1e6f955e521658.html - Google Search Console verification
- BingSiteAuth.xml - Bing Webmaster verification
- d83d5eef6f32445c946ae939f049ef19.txt - IndexNow key
- sitemap.xml - update lastmod when pages change; ping IndexNow on publish:
  POST https://api.indexnow.org/indexnow with host, key, urlList
- robots.txt - allows all crawlers incl. AI bots; keep the explicit AI list
- llms.txt - curated map for LLMs; update when new articles publish
- Title <= 60 chars, meta description <= 160 chars (Bing flags violations)
- JSON-LD: WebSite (site name) + Person (jobTitle, image, sameAs to
  LinkedIn/GitHub/Substack/npm ~mkadri) on home; TechArticle with image on
  each article
