# Contact form security

The public contact form submits `name`, `email`, and `message` to the existing
Formspree endpoint. Its browser-side validation, honeypots, minimum completion
time, disposable-email check, and local rate limit improve user experience and
reduce basic automated abuse. They are not server-side security controls and
can be bypassed by a client that calls Formspree directly.

## Formspree settings to verify

- Keep email notifications enabled for form `mwpllanl`.
- Confirm that the Target Email is `kevin.lao@hotmail.fr`.
- Verify that this address is listed as a verified Linked Email.
- Keep the Submission Archive enabled and review both Submissions and Spam.
- Keep Formspree's available spam protection enabled.
- If the current plan supports Rules, ensure an `Always → Send Email` action
  points to the verified target address. Add a custom honeypot rule for
  `companyWebsite` only if that field is intentionally sent in the future.
- Keep the visitor's `email` field as Reply-To. Do not use an untrusted visitor
  address as the From address.
- Review delivery and spam activity regularly. A successful API response means
  that Formspree accepted the submission, not that an email provider delivered
  the notification to the inbox.

## CAPTCHA and Turnstile

Do not add a placeholder CAPTCHA or commit a secret key. Formspree's dashboard
offers spam-protection settings. Cloudflare Turnstile can be considered later
only after a real site key is configured for the public GitHub Pages hostname
and its secret key is stored in Formspree or Cloudflare—not in this repository.

## Privacy

The browser sends only the form fields plus a subject, page URL, submission
timestamp, source label, and the empty Formspree `_gotcha` field. It does not
store message content or email addresses in `localStorage`, and it does not
fetch IP addresses or add third-party tracking.
