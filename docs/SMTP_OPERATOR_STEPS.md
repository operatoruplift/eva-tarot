# Finish Eva Tarot sign-in email setup

Last updated: 22 October 2026.

The three approved DNS records are saved and publicly confirmed. Resend's last observed status was **Pending**. Browser access remains unavailable, so these account steps need to be completed directly by the operator. No restart is required for this handoff.

## 1. Confirm the sending domain

Open [Eva's Resend domain](https://resend.com/domains/5f23a5e4-37df-41bc-baa6-44da07bb3b64) and confirm that `auth.evatarot.xyz` shows **Verified**. If it is still pending, use Resend's verification check and wait for it to finish before continuing. The approved records are listed in the [operations guide](ACCOUNT_RECOVERY_OPERATIONS.md#resend-domain-prepared-for-this-project).

## 2. Create the sending key privately

Open [Resend API keys](https://resend.com/api-keys) and create a key with:

- Name: **Eva Tarot Auth**
- Permission: **Sending access**
- Domain: **auth.evatarot.xyz**

Copy the key directly into the SMTP password field in the next step. Keep a private copy in your password manager. **Do not paste the key into chat.** Creating and entering this authentication credential is an operator step under the browser credential policy.

## 3. Save Supabase SMTP settings

Open [Eva's Supabase SMTP settings](https://supabase.com/dashboard/project/muiqwbcavofvnjbwhbem/auth/smtp), enable custom SMTP, and check these values:

| Setting | Value |
| --- | --- |
| Sender email | `no-reply@auth.evatarot.xyz` |
| Sender name | `Eva Tarot` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | The restricted Resend API key from step 2 |

Select **Save Changes**. The previously prepared form was only a draft; a successful save still needs confirmation. Report the domain status and whether SMTP saved successfully, without sharing the key.

## Remaining activation checklist

- [ ] Resend domain shows **Verified**.
- [ ] Restricted sending key entered privately and SMTP settings saved.
- [ ] Apply the prepared [Confirm signup](../supabase/templates/confirm-signup.html) and [Magic link](../supabase/templates/magic-link.html) templates in Supabase. Both must retain `{{ .Token }}` and `{{ .ConfirmationURL }}` so customer codes and existing owner links work. Neither template has been applied live yet.
- [ ] Confirm that the **existing stable vault key** is uploaded to Supabase Edge secrets. Its upload is not confirmed. Do not generate a replacement key.
- [ ] Test actual code delivery, owner sign-in compatibility, and recovery on a second device using the [acceptance checklist](ACCOUNT_RECOVERY_OPERATIONS.md#acceptance-before-advertising-recovery). The account owner enters their own code.
- [ ] Enable public customer sign-in only after acceptance passes. The backend and frontend customer feature flags are currently disabled; controlled testing follows the operations guide.

Keep email verification enabled and anonymous sign-in disabled. Pricing, trial credits, payment routing, and paid quotas are unchanged.

Official references: [Resend with Supabase SMTP](https://resend.com/docs/send-with-supabase-smtp), [Resend API key permissions](https://resend.com/docs/dashboard/api-keys/introduction).
