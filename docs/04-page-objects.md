# 04 — Page objects

`pages/web/` — the UI-mechanics layer. Each page object owns the selectors + atomic actions for one page.

## Structure

```
pages/web/
├── base.ts              — abstract BasePage + shared WAIT budgets
├── types.ts             — WebPages interface (the bundle contract)
├── factory.ts           — webPages(page, tenant) picks the right set
├── default/             — default-theme pages (used by cca)
│   ├── landing.ts
│   ├── auth.ts
│   ├── event.ts
│   ├── event-dates.ts
│   ├── checkout-products.ts   — the addons / shop-products interstitial
│   ├── checkout.ts            — the checkout preview (handling radios, submit)
│   └── confirmation.ts
└── capetown/            — capetown-theme overrides (theagenda, adrea, blublood)
```

Future themes (antoine's Next.js, virgin's Next.js) will land alongside `default/` and `capetown/`.

## The chassis — `BasePage`

Every concrete page extends it. Provides:

- `protected page: Page` — the raw Playwright browser tab
- `protected waitReady()` — wait for DOM ready
- `protected waitForNetworkIdle()` — stronger wait, used by SPAs
- `protected assertUrl(pattern)` — verify current URL
- `protected isVisibleSoon(locator, timeout = WAIT.LONG)` — try/catch around `waitFor({ state: 'visible', timeout })`, returns `boolean` without throwing. Use for "is this eventually visible?" checks; instant `.isVisible()` races async DOM (jQuery Validate remote rules, AJAX renders).

Shared timeout budgets (`WAIT`): `QUICK: 1.5s`, `MEDIUM: 5s`, `LONG: 30s`. Positive assertions can pass `WAIT.LONG`; negative assertions (`expect(...).toBe(false)`) should pass `WAIT.QUICK` or a custom short value — otherwise each negative check waits the full timeout.

No selectors, no URL. Each concrete page adds those.

## Concrete page anatomy

```ts
export class EventPage extends BasePage {
  // 1. URL — property for static, buildPath(...) method for parameterized
  buildPath(id: number): string { return `/event/${id}`; }

  // 2. Selectors — Locator properties
  readonly categoryRadios = this.page.locator('input[name="category_id"]');
  readonly checkoutButton = this.page.locator('#checkoutBtn');

  // 3. Navigation
  async open(id: number) {
    await this.page.goto(this.buildPath(id));
    await this.waitReady();
  }

  // 4. Atomic actions — one gesture each
  async pickCategory(id: number) {
    await this.page.locator(`input[name="category_id"][value="${id}"]`).check();
  }

  async addToCart(categoryId: number) {
    await this.page.locator(`#li_${categoryId} .mini_add_to_cart`).click();
    await this.waitReady();
  }
}
```

## The factory — picks the right set per tenant

```ts
export function webPages(page: Page, tenant: TenantConfig): WebPages {
  // if (tenant.name === 'antoine') return antoineWebPages(page);
  // if (tenant.name === 'adrea' || tenant.name === 'blublood') return capetownWebPages(page);
  return {
    landing:      new LandingPage(page),
    event:        new EventPage(page),
    checkout:     new CheckoutPage(page),
    confirmation: new ConfirmationPage(page),
  };
}
```

Actor calls the factory once in its constructor. Actor code stays tenant-agnostic; the factory hides differences.

## Per-tenant overrides

When a tenant's DOM differs (adrea uses capetown theme, antoine uses Next.js), create an override file that extends the default class and overrides ONLY the differing selectors/URLs:

```ts
// pages/web/tenants/antoine/event.ts
export class AntoineEventPage extends EventPage {
  override buildPath(id: number): string { return `/events/${id}`; }   // Next.js path
  override readonly addToCartButtons = this.page.locator('[data-testid="add-to-cart"]');
}
```

Everything else inherits. Add branch to factory.

## The checkout page's handling API

`checkout.ts` exposes two primitives that keep tests + payment strategies out of numeric ID land:

```ts
async readAvailableHandlings(): Promise<RenderedHandling[]>
// Reads every input[name="handling_id"] the server rendered and returns
// { id, paymentKey, feeLabel } tuples. paymentKey mirrors data-payment-type
// (matches the eph_{name}.php plugin filename).

async pickHandlingByPayment(paymentKey: string): Promise<Locator>
// Clicks the label wrapping the matching radio (radios are visually
// hidden — the label handles the toggle) and returns the <label>
// Locator so payment strategies can scope their own selectors to it.
// Works on both themes: default and capetown both emit
// data-payment-type on the handling radio (capetown's cart_content.tpl
// was updated to match).
```

`RenderedHandling` is defined inline in `checkout.ts` and NOT in `types/` — only the checkout page produces it, only the actor consumes it. See [10-payments.md](./10-payments.md) for how strategies build on top.

The address form (`fillUserInfo`) is a placeholder — CCA overrides the template with emirate/area `customSelect` dropdowns that need dedicated handling. Fine for the current test set (all use shipment methods that don't require a physical address); revisit when we tackle shipment-required flows.

## The products interstitial

`checkout-products.ts` maps to the `checkout_products_list.tpl` interstitial that SquareMaze renders between the event page and the real checkout preview when the cart is eligible for addons or shop products. The URL doesn't tell you when you're on it (the template shares URL with the preview) — detection is DOM-based via `#btns #checkoutBtn`.

```ts
async isCurrent(): Promise<boolean> {
  return await this.checkoutButton.isVisible();
}
async continue(): Promise<void> {
  await this.checkoutButton.click();
  await this.waitReady();
}
```

Tests skip it explicitly through the actor: `if (await customer.isOnCheckoutProducts()) await customer.proceedFromProducts()`. Not folded into `proceedToCheckout` because future tests will interact with addons/products before advancing.

### Cross-theme addon primitives

Both themes render addons through `product_card_modal.tpl` (a `.product-card[data-product-id=X]` grid; the picker lives inside a fancybox-driven modal opened on card click). `default/` also supports the legacy inline `products_listing.tpl` layout as a fallback. `checkout-products.ts` exposes a shared contract every theme implements:

```ts
// Presence + state
hasAddon(addonId, addonName): Promise<boolean>
isAddonSoldOut(addonId, addonName): Promise<boolean>
readAddonPickerAttr(addonId, categoryId, attr): Promise<string | null>

// Modal + qty interaction
openAddonModal(addonId): Promise<void>
closeAddonModal(): Promise<void>
getAddonQty(addonId, categoryId): Promise<number>
incAddon(addonId, categoryId, times?): Promise<void>

// Full add-to-cart via the modal (optionally with a promo code)
addAddonViaModal(addonId, categoryId, qty, opts?: { promoCode?: string }): Promise<void>

// Card-level discount contract (pre-render data-* attrs, not visual badges)
hasAddonAutoDiscount(addonId): Promise<boolean>       // data-has-auto-discount="true"
hasAddonPromoTag(addonId): Promise<boolean>           // data-has-non-promo-discounts="true"
hasAddonAnyDiscount(addonId): Promise<boolean>        // data-has-discounts="true"
readAddonAutoDiscountId(addonId): Promise<number | null>
readAddonCardPrice(addonId): Promise<{ current: string; original: string | null }>
readAddonCategoryData(addonId): Promise<AddonCategoryEntry[]>  // multi-cat only
```

Notes on the non-obvious bits:

- **Picker selectors target `.modal-quantity-picker.addon[data-addon-id][id]`** — not the generic `.quantity-picker.addon` — so they don't collide with the invisible `#product-drawer` skeleton that `products.js` also populates.
- **`openAddonModal` waits for jQuery's `click.modal` handler** to bind on `.inc` before returning. `products.js` binds the picker's increment handler inside fancybox's `afterShow` callback, which fires a fraction after `waitFor({ state: 'visible' })` resolves — clicks would otherwise land on the button but fire no listener.
- **`addAddonViaModal` filters `waitForResponse` on `action=_addtocart` in the POST body.** Opening the modal fires an `action=PlaceMap` POST first (to populate the discount block); an unfiltered `waitForResponse` resolves on that instead of the add-to-cart response.
- **Card-level discount badges (`.badge.discount` / `.badge.promo`) render inside `.product-card-image`**, which only exists when the addon has an image. Factory-created addons have none, so the discount primitives read the pre-render `data-*` contract instead — same signals `products.js` reads.
- **Capetown's card list doesn't surface a sold-out marker** anywhere — not on the card, not in the modal. `isAddonSoldOut` returns false there; sold-out tests live in `specs/vitality/default/` instead.
- **`closeAddonModal` calls `$.fancybox.close()` via `page.evaluate`** rather than pressing Escape. When the promo input holds focus after a failed add, Escape doesn't dismiss the overlay, and later gestures (logout) get intercepted by the fancybox overlay.

The checkout preview page (`checkout.ts`) exposes one addon-line primitive for tests that verify the discount persists past the addons page:

```ts
readAddonLineUnitPrice(parentEventId, addonName): Promise<string>
```

`cart_content.tpl` groups all addons under `#cart-item-{parentEventId}-product`; the primitive filters by addon name inside that block and reads `.unit-price` (with the `.seat-count` span stripped so the price parses cleanly). Note that the default theme's template omits the strikethrough `.discount-price` for addons (assigns `$disc` only in the non-addon branch) — capetown emits it correctly. Assert on the discounted `unit-price` value directly, not on strikethrough presence.

## Selector conventions

- **Prefer stable selectors**: IDs, `name=` attributes, `getByRole`
- **Avoid**: nth-child, sibling traversal, DOM hierarchy assumptions
- **One source of truth**: every selector lives in exactly one page-object file
- **No business logic** in page objects — that's the actor's job
- **For gateway iframes (Cybersource, Frames):** re-scan `page.frames()` after every state transition and match by URL substring — the SDKs swap iframes as they change screens, so cached locators go stale. See [10-payments.md](./10-payments.md) for the pattern.

## Gotchas learned from the CCA event page

Real DOM discoveries worth documenting so the next author doesn't retrace them:

### Radios and quantity inputs are CSS-hidden

Category radios carry `class="radioform"` and are visually hidden. Playwright's `.check()` requires visibility, so we click the visible `<header id="{categoryId}">` above the radio — that's the actual human click target and it toggles the radio via JS.

Quantity inputs are `disabled` — humans can't type into them. Use the `.inc` / `.dec` buttons scoped to the category (`#li_{catId} .quantity-picker .inc`) and click `n` times to reach the target quantity. The buttons also fire the JS that toggles `.mini_add_to_cart` between disabled/enabled — typing into the input directly (even via `.evaluate()`) skips that.

### Add-to-cart is AJAX; watch DOM, not URL

Clicking `.mini_add_to_cart` fires an AJAX POST — no navigation. The success signal we currently watch is `#checkoutBtn` becoming visible (its parent `#btns` has the `hidden` class removed on successful add). This is a **proxy signal**: it works but is prone to false positives if the cart already had items from a prior step. When we need certainty, layer a `page.waitForResponse(...)` around the click, or query the cart after.

### Two page-load popups to dismiss

Both are fancybox modals that intercept pointer events on the categories:

1. **`#popup`** — the event-level notice. Rendered when `event_notice != ""`, and *opened automatically* when `event_notice_popup = 1`. `showConfirm()` in `public/default/js/init.js` triggers it on `ready` via `checkPageLevelEventNotice()`. Dismissed by `#popup .btns a` (whose `href` calls `$.fancybox.close()`).
2. **Venue / category info fancyboxes** — e.g. "Family Package", "Rates for mates". Same close pattern: `.fancybox-wrap.fancybox-opened a[href*="fancybox.close"]` or `.fancybox-close`.

`EventPage.dismissNotice()` waits briefly for either and clicks its close/OK anchor; no-op if neither surfaces. Called automatically from `EventPage.open()`.

### Terms and age-restriction checkboxes

When the event has `event_terms` or `event_age_restrictions > 0`, `.mini_add_to_cart` refuses to fire until both boxes are checked. See `event_terms.tpl` — checkboxes are `input[name="event_terms"]` and `input[name="event_age_restrictions"]` inside `#terms`. `EventPage.acceptTerms()` force-checks both (radios/checkboxes may be CSS-hidden). Safe no-op when the event has neither.
