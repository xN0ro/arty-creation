Mobile storefront regression checks
==================================

Run `npm --prefix test/mobile-commerce ci` and `npm --prefix test/mobile-commerce test`.

These isolated DOM checks cover the existing catalog, configured prices, cart, guest checkout validation, server tax calculations, Stripe button states, language, desktop restoration, and idle rendering. They use synthetic catalog data and block order writes. The dependency is isolated from the production app.

Geometry and viewport queries are simulated. This suite does not replace screenshots, Safari/Android testing, or a Stripe end-to-end purchase.
