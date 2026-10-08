# Vektiss embedded creative review studio

## Design direction
**Existing Vektiss client-space system** — preserve the current dark, precise workspace interface and bring every reviewable creative asset into a focused, branded viewer instead of navigating clients out to Dropbox.

## Core principles
- Keep clients in the portal for the complete review decision.
- Present one selected video or graphic at a time inside a restrained review canvas, with a numbered asset list that makes folder order clear.
- Make the current item, viewed state, media type, and approval decision readable at a glance.
- Treat Dropbox as a secure source system, never as the visible review experience or a credential exposed to the browser.

## Layout and interaction
- Use a compact delivery header with project context and a review-progress summary.
- Use a responsive two-column review studio: an asset list on the smaller side and a preview with feedback controls on the main side; stack vertically on narrow screens.
- Selecting an asset loads only that video or graphic inside Vektiss. Opening an asset records **Viewed** separately from approval.
- Render portrait and landscape videos with native controls; render PNG, JPG, JPEG, WebP, GIF, and AVIF graphics in a contained canvas with a dedicated maximize action.
- Keep per-item approve, decline, and suggestions actions directly beneath the preview, so the decision clearly belongs to the open asset.

### Mobile review mode
- Treat mobile as a **preview-first review surface**, not a shrunken desktop workspace: the selected video or graphic appears immediately below the delivery header instead of after the complete asset list.
- Provide a compact two-option switcher—**Preview** and **Items**—so clients can move between focused review and a Dropbox-style file list without long scrolling.
- Keep the mobile item list dense and scannable: numbered rows, graphic/video labels, clear viewed state, and no repeated pending labels that consume screen space.
- Size portrait videos and graphics for the available phone height, retain native video fullscreen behavior, and provide a full-screen in-portal graphic view.

### Shareable creative-review links
- Every new creative delivery receives a **private, no-login review link**. The link displays only that delivery and its items; every other Vektiss workspace area remains behind the normal client sign-in.
- The delivery email links directly to the private review page. Ops can also choose **Copy link** for a fresh private URL or **Send client link** to email a fresh URL to the client.
- Links use 256-bit opaque tokens stored as SHA-256 hashes, expire after 30 days, and may be independently revoked later without changing the underlying delivery. A public link can view, mark viewed, and submit approve / changes / suggestions only for its own delivery.
- Dropbox playback remains server-mediated. A public page never receives Dropbox credentials or a Dropbox folder URL; it receives only a short-lived asset stream token after the delivery-link check succeeds.

## Visual system
- Continue the Vektiss dark navy/black surfaces, blue primary accents, subtle borders, and compact status badges.
- The viewer frame uses a quiet dark panel, a small Vektiss review label, and no third-party chrome.
- Use emerald for approved, amber for awaiting review, destructive red for change requests, violet for suggestions, and sky for viewed state.

## Brand essence and voice
- **Brand essence:** an organized, confident creative-review workspace.
- **Voice:** direct and calm — clear about what is being reviewed, viewed, and decided without exposing underlying delivery mechanics.
