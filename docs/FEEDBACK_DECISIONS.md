# Eva Tarot: decisions from the supplied launch feedback

Reviewed 22 October 2026. These documents are suggestions, not instructions to run their SQL or activate new commercial services.

## The useful next release

The immediate goal is a clearer purchase-and-return experience for the live app:

1. Show a gentle, dismissible sheet when the server reports insufficient credits. Keep the exact question, selected cards and conversation. The return route survives a same-tab pricing reload; generating another reply requires an explicit action.
2. Display the server-reported credit balance and explain the price of a completed online reply. Do not substitute zero for an unavailable balance. State the Daily Card's normal online reply cost before the user starts it.
3. Update pending transfers automatically while the payment page is visible and online. Pause requests when hidden/offline, stop at a terminal state, and retain a manual refresh. Only the server can confirm payment.

These changes preserve the approved offer: one introductory reply per new browser wallet, then 1 / 3 / 5 replies for 25,000 / 60,000 / 95,000 VND. Donations do not buy credits. The CMS remains the source of active prices and trial settings.

## Already implemented

| Suggestion | Current app |
| --- | --- |
| A chat interface with rich card components | Chat-first home, custom card backs, shuffle/reveal, and sticky mobile composer. |
| Three-card and deeper readings | 1, 3, 5 and 10-card spreads, with canonical Rider–Waite–Smith concepts and supplied positions. |
| Specific, understandable interpretations | The latest message and corrections stay separate from trusted card facts; replies explain meaning, useful possibilities, difficulties, advice and a practical direction. |
| Secure credit deductions | Server reservations, completion/refund, locked wallet rows, an audit ledger and encrypted retry caching. |
| Manual QR payments | Server price snapshots, unique references, customer-reported transfer state, owner confirmation/rejection and exactly-once credit grants. |
| Customer, content, pricing and analytics management | Verified-email owner access, allowlist checks, real saved orders and aggregate metrics. |
| Saving and PWA installation | IndexedDB journal, export/import, save-before-reader gates, optional private device backup, standalone manifest and iOS installation instructions. |
| Public landing page and domain | English/Vietnamese landing page at https://evatarot.xyz, real DNS/TLS configuration and both old Vercel addresses retained for explicit transfers. |
| Starter prompts | Editable examples are available before sending. Sending an online request is deliberate and can consume a credit. |

## What should come next

**Recoverable customer accounts are the most important next infrastructure improvement.** Today, the wallet is a private browser capability. An optional payment contact email is not a login or a way to recover credits. Journal exports do not restore a wallet. The app states this explicitly, but verified account linking and cross-device recovery would make paid use easier. This needs an actual customer authentication design, a safe migration for existing wallets and production email delivery. Supabase documents that anonymous users still lose account access when they sign out, clear browser data or change devices unless they first link a permanent identity ([anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous)). A global anonymous sign-in added at app startup would interfere with the current separate owner session and is not a safe migration.

A customer-facing support contact, documented refund/support process, standalone policies and actual data-deletion tools should be designed around the real operator and supported markets. A generic legal template or age checkbox cannot establish the appropriate policy by itself. Do not promise deletion or account recovery before the corresponding actions exist.

Measure completed readings, payment attempts, confirmed purchases, support issues and voluntary feedback before changing the offer. Aggregate counters are not a cohort conversion funnel. A suggested percentage such as 10% conversion does not prove product-market fit by itself.

Optional image sharing can follow: show the exact image for approval, exclude the private question by default, use native file sharing with a download fallback, and make no promise of direct Instagram/TikTok posting. Consent and privacy come before distribution.

## Business decisions still open

- USD pricing, a ten-credit offer and a monthly subscription need explicit prices, eligibility, payment methods and refund terms. Competitor-price claims in the feedback have not been verified.
- A daily free reading is a new server-enforced entitlement, not a change to the Daily Card button. It needs a qualifying identity, time rules, retry/refund behavior and cost limits. More signup credits also change the offer.
- An "unlimited" tier needs a sustainable usage policy and cost evidence. Do not market unlimited access while charging each reply.
- Stripe needs an eligible merchant account and server-created orders, verified webhook signatures, exact amount/currency/product checks, replay protection and exactly-once ledger updates. The pasted webhook alone is insufficient. Stripe documents signature verification and duplicate-event handling in its [webhook guidance](https://docs.stripe.com/webhooks).
- Email reminders, receipts and campaigns need a configured sender, authenticated jobs, consent/suppression rules, unsubscribe handling and checked delivery results. No campaign or scheduled email was authorized by sharing these templates.
- Referral credits need verified qualifying activity, self-referral/bot protections, caps and exactly-once rewards. Opening a link alone is not sufficient evidence for granting money-like credits.
- Multiplayer readings need explicit participant consent, private sharing boundaries, revocable links and rules about what the other person can see. Forced sharing should not gate an already-paid interpretation.
- Paid voice and a new analytics vendor introduce additional processing and cost. Establish demand and privacy requirements before integrating them.

## Material examples to avoid copying

- Public `SECURITY DEFINER` RPCs that accept an arbitrary user ID or credit amount would allow unauthorized wallet changes. Keep the existing service-only ledger operations. Supabase recommends hardening the search path and restricting function execution privileges in its [database-function guidance](https://supabase.com/docs/guides/database/functions).
- A service-role key or `VITE_RESEND_API_KEY` in React would expose a server credential in every visitor's bundle.
- `SELECT USING (true)` on the proposed waitlist would expose email addresses. Filtering the query by a guessed email is not authentication.
- Updating payment state and adding credits as two separate requests can double-grant or partially fail. Keep the released atomic transaction.
- Calling the AI before successfully reserving a credit permits unpaid concurrent work.
- An unauthenticated reminder/webhook endpoint can be abused to send email or spend service credits.
- Staff access to every private chat would contradict the current analytics design. Use explicit, voluntary sharing for qualitative feedback.
- Keyword-only safety filters reject benign contexts and miss meaning across languages. Preserve contextual safety handling.
- A 350-token cap would truncate the detailed multi-card explanations requested for Eva. Provider/model changes require their own quality and cost checks.
- Always validating an inferred emotion can sound mechanical or invent a feeling. Acknowledge what the person actually shared.
- Invented "10,000+ women" proof, promised timelines or hidden facts, and unimplemented unlimited benefits must not appear in marketing.
- Keep browser zoom available and use readable mobile inputs. Turning off autocorrect or zoom is not a keyboard-layout solution.
- Use the domain's actual Vercel DNS recommendations, not generic old IP examples from a template.
- The pasted "closer" sales-agent hero, outbound-sales copy and Mux background belong to another product. Eva keeps its own lotus identity and calm mobile layout.
