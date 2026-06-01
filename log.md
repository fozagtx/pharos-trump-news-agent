# Walaxy Build Log

Last updated: 2026-06-01 19:37 GMT

Purpose: this is the living ledger of mistakes, hallucinations, UI failures, user objections, and corrected guardrails from the Walaxy build thread. Future work must update this file whenever the AI makes a wrong move, introduces noise, ignores the build goal, leaks into mock behavior, or the user raises a new objection.

Secret rule: never write private keys, seed phrases, tokens, or full secret values in this file. The private key shared in chat is deliberately redacted and must stay redacted.

## Core Product Intent

Walaxy is a real Sui Testnet and Walrus Testnet digital product marketplace where entrepreneurs launch products that can be bought by humans and agents.

Required architecture:

- No mock data.
- No seeded catalog.
- No fake products, fake buyers, fake purchases, fake receipts, fake metrics, or placeholder ledgers.
- The Sui Move contract is the source of truth for product identity and purchase records.
- Walrus stores real encrypted product bytes and manifests.
- Local runtime storage may hold encrypted delivery keys and operational metadata only; it must not become the marketplace catalog or purchase ledger.
- Wallet users must purchase through the Sui marketplace contract.
- Agent buyers must go through native x402 payment flow for Sui, then record/verify settlement on chain before delivery.

## Objections Raised By The User

1. The initial interface did not show the requested landing page.
2. The UI shown was considered useless and not requested.
3. The user explicitly said design was not the priority and the platform should work first.
4. The AI should have researched native Sui x402 instead of inventing or assuming a custom approach.
5. The user asked how the system worked after implementation because the architecture had not been explained clearly.
6. The user objected to storing marketplace state locally instead of on the contract.
7. The user asked what to put in:
   - `SUI_PACKAGE_ID`
   - `SUI_OPERATOR_CAP_ID`
   - `SUI_OPERATOR_SECRET_KEY`
   - `X402_SUI_FACILITATOR_SECRET_KEY`
8. The user wanted deployment with an existing private key from the terminal, not a casual requirement to paste secrets into environment files.
9. The user objected to being given too many commands at once.
10. The Sui CLI was missing from PATH, causing the deploy command to fail.
11. Existing hex key import failed because modern Sui expects `suiprivkey...` Bech32 format or conversion first.
12. The user asked for a simpler deployment path because they had the whole key material ready.
13. A Move build error occurred:
    - `referential transparency violated`
    - caused by reading `product.price` while `product` was mutably borrowed.
14. After deployment succeeded, the user asked whether the build was done and needed a clear next step.
15. Static configuration values did not belong in `.env`; the user wanted them in `config.ts`.
16. The user asked whether `SUI_OPERATOR_SECRET_KEY`, `X402_SUI_FACILITATOR_SECRET_KEY`, and `AGENT_SUI_SECRET_KEY` should all be the private key.
17. The user objected to creating shell helper files after they had already set values.
18. The user asked for app naming and logo work:
    - first "walky"
    - then corrected to "Walaxy"
19. The generated logo direction was rejected repeatedly.
20. The user objected to combining Sui imagery with random icons.
21. A network/checkpoint diagnostic was shown in the UI:
    - `Network`
    - `testnet`
    - `Sui RPC`
    - checkpoint value
    The user did not ask for this in the customer UI.
22. Wallet authentication was effectively fake because the dashboard could be seen while disconnected.
23. The user objected to the landing page implying the dashboard was the landing page.
24. The user asked to remove:
    - `No seeded catalog`
    - `Walrus blob IDs required`
    - `Sui digest verified before delivery`
25. The user asked to remove the generated logo.
26. The CTA `Launch on Testnet` was rejected.
27. Buttons needed to be boxy, not soft/rounded.
28. The arrow in front of or inside buttons was rejected.
29. The user supplied a specific palette:
    - `#220901`
    - `#621708`
    - `#941b0c`
    - `#bc3908`
    - `#f6aa1c`
30. The user asked for a header where the page scrolls underneath it.
31. The user asked for Saci-style animation on the right side of the hero text.
32. The user rejected the copy:
    - `See the payment path`
    - `Built for two buyers: people and agents`
33. The user asked for the landing page to feel architected, not merely designed:
    - persistent visible grid
    - hard two-column hero
    - permanent dividers
    - publishing-style sections
    - editorial headlines
    - data/protocol visual region
    - no floating cards
    - no generic SaaS composition

## Mistakes And Hallucinations

### M001 - Built design before proving the product path

The build moved into UI polish before the core Sui, Walrus, and x402 paths were made clear and working. This violated the user's priority: get the platform functioning first, design later.

Corrective rule: for protocol/product tasks, do not redesign unless explicitly asked. Build and verify the functional path first.

### M002 - Invented or over-weighted nonessential UI

The UI included diagnostics and proof-strip copy the user did not request. This made the product feel like a debug panel instead of a marketplace.

Rejected examples:

- network status pill
- checkpoint display
- `No seeded catalog`
- `Walrus blob IDs required`
- `Sui digest verified before delivery`
- `See the payment path`
- `Built for two buyers: people and agents`

Corrective rule: only expose operational diagnostics in dev/admin surfaces, not the public landing page, unless the user explicitly asks.

### M003 - Logo/name handling was careless

The app name shifted from Walky to Walaxy. The logo work invented low-quality marks and unrelated visual metaphors. The user rejected the generated result and later asked to remove the logo entirely.

Corrective rule: default to a text wordmark. Do not generate logos or visual marks unless requested, and never combine random chain/product icons as a brand.

### M004 - Wallet auth appeared enforced but was not

The disconnected wallet state still exposed dashboard content. That made the auth claim false.

Corrective rule: `/app` must render only the wallet gate while disconnected. Product launch, catalog, and agent checkout must not render until a wallet is connected.

### M005 - Native Sui x402 was not researched first

The AI should have searched for native Sui x402 support before implementing. A custom shim or guessed flow is the wrong default for payment standards.

Corrective rule: for Sui x402, use native/current packages and docs first. Current project rule: use `@tentaclepay/sui-x402` with `@x402/core` v2 headers:

- `PAYMENT-REQUIRED`
- `PAYMENT-SIGNATURE`
- `PAYMENT-RESPONSE`

Do not reintroduce a deleted custom x402 shim.

### M006 - Contract versus local source of truth was confused

The user objected to local storage because marketplace state belongs on chain. Local files cannot be treated as product catalog or purchase ledger.

Corrective rule: the Sui Move contract owns product records and purchase receipts. Runtime local storage may only support encrypted delivery material that cannot be public on chain.

### M007 - Deployment instructions were too noisy

The user was handed too many commands and hit missing CLI/key-format errors.

Corrective rule: give one short command block per step, with preflight checks:

- `which sui`
- `sui --version`
- `sui client active-env`
- `sui client active-address`

Then deploy. Do not drown the user in branching shell rituals.

### M008 - Sui key format was not handled plainly

The existing raw hex private key could not be imported directly by modern Sui CLI. The right move was to convert to `suiprivkey...` first or use the Sui keystore flow.

Corrective rule: never assume key format. Detect or ask only the format-sensitive question:

- starts with `suiprivkey` means import directly
- raw hex means convert first with `sui keytool convert`

Never print the converted private key back to the chat or logs.

### M009 - Secret role separation was unclear

The user asked whether three secret env vars should all be the same key. The AI needed to explain role separation before action.

Corrective rule:

- `SUI_OPERATOR_SECRET_KEY`: server signer for contract operator calls.
- `X402_SUI_FACILITATOR_SECRET_KEY`: facilitator/settlement signer for x402 flow.
- `AGENT_SUI_SECRET_KEY`: buyer-side test agent key.

They can be the same testnet key for a quick local test, but that is not a production model. Keep roles distinct where possible.

### M010 - Shell helper creation was unwanted

A helper shell file was created after the user had already set values. The user objected.

Corrective rule: do not add scripts/helpers unless they reduce repeated project work and the user has not rejected that path. For one-time secret handling, prefer terminal instructions.

### M011 - Move borrow bug

The Move contract hit a referential transparency error by reading an immutable field while the object was mutably borrowed.

Corrective rule: in Move, copy needed immutable fields into locals before taking mutable references or calling functions that borrow the object mutably.

### M012 - Static runtime config was put in `.env`

The user wanted non-secret defaults in `config.ts`, not `.env`.

Corrective rule: keep stable public defaults in `src/shared/config.ts`; `.env` is for deployment IDs and secrets only.

### M013 - Button and CTA direction ignored the requested visual language

Rounded CTAs, arrows, and the phrase `Launch on Testnet` conflicted with user direction.

Corrective rule:

- buttons are boxy
- no arrows unless explicitly requested
- public CTA should say `Open App` or direct functional copy
- no soft SaaS pill-button language

### M014 - Landing-page composition drifted into SaaS pattern

The user wants a structural page, not floating cards or marketing composition.

Corrective rule: the landing page must use structural dividers, hard section boundaries, a hard two-column hero, and publishing-system sections. The visible grid treatment must not be applied globally unless the user explicitly asks for page-wide grid again.

### M015 - Page-wide grid overreach

Timestamp: 2026-06-01 17:25 GMT

Trigger: the user said the grid was supposed to be only in the hero and objected to the page-wide grid and z-index layering.

Mistake: the landing CSS used fixed `.landing-page::before` and `.landing-page::after` overlays to draw grid lines across the whole page, plus extra stacking rules to keep those overlays behind content.

Impact: the page showed a global grid when the requested correction now requires the visible grid to stay in the hero. The implementation also added unnecessary stacking complexity outside the one place that needed a visual system.

Fix: removed the full-page fixed grid overlays and removed the extra landing-page stacking rules. The grid now stays in the hero visual region; lower sections keep only structural dividers and borders.

Prevention: when the user narrows a visual instruction, treat it as the active spec immediately. Do not preserve older global design rules that conflict with the newest objection.

### M016 - Wrong hero grid style, nav clutter, and colored CTAs

Timestamp: 2026-06-01 17:28 GMT

Trigger: the user provided a reference screenshot and said the grid should look like that, not the current dark square-grid canvas. The user also asked to remove `Protocol` and `Flow` from the header and said the button should not be colored.

Mistake: the hero visual used a dark technical grid with geometric line art instead of a light dotted data field. The header still contained extra navigation links, and the landing CTAs used filled accent colors.

Impact: the landing page still looked like an invented crypto/SaaS visual system instead of the user's reference direction.

Fix: replaced the dark hero canvas with a light dotted particle field, removed `Protocol` and `Flow` from the header navigation, and changed landing CTAs to neutral outline buttons.

Prevention: when the user supplies a visual reference, match the structural traits first: background weight, grid type, navigation density, and button treatment. Do not preserve previous art direction because it is already coded.

### M017 - Grid bled into the header

Timestamp: 2026-06-01 17:29 GMT

Trigger: the user asked why the grid was climbing into the header.

Mistake: the fixed header used a translucent background, allowing the hero visual/grid underneath to show through while scrolling.

Impact: the header lost its clean institutional surface and made the grid appear outside its intended hero region.

Fix: changed the header to a solid surface background and removed backdrop blur so the hero grid cannot show through it.

Prevention: if a header is supposed to sit above scrolling content, make the header surface opaque unless the user explicitly asks for transparency.

### M018 - Open App arrow and footer added by new instruction

Timestamp: 2026-06-01 17:33 GMT

Trigger: the user asked to add the diagonal arrow to `Open App` and add the footer.

Mistake: not a new failure; this supersedes the earlier no-arrow preference for this specific action.

Impact: the active visual rule changed. `Open App` now needs the diagonal arrow, while buttons remain neutral and not filled with accent color.

Fix: added a diagonal arrow icon to landing `Open App` actions and added a structural footer.

Prevention: preserve the latest explicit instruction. The no-arrow rule remains general, but `Open App` is now the named exception.

### M019 - Header still had grid/divider lines

Timestamp: 2026-06-01 17:36 GMT

Trigger: the user said to remove the grid lines from the header.

Mistake: after making the header opaque, the header still kept structural borders from `.landing-nav` and `.landing-links`, leaving visible vertical divider/grid lines in the header.

Impact: the header still looked tied into the page grid instead of being a clean solid bar like the reference.

Fix: removed the header nav left/right borders and the landing-links left divider. The only remaining line in the header area is the section boundary below the header.

Prevention: for the header, do not use grid dividers, column split lines, or nav partition borders unless explicitly requested.

### M020 - Landing Open App routed to /app

Timestamp: 2026-06-01 17:38 GMT

Trigger: the user said clicking `Open App` should open the wallet modal, not send them to `/app`.

Mistake: the landing `Open App` actions were anchor links with `href="/app"`.

Impact: the landing page left the page instead of initiating wallet connection in place.

Fix: replaced landing `Open App` anchors with Mysten `ConnectButton` triggers using the same neutral outline styling and diagonal arrow.

Prevention: on the landing page, `Open App` means open the wallet modal. Do not route to `/app` from these landing CTAs unless the user explicitly changes this flow.

### M021 - Hero grid touched header and lower sections stayed visible

Timestamp: 2026-06-01 17:42 GMT

Trigger: the user said the hero grid should not connect to the header, should have a bold top border, and asked to remove the Index/Sequence sections, lower Open App action, and footer.

Mistake: the hero visual grid started directly under the header boundary, and the page still rendered protocol/sequence explanatory sections plus footer content the user wanted gone.

Impact: the landing page still carried extra content and the hero visual looked attached to the header instead of occupying its own framed cell.

Fix: removed the lower protocol/sequence sections, removed the lower Open App action, removed the footer, lowered the hero visual grid from the header, and added a bold top border to the hero visual cell.

Prevention: when the user says remove a visible block, delete the rendered block, not just labels. The hero visual grid must start below the header boundary with a clear top border.

### M022 - Dashboard sidebar structure requested

Timestamp: 2026-06-01 17:47 GMT

Trigger: the user provided a wallet dashboard screenshot and asked for the dashboard sidebar to use that structure for Walaxy without hardcoding fake data.

Mistake: not a new failure; this is the active dashboard direction.

Impact: the connected app must move from a generic multi-panel layout to a wallet-style shell with a left sidebar and one main content panel.

Fix: restructured the connected dashboard into a sidebar dashboard with Home, Launch, Products, Agents, and Profile views. All values come from current wallet/API state; no seeded products, fake balances, or mock activity were added.

Prevention: keep dashboard structure data-driven from real state. Do not add fake balances, fake transactions, fake catalog rows, or decorative activity.

### M023 - Unwanted /app route

Timestamp: 2026-06-01 17:55 GMT

Trigger: the user objected to `http://localhost:5173/app` and asked why that route existed.

Mistake: the app used `window.location.pathname.startsWith('/app')` to switch into the product dashboard route, even after the user had already said `Open App` should open the wallet modal instead of navigating.

Impact: the project exposed an unwanted route and made the dashboard feel like a separate page instead of a wallet-connected state on the landing URL.

Fix: removed the `/app` path split. The root `/` now renders the landing page when disconnected and the dashboard after wallet connection. If any non-root path is loaded, the client replaces it with `/`.

Prevention: do not create or depend on a `/app` route. Wallet connection state controls landing versus dashboard.

### M024 - Dashboard palette mismatch

Timestamp: 2026-06-01 17:57 GMT

Trigger: the user said the dashboard UI color palette should be that of the landing page.

Mistake: the connected dashboard used a blue/black wallet-inspired palette copied from the structure reference instead of Walaxy's existing coffee/rust/orange/cream landing palette.

Impact: the dashboard looked like a different product from the landing page.

Fix: replaced dashboard blue/black colors with landing palette variables: coffee bean, dark garnet, rusty spice, orange, surface, surface-alt, ink, muted, border, and line.

Prevention: structural references define layout only unless the user asks to copy colors. Walaxy dashboard colors must follow the landing palette.

### M025 - Heroicons requested

Timestamp: 2026-06-01 18:07 GMT

Trigger: the user asked to use Heroicons.

Mistake: not a new failure; this is the active icon-library direction.

Impact: the app should not mix Lucide icons into the current interface.

Fix: added `@heroicons/react` and replaced the visible Lucide icons in `src/App.tsx` with Heroicons outline components.

Prevention: use Heroicons for app UI icons going forward unless the user explicitly changes the icon system.

### M026 - CTA label changed to Launch App

Timestamp: 2026-06-01 18:10 GMT

Trigger: the user said `lauch app not open app`.

Mistake: not a new failure; the active CTA copy changed from `Open App` to `Launch App`.

Impact: landing actions must keep the wallet-modal behavior but use the new visible label.

Fix: changed the landing CTA text to `Launch App`.

Prevention: use `Launch App` for the landing wallet-modal CTA unless the user changes the label again.

### M027 - Hero CTA removed

Timestamp: 2026-06-01 18:15 GMT

Trigger: the user asked to remove `Launch App` from the hero.

Mistake: not a new failure; the active hero composition changed.

Impact: the landing hero should keep the headline, description, and visual system only. The wallet-modal CTA remains in the header.

Fix: removed the hero `Launch App` button and deleted its unused CSS.

Prevention: do not restore a hero CTA unless the user explicitly asks for one.

### M028 - Hero visual was too abstract for the requested product-use animation

Timestamp: 2026-06-01 18:31 GMT

Trigger: the user said the right side of the hero should not show the abstract visual and should instead show a component animation of how the tool is used.

Mistake: the hero right side used a particle/data artifact. That matched an earlier visual-system direction but did not show the actual Walaxy usage path.

Impact: the hero still felt like decorative protocol imagery instead of demonstrating the product flow.

Fix: replaced the particle map with a component workflow animation: Upload, Encrypt, Store, Record, Serve. The sequence describes the real product path without fake products, fake buyers, fake receipts, or fake metrics.

Prevention: the hero right side must show the Walaxy usage flow unless the user changes direction. Do not restore the particle map or abstract generated artifact.

### M029 - Icon mark was oversized and too heavy

Timestamp: 2026-06-01 18:40 GMT

Trigger: the user objected that the icon-style logo was a big thing placed as a logo.

Mistake: the first icon mark used a heavy filled square slab and large rendered sizes in the header/sidebar, making the brand mark dominate the interface.

Impact: the logo fought the sparse architectural header and repeated the earlier logo mistake: too much object, not enough restraint.

Fix: replaced the slab mark with a transparent compact W-route icon, reduced the header icon to 24px, and reduced the sidebar mark footprint.

Prevention: Walaxy logo treatment must stay small, transparent, and structural. Do not use a large filled block, mascot, random crypto icon, or oversized sidebar badge.

### M030 - Agent buy URL was visible in UI but not exposed in the product catalog

Timestamp: 2026-06-01 19:22 GMT

Trigger: the user asked where an agent would actually see the product URL to buy.

Mistake: the connected dashboard computed and displayed the HTTP 402 endpoint, but `/api/products` did not include a machine-readable buy URL in each product object.

Impact: a human operator could copy the URL, but an autonomous buyer discovering products through the catalog would have to guess the endpoint shape.

Fix: added `agentBuyUrl` to public product responses from `/api/products` and product creation responses. The dashboard now uses that value when present.

Prevention: every public product record meant for agent commerce must include its machine-readable payment URL.

### M031 - Landing page did not expose the agent catalog URL

Timestamp: 2026-06-01 19:25 GMT

Trigger: the user asked whether products launched by users will be visible and asked to add the catalog URL to the landing page.

Mistake: the system had the `/api/products` catalog endpoint but did not surface it on the public landing page.

Impact: agents and builders would have to know or infer the catalog discovery URL before reaching product `agentBuyUrl` values.

Fix: added a structural `Catalog URL` row to the landing hero pointing at the real `/api/products` endpoint.

Prevention: the landing page must expose the machine-readable product catalog URL whenever agent commerce is part of the public story.

### M032 - Catalog URL placement belonged in the workflow animation card

Timestamp: 2026-06-01 19:31 GMT

Trigger: the user said the catalog URL should be in the animation card top.

Mistake: the first catalog URL placement added a separate row under the hero copy, which made the endpoint feel like loose page furniture instead of part of the agent workflow object.

Impact: the landing page exposed the right URL but in the wrong architectural cell.

Fix: moved the catalog entry into the workflow animation card top bar as `GET /api/products`.

Prevention: catalog discovery belongs in the hero workflow card chrome unless the user changes the landing composition.

### M033 - Full deployment target needs persistent storage, not Vercel Functions filesystem

Timestamp: 2026-06-01 19:37 GMT

Trigger: the user asked where everything can be deployed to work at once.

Mistake: not a new UI failure; this records the deployment constraint.

Impact: Vercel is not the right current full-stack target because the app writes encrypted delivery-key vault state to `data/catalog.json`, and Vercel Functions only provide temporary writable storage. A broken deployment would lose product delivery state.

Fix: prepared the Node server to serve the built frontend and added `DATA_DIR` support so a platform with a persistent mounted volume can run the whole app as one service.

Prevention: deploy the current full platform to Render, Railway, or Fly with a persistent disk/volume, or move the vault to durable managed storage before using Vercel.

Status update: superseded by M034. The runtime key vault has been removed, so persistent disk is no longer required for product content keys. The app still needs a deployment target that can run the current Express Node server unless a Vercel adapter is added.

### M034 - Backend key vault was not Walrus-native access control

Timestamp: 2026-06-01 20:08 GMT

Trigger: the user challenged the claim that local persistent storage was correct and demanded Walrus documentation be checked.

Mistake: the backend stored `contentKeyB64` in local `data/catalog.json` and released decrypted bytes after verifying payment. That made the server the decryption authority instead of Sui + Seal.

Impact: the design was custodial. If the local vault was lost, products became undeliverable; if it leaked, paid access was bypassed. It also misrepresented Walrus, because Walrus blobs are public and confidentiality must come from encryption plus an access-control layer.

Fix: removed local content-key storage and the backend AES decrypt path; added Seal encryption before Walrus upload; added `seal_id` to the Move product; added `marketplace::seal_approve_access`; added receipt IDs to purchase events; changed delivery to return Seal descriptors; changed the agent buyer to decrypt locally through Seal after x402 settlement and on-chain receipt recording; redeployed the Seal-enabled package.

Prevention: do not store product content keys in local JSON, persistent disks, app databases, env vars, or logs. For private Walrus products, use Seal with a Move approval policy and receipt ownership.

### M035 - Fresh Sui product reads could race RPC object availability

Timestamp: 2026-06-01 21:00 GMT

Trigger: the user hit `On-chain product not found.` after deploying and using the live app.

Mistake: after the contract emitted a newly created product object ID, the backend immediately called `sui_getObject` once. Shared Sui objects can lag briefly behind the transaction/event path on public RPC.

Impact: a real product launch or immediate read could fail even though the transaction had succeeded and the product object was about to become readable.

Fix: added bounded retry/backoff for marketplace product object reads, limited to the specific 404 condition.

Prevention: all reads of objects created in the same transaction path must tolerate Sui RPC propagation delay. Do not treat first-read 404 as final unless retries have been exhausted.

## Corrections Already Applied

- Sui CLI installed and configured for Testnet.
- Move package deployed to Sui Testnet.
- Package ID and operator cap ID written to `.env`.
- Private keys were not printed in terminal summaries after insertion.
- Static defaults moved into `src/shared/config.ts`.
- `.env` narrowed to deployment IDs and secret-like runtime values.
- Contract flow stores products and purchases on chain.
- Runtime catalog/key vault removed from the delivery path.
- Product bytes are Seal-encrypted before Walrus upload.
- Seal access is gated by `marketplace::seal_approve_access` and receipt ownership.
- Agent x402 delivery now returns a Seal descriptor and the agent CLI decrypts locally through Seal.
- Wallet-disconnected root state renders the landing page and wallet modal trigger instead of dashboard content.
- Network/checkpoint diagnostics removed from public UI.
- Generated logo files removed.
- Rejected proof strip removed.
- `Launch on Testnet` replaced.
- Button arrows removed.
- Boxy button styling applied.
- User palette applied to the UI.
- Landing hero copy moved toward the requested product intent.

## Current Open Work

1. The single-service deployment path should be verified after choosing Render, Railway, or Fly; no persistent disk is required for product content keys now that Seal owns decryption.
2. The landing CSS must be checked for no overflow, no overlapping text, and no old rejected copy.
3. The visible grid treatment must stay confined to the hero visual region and must use the light dotted/particle reference style.
4. Header navigation should stay sparse: brand plus neutral app action, no `Protocol` / `Flow` nav clutter.
5. Header must not show vertical grid/divider lines.
6. The header `Launch App` action should open the wallet modal, include the diagonal arrow icon, and remain a neutral outline button.
7. The landing page currently stops after the hero; do not restore Index/Sequence sections, lower CTA, or footer unless the user asks.
8. The hero visual grid must not touch the header; it needs a clear bold top border.
9. The connected dashboard uses wallet-style sidebar/main-panel structure; no fake balances, fake products, or fake activity.
10. Do not create or depend on `/app`; root `/` owns both landing and connected dashboard states.
11. Dashboard palette must match the landing page palette.
12. App UI icons should use Heroicons.
13. Do not restore a hero CTA unless explicitly requested.
14. The Saci-style hero animation should remain a protocol/data artifact, not a decorative logo.
15. Any future change must update this log if the AI violates the guardrails or if the user raises a fresh objection.

## Future Incident Template

Append new incidents here in this exact shape:

```md
### MXXX - Short title

Timestamp: YYYY-MM-DD HH:MM TZ

Trigger: what the user asked or what the AI changed.

Mistake: what went wrong.

Impact: why it mattered.

Fix: what changed immediately.

Prevention: rule to stop it recurring.
```
