# Vektiss embedded video review studio

## Design direction
**Existing Vektiss client-space system** — preserve the current dark, precise workspace interface and bring the review task into a focused, branded player instead of navigating clients out to Dropbox.

## Core principles
- Keep clients in the portal for the complete review decision.
- Present one selected video at a time inside a restrained review canvas, with a numbered playlist that makes folder order clear.
- Make the current item, watched state, and approval decision readable at a glance.
- Treat Dropbox as a secure source system, never as the visible review experience or a credential exposed to the browser.

## Layout and interaction
- Use a compact delivery header with project context and a review-progress summary.
- Use a responsive two-column review studio: playlist on smaller side / player and feedback controls on the main side; stack vertically on narrow screens.
- Selecting a playlist entry loads only that file in a native, in-portal video player. Playback records **Viewed** separately from approval.
- Keep per-video approve, decline, and suggestions actions directly beneath the player, so the decision clearly belongs to the open video.

### Mobile review mode
- Treat mobile as a **video-first review surface**, not a shrunken desktop workspace: the selected video appears immediately below the delivery header instead of after the complete playlist.
- Provide a compact two-option switcher—**Watch** and **Videos**—so clients can move between focused playback and a Dropbox-style file list without long scrolling.
- Keep the mobile video list dense and scannable: numbered rows, clear viewed state, and no repeated pending labels that consume screen space.
- Size portrait videos for the available phone height and center them without oversized landscape letterboxing; retain native controls and fullscreen behavior.

## Visual system
- Continue the Vektiss dark navy/black surfaces, blue primary accents, subtle borders, and compact status badges.
- The player frame uses a quiet dark panel, a small Vektiss review label, and no third-party chrome.
- Use emerald for approved, amber for awaiting review, destructive red for change requests, violet for suggestions, and sky for viewed state.

## Brand essence and voice
- **Brand essence:** an organized, confident creative-review workspace.
- **Voice:** direct and calm — clear about what is being reviewed, viewed, and decided without exposing underlying delivery mechanics.
