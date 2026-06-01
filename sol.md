# Walaxy Bypass Solution Prompt

Use this prompt before any future Walaxy build step. It bypasses the previous failure pattern: guessing, designing too early, adding mock surfaces, mishandling secrets, and inventing protocol glue.

```text
You are working in /Users/kaizen/Desktop/walrus on Walaxy.

Read log.md before touching code. Keep log.md updated. If you make a wrong move, ignore user intent, add unwanted UI, introduce mock data, expose secrets, hallucinate protocol behavior, or the user raises a new objection, append a new incident to log.md with timestamp, mistake, impact, fix, and prevention.

Primary product:
Walaxy is a real Sui Testnet and Walrus Testnet platform for entrepreneurs to launch and sell digital products to human wallet buyers and autonomous agents.

Non-negotiables:
- No mock data.
- No seeded catalog.
- No fake products.
- No fake buyers.
- No fake purchases.
- No fake receipts.
- No fake metrics.
- No placeholder payment flows.
- Do not make local JSON the marketplace source of truth.
- Do not show private keys, seed phrases, tokens, or full secret values in chat, logs, screenshots, or committed files.

Architecture:
- Sui Move contract is the source of truth for product identity and purchase records.
- Walrus stores real Seal-encrypted product bytes and public manifests.
- Seal is the access-control layer for decryption. Do not store product content keys in local JSON, persistent disks, app databases, logs, or env vars.
- Human purchase path: wallet signs Sui transaction, calls marketplace purchase function, receives an on-chain receipt object, then decrypts only through the Seal approval policy.
- Agent purchase path: native Sui x402 HTTP 402 challenge, payment settlement, contract record for agent purchase, Seal delivery descriptor, then agent-side Seal decryption using its receipt object.
- Every public product returned by `/api/products` must include `agentBuyUrl` so autonomous agents can discover the paid HTTP 402 endpoint without scraping the dashboard.
- The landing page must expose the real catalog URL `/api/products` inside the workflow animation card top bar so agents and builders can discover listed products.
- Use native/current Sui x402 support. Current project rule: use @tentaclepay/sui-x402 with @x402/core v2 headers: PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE.
- Do not reintroduce a custom x402 shim.
- Current Seal policy function: `marketplace::seal_approve_access`. It must approve only when the caller owns a receipt for the product and the supplied Seal id matches the product `seal_id`.

Config:
- Put stable non-secret defaults in src/shared/config.ts.
- .env is only for deployment IDs and secret-like runtime values.
- Expected dynamic values include SUI_PACKAGE_ID, SUI_OPERATOR_CAP_ID, SUI_OPERATOR_SECRET_KEY, X402_SUI_FACILITATOR_SECRET_KEY, and AGENT_SUI_SECRET_KEY.
- Keep key roles distinct:
  - SUI_OPERATOR_SECRET_KEY signs operator contract calls.
  - X402_SUI_FACILITATOR_SECRET_KEY signs/facilitates x402 settlement.
  - AGENT_SUI_SECRET_KEY is only a local test buyer agent key.
- For quick Testnet testing, the same key can be used only if the user explicitly chooses it. Do not present that as production design.

Deployment UX:
- Keep terminal instructions short.
- Give one paste block at a time.
- Preflight before deploy: which sui, sui --version, sui client active-env, sui client active-address.
- If the key starts with suiprivkey, import directly.
- If the key is raw hex, convert first with sui keytool convert, but never print or log the key.
- Use the active Sui CLI wallet for deploy when the user wants terminal-only key handling.

UI rules:
- Do not design unless the user asks for design.
- If the task is functional, build the function and leave the UI alone.
- Public UI must not expose dev diagnostics like Network, checkpoint, RPC internals, or proof strips unless requested.
- Do not create or use a `/app` route. The app lives on `/`: landing while disconnected, dashboard after wallet connection.
- No generated logo unless explicitly requested. Default to text wordmark.
- If logo work is requested, keep the mark compact, transparent, structural, and subordinate to the wordmark. Do not use large filled slabs, random Sui icons, generic symbols, fish-like marks, or decorative crypto shapes.
- Buttons are boxy. No arrows unless explicitly requested.
- Current explicit exception: landing `Launch App` actions must include a diagonal arrow icon.
- Landing `Launch App` actions must open the wallet modal in place. Do not make them `href="/app"` links.
- Keep `Launch App` in the header only. Do not restore a hero CTA unless explicitly requested.
- Landing buttons are neutral outline buttons unless the user explicitly asks for a colored CTA.
- Header navigation should stay sparse: brand plus app action. Do not add `Protocol` / `Flow` nav links.
- Header must not show vertical grid lines, column split lines, or nav partition dividers.
- The landing page currently stops after the hero. Do not restore Index/Sequence sections, lower CTA, or footer unless the user asks.
- The hero right side should show a component workflow animation of how Walaxy is used. Do not restore the abstract particle/data artifact.
- Connected dashboard should use the wallet-style structure on `/`: rounded left sidebar navigation plus one large main panel.
- Dashboard values must come from live wallet/API state. Do not add fake balances, fake transactions, fake products, fake activity, or seeded rows.
- Dashboard colors must use the same landing palette variables, not the blue/black colors from the structural reference.
- Use Heroicons for app UI icons. Do not reintroduce Lucide icons unless explicitly requested.
- Use the user palette:
  - #220901
  - #621708
  - #941b0c
  - #bc3908
  - #f6aa1c
- Avoid generic SaaS copy. Do not use "See the payment path" or "Built for two buyers: people and agents".

Landing page direction when design is explicitly requested:
- The layout system itself is the design.
- Keep the visible grid treatment inside the hero only unless the user explicitly asks for page-wide grid again.
- The hero visual should show the product-use component animation: upload product file, encrypt bytes, store on Walrus, record on Sui, then serve through the agent 402 path.
- The fixed header surface must be solid/opaque so the hero grid does not climb into it while scrolling.
- The hero visual grid must not touch the header; start it below the header boundary and use a bold top border.
- Below the hero, use structural dividers and section boundaries without a visible background grid.
- Align all sections to the same column boundaries.
- Hero is a hard two-column split: headline/actions on left, protocol/data visual on right.
- Dividers are structural and permanent, not decorative.
- Sections use publishing-style compositions: label/meta/index column plus content column.
- Use large editorial left-aligned headlines with aggressive line breaks.
- The visual region must feel like a data artifact, protocol visualization, system diagram, or technical object.
- No floating cards.
- No overlapping sections.
- No excessive shadows.
- No decorative gradients.
- No arbitrary containers.

Verification before final response:
- Run typecheck.
- Run build.
- For Move changes, run Sui Move build.
- For frontend visual changes, open the app in browser, check desktop and mobile, and inspect screenshots.
- Search the codebase for rejected copy before handoff.
- Remove temporary screenshots or QA artifacts unless the user asks to keep them.
- Do not deploy a broken Vercel build. The current app is an Express Node service that serves API/x402 routes and the built frontend; deploy it where a long-running Node server is supported unless a Vercel adapter is explicitly added.
- Current one-service deploy path: build with `npm run build`, run with `npm run start`, set the Sui/x402 service keys, and point the public domain at the Node server. No persistent disk is needed for product content keys.

Communication:
- Be direct.
- Do not flatter.
- Do not use apology loops.
- Do not argue around the user's objection. Record it in log.md, fix the work, and move.
- Explain only what helps the user build.
```

## Current State Facts

- App name: Walaxy.
- Sui network: Testnet.
- Move package deployed:
  - `SUI_PACKAGE_ID=0x6693e7abdc5ac42fffab1dfb2fd336a79606cf0dce044ff4549164b4218ff2f4`
  - `SUI_OPERATOR_CAP_ID=0xdbda11655afc8420c6e621f253db245b6d1767919c6676ecfba0b0b00c5b2ad4`
- Publisher address:
  - `0xe63a423e9f452defdea24299bdfb09de64c4d3c5c9414cf265f991808ce7858f`
- `deployments/latest.publish.json` exists and should stay out of source control if git is initialized later.
- The private key used in this session is redacted and must never be copied into this document.
