# Eva Tarot verification record

Upgrade date: 7 October 2026 (Asia/Ho_Chi_Minh).

Last updated: 9 October 2026.

## Everyday reading explanations — 9 October 2026

- Hosted readings now use explicit everyday-language guidance, native Vietnamese first-reading instructions, and a clearly hypothetical writing example. All five sections per card remain. Brief clarification questions receive a direct answer rather than another whole spread. The prompts preserve the user's stated time, supplies and boundaries and ask for one prioritized starting point.
- Canonical symbolism, helpful themes and risks still come from the trusted deck. Generic advice/exercise templates are no longer supplied as trusted context; the model must create advice for the actual conversation. Static reference notes and previously saved answers remain unchanged. The optional on-device prompt receives compact equivalent wording without changing inference, consent or storage behavior.
- Live Vietnamese comparisons favored full `gpt-4.1` over the previous mini model for this task, so both hosted-provider defaults now use it. Per-reading cost is higher; the existing $5 non-refreshing project budget, WAF limit, timeouts and output limits are unchanged. Environment model overrides remain supported.
- All 171 tests passed on the final source. Production build and TypeScript checking passed. Independent code and TypeScript reviews approved the complete diff. Local/context tests preserve complete card facts and the 5,400-byte prompt limit; no new physical-device or local-model inference claim is made.
- Actual Gateway tests on the final candidate returned 200 for a Vietnamese relationship reading (13.530s), a brief five-minute/no-journaling follow-up (2.718s), and a ten-card Vietnamese reading (26.292s). Independent editorial review accepted the release: the follow-up gave concrete steps without rerunning the spread; the relationship reply respected boundaries; the ten-card reply included all 50 required sections. Long replies can still contain formal wording or infer unreported qualities, so the checks establish improvement rather than guaranteed writing quality.

## Online reader and reading-link recovery — 9 October 2026

- Online AI is now the default. Opening the app or sending an online question does not download or initialize WebGPU. Experimental on-device AI remains an explicit reader option with an online escape action.
- Hosted requests retain the original user context and recent conversation, with Unicode-safe opening/ending excerpts for long replies. Follow-up and continuation flags are validated. The server supplies canonical card meaning, strengths, challenges, advice and direction for all supported spread sizes; no provider/network error is replaced with preset text.
- Online processing is disclosed before the first send and before sharing a private or unknown legacy conversation. Private intent is stored with the journal before GPU setup; it survives reload, import, revision and cross-tab merging. Explicit online approval is required to clear it. Tests cover crash-before-first-local-reply, switching an approved chat back to private, legacy revisions and future-dated imports.
- Reading routes safely encode imported IDs, support hash and legacy path addresses, wait for hydration and display non-destructive missing-reading recovery. A React error boundary offers reload/home without clearing journal data. These measures avoid the default GPU workload and catch render failures; they do not prove that optional GPU inference cannot trigger a phone OS/browser termination.
- All 171 automated tests passed on the final source. Code, TypeScript and security reviews approved the changes. Final local and Vercel production builds passed TypeScript and Vite compilation. API tests use mocked providers; they are not evidence of live model access.
- Local browser checks verified first-send disclosure, cancelling without losing the question, full-reload restoration, retry without GPU setup, a visible provider error with the question retained, missing-link recovery, and a legacy `/reading/<id>` path reopening the saved conversation. At 320 × 667 the optional-local setup's online escape action was 244 × 50px at y=512, inside the viewport; document width was 320px.
- Fixed the development API proxy to preserve the frontend Host. Vite's string shorthand rewrote Host to the backend port, causing the unchanged same-origin check to reject valid local requests. The object proxy with `changeOrigin:false` preserves the check and the request reaches the real provider.
- Vercel production/preview configuration now sets `HOSTED_AI_ENABLED=true` and `AI_GATEWAY_ENABLED=true`. The project WAF rate limit is published: 20 reading requests per 600 seconds per IP, with per-region counters. The existing $5 Gateway project budget without automatic refresh was retained.
- **Live-provider activation verified:** after the user completed Gateway billing, the unchanged production endpoint returned HTTP 200 with `mode: ai` for a real English question (4.433 seconds) and a real Vietnamese three-card reading (9.121 seconds). The Vietnamese reading covered each card's meaning, good side, difficult side, advice and clear direction, tied to the stated fatigue, fifteen-minute limit and available pencil/paper. Some wording inferred prior self-understanding beyond the message; this verifies functioning contextual inference, not perfect answer quality. The earlier Gateway `customer_verification_required` blocker is resolved.
- Release commit `251a2de665bf2e4dd34e06bbf6adc9de0c501e53` was pushed to GitHub; [CI run 37819812481](https://github.com/operatoruplift/eva-tarot/actions/runs/37819812481) passed. Vercel deployment `dpl_A7nNpeJzizUa1fEo2C1oaBiPnCMn` is READY and promoted at https://evatarot.vercel.app.
- Unauthenticated production HTTP checks returned 200 for home, PWA files, `/reading/missing-server-test`, `/assets/index-BRl_Xcdb.js` and `/assets/index-Fk9VTVM9.css`. `/api/health` reports configured `mode: ai`. Before billing activation, real readings correctly returned 503 `AI_CONFIGURATION`; after activation the real requests above succeeded. Health alone is not a live-inference check.
- The original public tab was refreshed: Online AI is the default and no GPU setup opens. A public path-style missing-reading URL canonicalized to the recovery screen, then Start a conversation returned to chat. Screenshots: `../eva-tarot-online-mobile.jpg`, `../eva-tarot-reading-link-recovery.jpg`, and local error-preservation evidence `../eva-tarot-online-recovery-check.jpg`. The temporary browser tab was closed and the viewport restored.
- Post-activation public-browser verification at 390 × 844 completed the online disclosure and generated a real answer without local model setup. A follow-up changed the available time from fifteen to five minutes and supplies from paint to only a pencil; the answer followed both corrections. A full reload retained both user messages and both replies with the confirmed-save label. Opening the same saved record through `/reading/<id>` canonicalized and reopened it successfully. Screenshot: `../eva-tarot-online-live-answer.jpg`. Tests used synthetic content and desktop viewport emulation, not physical-phone installation; storage remains browser-local. No code redeployment was needed for account activation.

## Public release usability and data integrity — 9 October 2026

- All 143 automated tests passed. Independent code, TypeScript and security reviews approved their scopes. The final persistence review independently reran 37 storage/hook tests and TypeScript successfully.
- Backup imports merge additively with the latest durable data inside the IndexedDB write transaction. Tests cover simultaneous-tab conversation/profile/photo/calendar conflicts, edits before and during an import write, deterministic repeated imports, revised-reading parent links, cyclic revision rejection, oversized-note atomic rejection and save failures. Transfer success waits for the durable import.
- Chat starts without cards by default. Cards can be added within the conversation; fresh spreads use the latest question. Cancelling a draw continues an unanswered question. Revising an earlier question retains its associated spread rather than an unrelated later draw.
- Private-reader setup uses a scrollable body and reachable footer. At 320 × 667, the primary action remained inside the viewport and document width was 320px. English and Vietnamese setup screens were checked. The home, language dialog, save status and backup copy were simplified while retaining the lotus branding.
- Browser calendar checks saved a synthetic future intention, navigated to another month and reloaded. The note and its date marker remained. Selecting a past day listed its conversations, and selecting a record opened the original saved reading.
- Light/Qwen3-0.6B produced a saved response to a synthetic painting question and its updated fifteen-minute constraint. It included Meaning, Good side, Difficult side, Advice and Clear direction, and mentioned using the fifteen minutes. The original question, update, card and answer remained after a full reload. Screenshot: `../eva-tarot-release-reading-reload.jpg`. Its wording still mixed first/second person and included generic encouragement; this is not evidence of ChatGPT-level quality.
- The final local production build passed TypeScript and Vite compilation. The large lazy-loaded WebLLM runtime still produces Vite's bundle-size warning; it is not a build failure.
- A follow-up was then tested against the frozen production build on the same local origin. Light completed a short plan using the fifteen-minute context, saved it and remained ready for another message. Development-server reloads during earlier source/document edits explain the previously observed reset; no idle unload occurred in this frozen-build check.
- The hosted compatibility API is disabled unless `HOSTED_AI_ENABLED=true` is explicitly configured. Provider credentials alone do not activate it. Security review approved the opt-in gate and framing/object restrictions; its 35 focused tests passed. No paid AI request was made.
- GitHub CI now runs the tests and production build on Node 24. Vercel deployment is explicit; automatic GitHub deployment has not been verified.
- Browser checks use synthetic local data and desktop viewport emulation. Physical-device installation, microphone capture, cloud backup and successful inference on every device remain outside this verification.

### Publication checks

- Release commit `c2765e022a49f35682f38207f101b842019ca398` was pushed to [operatoruplift/eva-tarot](https://github.com/operatoruplift/eva-tarot). [GitHub CI run 37815555134](https://github.com/operatoruplift/eva-tarot/actions/runs/37815555134) passed install, all tests and the production build using Node 24.
- Vercel deployment `dpl_Bb2PgsjXUASHCxBV2Aut2NKFX2pT` is READY at https://evatarot.vercel.app; the old https://evara-omega.vercel.app address serves the same release. Deployment build and alias promotion succeeded.
- Unauthenticated HTTP checks returned 200 for home, manifest, service worker, all 78 card images, `/assets/index-CofUQsUQ.js`, `/assets/index-D2q09dQk.css` and both AI runtime bundles. `/api/health` reports `mode: disabled`. CSP framing/object restrictions and `X-Frame-Options: DENY` are present.
- The original public tab was refreshed and showed the deployed chat-first home, lotus and Just chat default. At 390 × 844, document width was 390px. At 320 × 667 in Vietnamese, document width was 320px and the setup primary action was 244 × 50px at y=542, inside the viewport. Screenshots: `../eva-tarot-public-release-mobile.jpg` and `../eva-tarot-public-release-vietnamese.jpg`. The viewport and English language were restored; the public app was left open.

## Private reader save and recovery fix — 8 October 2026

- All 117 automated tests passed. TypeScript checking passed, and independent code and TypeScript reviews approved the changes.
- Reader setup and reply generation now wait for the latest journal snapshot to commit. Save failure or timeout prevents startup. Stopping during a pending save prevents a later AI start while allowing the journal write to complete. A post-response storage failure uses the persistence retry/export path rather than regenerating an already produced reply.
- Nine React persistence-hook regressions exercise same-event edits and reload hydration, edits during an active write, a merged snapshot already containing the latest edit, aborted writes, failed primary-database open/read with retry, unmount, save timeout and invalid legacy fallback data. Failed writes retain exportable edits and cannot report a successful save. The two reader-save-gate tests cover cancellation and failed-save propagation.
- Save labels now reflect committed state. A primary database open/read failure presents a recovery screen rather than silently switching to an empty older storage view. The existing database is preserved for retry; unreadable fallback data is also retained.
- Light is now the default and recommended reader; explicit Detailed preferences remain intact. Runtime tests cover the uncached-download storage reserve, nonfatal persistence-request denial, safe quota/GPU error messages, an exclusive reader-tab lock and worker disposal on `pagehide`.
- Local-browser verification used a synthetic hobby question. Light was selected and recommended by default, the cached reader initialized, and an on-device reply streamed into the same conversation. After Stop and a full reload, the question, available reply and two earlier test conversations remained visible, with confirmed-save labels. Screenshot: `../eva-tarot-save-reload-check.jpg`.
- Automated tests use synthetic data, mocked browser/runtime boundaries and fake IndexedDB where appropriate. Neither they nor the browser check prove recovery of previously missing user history or resolution of every device's WebGPU failure.
- Production deployment `dpl_BoC3LedZ1i4zXyJGduuKSS7rzaPR` is READY at https://evatarot.vercel.app. Vercel TypeScript and Vite compilation passed. An initial authorization failure was resolved by the account check and retry; no credential change was needed.
- Unauthenticated HTTP checks returned 200 for home, manifest, service worker, `/assets/index-D9BgkIcm.js` and `/assets/index-D9aJGot1.css`. The public JavaScript contains the save gate, recovery screen, storage check and reader-tab lease. The original public tab was refreshed and visibly showed Light selected and recommended, then was returned to Chat. Screenshot: `../eva-tarot-reader-save-fix-live.jpg`. The temporary local test tab was closed.

## Conversation-led reflections — 8 October 2026

- The local prompt prioritizes user circumstances, named feelings, constraints and corrections. Cards offer reflection rather than predictions. Prior AI interpretations are explicitly fallible; static reference notes and draw prompts are excluded from personal model history.
- Original user context and later updates are retained alongside the latest user message; optional assistant text gets less room. Long messages preserve beginning and ending excerpts. Every drawn card keeps complete canonical strengths and risks within the 5,400-byte prompt budget, including long ten-card conversations.
- Added a translated **Reflect on my situation** action beneath general reference notes. It uses the current conversation, latest user question and existing drawn cards; it opens private-AI setup when needed. Legacy AI replies now count as follow-ups consistently with history filtering.
- All 101 automated tests passed. Independent TypeScript review approved; a further 1,200 prompt combinations across all 12 languages, spread sizes, follow-ups/continuations and history shapes stayed within budget and retained full card guidance. A final shorter instruction to address the user directly and follow card headings passed all 23 targeted context/local-AI tests.
- Browser checks verified draw/shuffling states, the reference action opening setup for the same reading, and the explanation distinguishing general notes from a personal reflection. At 390×844 the document and scroll widths both measured 390px. Screenshot: `../eva-tarot-personal-reflection-mobile.png`.
- Actual Light/Qwen3-0.6B inference completed using a synthetic night-shift/caregiving question. It acknowledged the night shifts, exhaustion and inability to reduce hours, but mixed first/second person and omitted the requested card sections. The final direct-address/heading instruction addresses those observed problems, but its output quality has not been reverified.
- Actual Detailed/Qwen3-1.7B initialized and cached successfully, then failed during generation before any visible tokens with Chromium WebGPU `OperationError: A valid external Instance reference no longer exists.` The generic recovery UI preserved the conversation. No successful Detailed-response or ChatGPT-quality claim is made.
- The browser connector disconnected during the Light follow-up test. Follow-up completion and final-prompt inference remain unverified. After reconnecting, the original public tab was refreshed and visibly showed the new reflection language; the normal viewport was restored and temporary test tabs closed. Temporary error logging was removed before release.
- Final rules review approved: English rules shrank to 625 bytes; 120 additional worst-case multilingual prompts remained within budget with full card strengths/risks and latest-question endpoints.
- Production deployment `dpl_Gh6Ch2Rwa2HjxHM6HbY48WJAuDSc` is READY at https://evatarot.vercel.app. Vercel TypeScript and Vite build passed. Unauthenticated HTTP checks returned 200 for home, manifest, `/assets/index-hcYGpqDW.js` and `/assets/index-CcJu13iv.css`; the JavaScript includes the final context rules and reflection action.

## Clear card explanations and animated selection — 8 October 2026

- Added distinct English/Vietnamese guidance for all 78 cards: Meaning, Good side, Difficult side, Advice, Clear direction. Card details work for previously saved draws too; existing conversation text is retained.
- Reference readings use five clearly labelled paragraphs per card. Local AI prompts request the same structure with situation-specific explanations and concrete actions; maximum initial output is 2,560 tokens. The prompt stays within a 5,400-byte budget, retains all draw IDs/positions and shares constrained history space between the most recent user and assistant.
- Manual selection renders all 78 lotus-backed cards with selected checks and no visible number tiles. Draw, manual selection and Shuffle again perform a fresh cryptographic shuffle followed by a finite fan animation. Dealing/reveal motion and reduced-motion handling are included. Timers cancel on unmount and action locks prevent duplicate draws.
- The 94-test suite passed before the final history-budget adjustment; all 17 focused local-AI tests passed afterward, including the new both-sides-of-history regression. The 6 guidance tests verify complete bilingual coverage, card-specific fields, five-section output and canonical references. Final TypeScript and code review passed after removing one duplicate Vietnamese translation key.
- Vercel production TypeScript/Vite build passed (23 seconds). Deployment `dpl_FQocNRqeqNNie4Ecg29oKgoJY6y4` is READY at https://evatarot.vercel.app.
- Public HTTP checks returned 200 for home, manifest, `/assets/index-BVNTztbf.js` and `/assets/index-CyzCJFpH.css`. The published bundles contain the five-part EN/VI guidance, card-back picker, shuffle/deal keyframes and reduced-motion rules.
- Browser interaction/visual checks could not run: the browser connector reported no available browsers. No animation screenshot or new live GPU inference verification is claimed for this release. Prior physical-device/local-model limitations below still apply.

## Automated and review checks

- 86 automated tests passed with zero failures. The final two-line partial-download cleanup visibility/copy adjustment was reviewed; the subsequent Vercel TypeScript/production build passed.
- Full suite covers 78-card ordering and unique IDs, real local JPEG assets, bilingual card coverage, cryptographic draws, API validation, 0/1/3/5/10-card spreads, persistence/migration, cloud adapter isolation, calendar records, backup round trips, revisions, translation prototypes and local AI context.
- Local-AI tests verify canonical facts, requested language, bounded multibyte context, prior-turn inclusion, recommendation rules, partial-output handling and unsupported environments. They are not substitutes for GPU inference.
- Code and TypeScript reviews cover runtime cancellation, pending requests, safe imported IDs, immutable question revisions and new-origin data transfer.
- Transfer review fixes: nonce-specific destination windows allow retries; acknowledgment waits for the imported snapshot to be committed. Exact origin, sender window and nonce are verified; source data is retained.
- Dependency audit reported no vulnerabilities after the compatible development shell-quote override.

## Browser verification

- Browser initialized WebLLM/Qwen3-0.6B following an explicit model download and generated two card-related answers plus a revised reading. Questions and replies remained in the conversation after navigation/reload.
- A synthetic career-choice question correctly proposed five cards and drew five distinct cards including a Minor Arcana card.
- Earlier upgrade checks established profile/photo persistence, full-history saving, English/Vietnamese UI, interactive calendar and JSON backup restoration.
- Edited a saved title and note, verified both on reopening, revised the original question with a fresh spread, and used View original to confirm the old conversation was intact. Also created a revision retaining the same five cards.
- A Vietnamese 78-card request returned the exact ordered full deck. Vietnamese settings and all 78 translated card names were verified in the library.
- Future-day calendar notes persisted through month navigation; the selected date showed its saved-note marker. Today listed saved conversations and their revisions.
- At this earlier upgrade, the 0.6B model produced answers but was too generic for the requested quality, so Detailed/Qwen3-1.7B was made the recommended option. That recommendation was superseded by the 8 October save and recovery fix above. The stronger model had not yet been run end-to-end at this checkpoint because the browser connection disappeared before its test; later inference results are recorded above.
- The final cross-origin transfer has security/code review coverage, but its real two-window browser flow remains unverified for the same reason. No successful migration should be inferred from deployment alone.

## Visual polish verification — 7 October 2026

- Restored visible lotus branding and refreshed the home, header and composer styling. All five native selects were replaced with a shared themed combobox: reading style, language, card suit, draw count and revised reading style.
- The existing 86-test suite passed, and TypeScript checking passed. The custom select and visual changes received TypeScript review with no remaining findings. Revised secondary text passed 4.5:1 contrast checks (including hover surfaces).
- Browser layouts checked: English at 390 × 844, Vietnamese at 320 × 667, and desktop at 1280 × 900. The lotus remained visible; the 320px viewport had a 320px scroll width with no horizontal overflow. Dropdown bounds stayed within the narrow viewport.
- Composer keyboard checks: End followed by Enter selected the 10-card spread; reopening, pressing Home, then Escape dismissed the menu without changing the selection.
- Settings language checks: Home, ArrowDown and Tab committed Vietnamese; End scrolled the language menu to Hindi. This verified the menu inside the native settings dialog.
- Card-library checks: End followed by Enter selected Pentacles and displayed its 14 cards.
- A home prompt populated the composer and suggested a spread. The draw-count selector changed three cards to ten, and the draw produced ten cards. In the saved-reading editor, unchecking Keep the same cards exposed the themed revision selector; Home and Enter selected Just chat.
- These are browser viewport and keyboard checks, not physical touch-device tests. All five select call sites were exercised in the browser. Local-AI inference and cross-origin transfer limitations above remain unchanged.

## Visual polish public deployment

- Deployment `dpl_3p5S6sts2wX8xi1gnWgY6rTU3rN7` reached READY and was aliased to https://evatarot.vercel.app on 7 October 2026.
- Vercel production build passed TypeScript and Vite compilation. Entry assets: `/assets/index-DPCc8Aia.js` and `/assets/index-DHKGcpQx.css`.
- Unauthenticated public HTML returned the new entry assets. The original user tab was refreshed and visibly showed the lotus logo, new home and themed menu.
- Production mobile screenshots: `../eva-tarot-home-mobile.png` and `../eva-tarot-menu-mobile.png`.

## Previous public deployment

- Deployment: `dpl_CpSCPqJ4d8SNduWZoMrPL1oKDrK3`, built and promoted 7 October 2026.
- Public address: https://evatarot.vercel.app (registered as a persistent project domain, verified and promoted).
- Old address https://evara-omega.vercel.app remains active for data transfer and also serves the new release.
- Unauthenticated HTTP checks returned 200 for the new home page and manifest, with Eva Tarot naming and standalone display mode.
- Current entry bundle: `/assets/index-WOjp8izV.js`; verified Detailed-model configuration, partial-download cleanup action and domain-transfer logic are included.
- All 84 checked public assets returned 200, including all 78 JPEG card illustrations, PWA icons, service worker and both AI runtime bundles.
- Final mobile screenshot and Detailed-model/live-transfer checks could not be completed because the browser connector reported no available browsers.

## Important scope limits

The browser-local model requires supported WebGPU hardware and memory. Physical iOS/Android installation and microphone capture have not been verified. A small model can be inaccurate; no ChatGPT-equivalence claim is made.

The old server Gateway was previously blocked by missing billing. The current UI uses the local model and does not depend on Gateway. Supabase remains unprovisioned pending cost approval; cloud tests use mocks. Local saving is browser-origin-specific, with user-initiated transfer or JSON backup for the domain change.
