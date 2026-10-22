# Customer account recovery and email delivery

Prepared 22 October 2026. Do not mark public sign-in available until email delivery and the two-device acceptance checks below pass.

## Design and data boundaries

The customer Supabase Auth client uses its own `eva-customer-auth-v1` storage key. It does not consume or replace the owner dashboard session. Email one-time codes verify the customer; a payment contact email is not proof of ownership.

The service-only `eva_customer_accounts` vault encrypts the existing wallet and journal capabilities with AES-256-GCM, bound to the verified Auth user ID. Linking neither creates a wallet nor grants trial credits. There is no automatic balance merge or replacement. Original connected devices retain access; this release does not implement remote device revocation.

Linking requires an explicit choice to back up readings, profile and calendar. Account recovery retrieves the same two connections. Only successfully synced data can be restored; private journal backups currently have a 1 MB limit and use revision checks. Keep an exported copy. A failed or conflicting upload must remain visible and must not be described as a completed backup.

Local account journals use separate IndexedDB/fallback namespaces. First link durably copies the consenting guest journal into the account scope and leaves its archive intact. Sign-out uses a separate guest connection. Restoring an existing account does not import a different guest wallet or journal. Account switching aborts old requests and keeps reader credentials bound to the connection that began them.

## Resend domain prepared for this project

Workspace: operatoruplift. Sending domain: `auth.evatarot.xyz`; sending region shown by Resend: Tokyo. Sender to configure: `Eva Tarot <no-reply@auth.evatarot.xyz>`.

Add the exact records shown by Resend in Namecheap Advanced DNS (TTL Automatic). Approval to add these three records was received on 22 October 2026. Do not replace website routing or unrelated mail records.

| Type | Namecheap host | Value |
| --- | --- | --- |
| TXT | `resend._domainkey.auth` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC96P6cZ6VvQZaL1gnB7SyNEK/2Ikis+pNPl7quqLgKjPRrbkiJB84EOnvoTjyCW9T71IMuutOqxfdkkxj010pQmxdIJpBFfYW7JWpAeSEnjZGVKsPcQVJEUUq+ACG1cxif0sXFyndH2dX6kivIMXhLgb5/zTSpChUEh7lQT+dkYwIDAQAB` |
| CNAME | `rsend.auth` | `rsend-apne1.forge.rmta.net` |
| CNAME | `send.auth` | `send.forge.rmta.net` |

These are public verification values, not credentials. Confirm that Resend shows the domain as verified before proceeding. Its live record values take precedence if the domain is recreated. The optional root DMARC record shown in its setup was not approved or changed.

## Secure SMTP configuration

Use a Resend API key restricted to sending for this authentication domain. The operator creates the key and enters it directly into Supabase's SMTP password field. Do not paste it into chat, commit it, put it in a `VITE_` variable, or use it in the browser bundle.

- Supabase project: `muiqwbcavofvnjbwhbem` (Eva Tarot).
- SMTP host: `smtp.resend.com`; port: `465`; username: `resend`.
- SMTP password: the restricted Resend API key.
- Sender email: `no-reply@auth.evatarot.xyz`; sender name: `Eva Tarot`.
- Keep email verification enabled (`mailer_autoconfirm=false`). Do not enable anonymous sign-in or weaken owner authorization.
- Use focused bilingual authentication templates containing `{{ .Token }}` for both signup confirmation and magic link. Retain `{{ .ConfirmationURL }}` as an alternative so the existing owner magic-link flow continues to work. No marketing content or private reading text belongs in these messages.
- Check Auth email quotas and provider quotas. Do not increase paid limits without approval. Add bot protection before increasing public email volume.

Resend documents these [Supabase SMTP settings](https://resend.com/docs/send-with-supabase-smtp). Supabase explains its [production SMTP requirement](https://supabase.com/docs/guides/auth/auth-smtp) and [email OTP templates](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Activation

1. Apply the reviewed customer recovery migration and deploy `customer-account` with handler authentication (`verify_jwt=false`). Browser database roles receive no vault/RPC privileges.
2. Generate a new random 32-byte `EVA_ACCOUNT_VAULT_KEY` and store it only as a Supabase Edge secret. Keep a secure operator backup. **Do not replace the key once accounts are linked without re-encrypting every vault row first.** Never reuse the reading API internal key.
3. Keep `EVA_ACCOUNT_ENABLED` absent/false until SMTP and templates are ready; then set it to `true`. Set Vercel `VITE_CUSTOMER_ACCOUNTS_ENABLED=true` and rebuild only after the checks below succeed.
4. Verify an owner can still use their existing sign-in flow. Do not impersonate the owner or bypass email verification for acceptance testing.

## Acceptance before advertising recovery

- Real customer code delivery and expiry/resend behavior; rejected codes never link a wallet.
- First link preserves the exact credits/orders and does not grant another trial.
- Wait for confirmed journal sync, then restore in a second clean browser/device; verify profile, photo, readings and calendar notes.
- A different guest wallet is preserved separately, with no credit merge.
- Sign-out/account switching hides the previous journal and orders. Pause backup in another tab stops its upload; stale requests cannot reactivate an old connection.
- Offline and conflicting edits remain recoverable, with visible sync errors. A blocked storage browser can still explore the public website.

Automated tests exercise these boundaries with synthetic providers/databases. They do not establish real SMTP delivery, physical-device installation or bank settlement.

## Payment privacy

Public payment pages/catalog omit the legal recipient name and arbitrary named QR metadata. QRs encode only the approved routing, amount and order reference. Bank applications can resolve and display the registered account holder; Eva cannot hide that bank-side verification. The owner may retain a private recipient label. Historical Git commits and external caches are outside a UI change.
