# Branded link preview for portal.vektiss.com

## Problem
When the portal link is shared in Messages, the preview shows an old screenshot of the sign-in page. The page's share image currently points at that auto-captured screenshot.

## What changes
- Create a branded 1200x630 share card: Vektiss logo centered on the dark brand background, with "Vektiss Portal" and a short tagline (e.g. "Clients, projects and creative reviews in one place").
- Point the link preview (og:image and twitter:image) at that card on portal.vektiss.com.
- Tidy the preview text: title "Vektiss Portal", description written for clients rather than "agency management portal", add og:url, remove the "@Lovable" Twitter handle.

## After approval
- Publish so the live site serves the new preview.
- iMessage caches previews per link; old threads may keep the old image. New shares (or the link with `?v=2` appended) will show the new card.

## Technical details
- Build the card from `public/vektiss-logo.png` with ImageMagick into `public/og-image.png` (under ~300 KB).
- `index.html`: og:image / twitter:image = `https://portal.vektiss.com/og-image.png`, add og:image:width/height, og:url, og:site_name; drop twitter:site.
