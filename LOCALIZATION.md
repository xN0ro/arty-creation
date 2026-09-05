# French and English

French is the default. Visitors can select FR or EN in the navigation or Studio. The selection is stored locally and in the URL (`?lang=en` or `?lang=fr`). Signed-in users also save an account preference. New orders, bookings, support requests, and event requests keep their own language for later emails, including webhook and admin-triggered emails.

## Editing content

The main admin content fields are French. The English section edits `translations.en` on the same product, event, category, announcement, discount, or package rule. Product size and add-on rows have their own English labels. Reusable product templates preserve English contents and option labels. Existing published catalog copy has reviewed English translations in the message catalog. New custom copy should be entered in both languages; an empty English field falls back to the original content.

## Interface messages

- `public/i18n-en.js` contains English translations keyed by the French source message.
- Use `I18n.t('Texte français')` for plain messages and `I18n.msg` tagged templates for messages containing values.
- Use `I18n.html` tagged templates for authored HTML. It translates text and accessible attributes before inserting values. It does not translate IDs, event handlers, URLs, input values, or interpolated customer content.
- Message placeholders such as `{0}` refer to values in order of appearance within that text segment. Keep quantities and plural forms grammatical in each language.
- Use `I18n.currency`, `I18n.locale`, and `I18n.status` for formatted display. Keep numeric calculations and canonical workflow values unchanged.
- Static HTML is bound once in `i18n-client.js`; language changes update those bindings and render the active page while retaining form and design state. Active Stripe widgets are retained and receive a locale update.

Server translations use `AsyncLocalStorage`, so concurrent French and English requests cannot change each other's language. Authenticated admin reads retain the original editable content. Public catalog responses use the requested language and declare `Content-Language` and `Vary` headers.

## Verification

Run `npm test` to check translated API responses, account language preferences, English content persistence, stable order and booking states, language isolation, currency, and transactional email rendering. Tests use temporary data and intercept email delivery; they do not send real messages or make purchases.
