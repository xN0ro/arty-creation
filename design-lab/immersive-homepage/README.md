# Arty Creation — The Living Canvas

A fully standalone, animated homepage **design prototype**. It is intentionally isolated from the production app, payment flow, CRM, inventory and event backend.

## Open it without a server

1. Download this branch as a ZIP from GitHub, or download the separate preview ZIP provided in ChatGPT.
2. Open design-lab/immersive-homepage/index.html in Chrome, Edge, Firefox or Safari.
3. Scroll slowly; the art kit unboxes as you move down the page.
4. Try the Studio slider, mouse-responsive artwork, FR/EN toggle and Motion toggle.

**No npm, no Render, no localhost, no API credentials, no internet access required.** All illustrations are embedded as SVG/CSS, all scripts are local. The browser address may start with file:/// — that is expected.

## Included

- Immersive art-studio hero with a floating canvas, paint tubes and brush
- Pinned scroll-controlled art kit animation in three chapters
- Draggable before/after Studio Arty picture-to-painting effect
- Responsive 3D-tilt gallery of Arty experiences
- Grand animated finale
- EN/FR toggle, reduced-motion option and mobile layout
- Keyboard-accessible interactive comparison

## Scope

This is a design exploration, **not a finished integration**. Copy, visual assets, buttons and events are demonstration content; it does not place orders, reserve tickets, access user data or make network requests.

### Safety

- Do not merge this branch into main unless you want to integrate the design.
- Render is configured to deploy main only, so this branch does not deploy.
- No changes were made to the live homepage at public/index.html.
- To integrate, recreate the chosen sections in the real homepage and connect real kit/event data carefully. Keep the production security and payment code untouched.

## Structure

- index.html : accessible structure and original inline SVG art
- styles.css : layout, palette, 3D objects and responsive styles
- app.js : scroll choreography, bilingual copy and UI interactions

Created for Arty Creation, 2026.