# CRM workspace

The CRM keeps its existing leads, customer records, quotes and payment workflows. The new **My day** screen groups follow-ups into today, overdue, upcoming, unassigned and missing-next-action queues. Leads have list and board views; customer profiles combine purchases, private events, notes, recorded conversations and permitted support history.

Each lead stores multiple follow-up tasks and an activity history under `crm.tasks` and `crm.activities`. Existing `nextFollowUp` records migrate lazily, retaining their Calendar event IDs. The legacy fields continue to mirror the earliest open task. Completing or cancelling a task preserves its outcome; closing a lead cancels existing sales reminders. Explicit post-sale tasks can still be scheduled.

Task mutations save before Calendar requests. Calendar responses merge only their metadata into a fresh database snapshot, with a per-lead queue for overlapping syncs. Lead edits use revisions to reject stale forms. This coordination is for the application's existing single-process JSON database; it is not a distributed lock for multiple application replicas. Calendar requests time out and report failures without discarding saved tasks. The retry control also covers failed removal of completed reminders.

Customer spending includes actual order and private-event payments minus refunds. A lost lead is counted as quoted only when there is quote evidence. Staff reports are limited to assigned customers, and support messages require the support permission. Marketing consent remains customer-controlled.

## Run checks

From the repository root, install the application and isolated DOM-test dependencies:

```sh
npm install --ignore-scripts
npm ci --prefix test/mobile-commerce --ignore-scripts
node --test test/crm.test.js test/crm-workspace.test.js test/crm-production.cjs test/crm-workspace-dom.cjs
node --test test/commerce.test.js test/mobile-studio.test.js test/contact-center.test.js test/contact-center/production-smoke.cjs
NODE_PATH="$PWD/test/mobile-commerce/node_modules" node --test test/contact-center/check.cjs
node test/mobile-commerce/check.cjs
```

`ARTY_JSDOM_PATH` can point to an existing isolated jsdom installation. The production CRM suite launches the actual `server.js` wrapper with a temporary database. Calendar and Stripe are stubbed, external HTTPS is blocked, and email uses log mode. It covers permissions, assignment, concurrent notes, task retries, outcomes, stale revisions, provider failures, payment/CRM races and served assets. The DOM suite covers task forms, search focus, filters, FR/EN, safe rendering, keyboard handling and load errors.

These tests neither use live customer data nor send messages or payments. DOM tests do not render browser geometry. An authenticated visual review and real Calendar provider delivery remain separate checks.

## Operating notes

- Start with **My day**, complete each follow-up with an outcome, and optionally schedule the next action in the same form.
- **Log a conversation** records a call, email or meeting that already happened. It does not send an email or import a mailbox.
- Calendar synchronization uses the existing connection and assigned owner. The CRM retains tasks when Calendar is disconnected; use the retry button after reconnecting. External mailbox replies are not automatically imported.
- Existing quote, payment, refund, support and account actions remain available from the CRM. The new styling is scoped to CRM components.
