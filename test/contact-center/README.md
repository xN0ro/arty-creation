# Contact page checks

The public contact page creates a persistent support conversation as well as a CRM contact record. Team members with the existing `support` permission can assign it, add internal notes, change its status, and reply by email. Guest submissions never attach an account or an order based on an email address or an order reference alone.

Run from the repository root:

```sh
npm install --ignore-scripts
node --test test/contact-center.test.js
npm ci --prefix test/contact-center --ignore-scripts
npm test --prefix test/contact-center
node --test test/contact-center/production-smoke.cjs
```

- API tests use a temporary database and intercept the email transport. They cover category routing, email contents, concurrent retry deduplication, invalid input, email failures, account/order ownership, permissions and guest replies.
- DOM tests load the actual page and application scripts. They cover conditional fields, validation, FR/EN switching, drafts, pending requests, success/error states and the mobile integration. CSS scope checks verify that rules apply only to contact components.
- The smoke test starts the actual `server.js` production wrapper with a temporary database and `ARTY_EMAIL_MODE=log`. It checks `/contact`, `/contact/`, English metadata, assets, sitemap and request persistence.

No test sends a real email or touches a live customer database. DOM tests do not render browser geometry. Review the desktop and mobile appearance in a real browser before treating visual QA as complete, and verify a real mailbox receipt separately with an authorized test submission.

Customer email replies go to the configured business mailbox; they are not automatically imported into the support conversation. The staff interface calls this out for guest requests. Existing email settings remain authoritative. A saved request remains successful even if a notification cannot be delivered; staff see that delivery status in the inbox.
