import type { DefaultLandingPage } from './default/landing';
import type { DefaultEventPage } from './default/event';
import type { DefaultEventDatesPage } from './default/event_dates';
import type { DefaultCheckoutProductsPage } from './default/checkout_products';
import type { DefaultCheckoutPage } from './default/checkout';
import type { DefaultConfirmationPage } from './default/confirmation';
import type { DefaultAuthPage } from './default/auth';

/**
 * Contract for the customer-facing page objects the WebCustomer actor drives.
 * Every theme's page bundle satisfies this shape — see `pages/web/factory.ts`
 * for the tenant.theme → bundle mapping. The type parameters happen to be
 * named after the `default` theme's classes because it's the first one
 * implemented; capetown/next classes satisfy the same shape via structural
 * typing (public methods must match).
 */
export interface WebPages {
  landing:          DefaultLandingPage;
  event:            DefaultEventPage;
  eventDates:       DefaultEventDatesPage;
  checkoutProducts: DefaultCheckoutProductsPage;
  checkout:         DefaultCheckoutPage;
  confirmation:     DefaultConfirmationPage;
  auth:             DefaultAuthPage;
}
