import type { EventCriteria } from '../../types/event';
import type { AddonCriteria } from '../../types/addon';
import { registeredShipmentKeys } from '../../shipments';

/**
 * What "an eligible web-checkout addon" means — reused across every preset
 * that wants to filter on addons. Kept as a named constant so a preset can
 * either spread it into `hasAddons` (target events WITH such an addon) or
 * into `hasNoAddons` (skip them).
 */
const webCheckoutAddon: AddonCriteria = {
  status:      'pub',
  webshop:     true,
  hasCategory: { webPublished: true },
};

export const events = {

  normal: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          false,
    requiresLogin:      false,
    hasNoAddons:        webCheckoutAddon,
    shipmentIn:         registeredShipmentKeys(),
    hasCategory: {
      numbering:    'none',
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,

  /** A presale event — for testing the presale hash / code-entry flow. */
  presale: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          true,
    isPrivate:          false,
    requiresLogin:      false,
    hasNoAddons:        webCheckoutAddon,
    hasCategory: {
      numbering:    'none',
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,

  /** A private / code-gated event — for testing the private-event code entry modal and guestlist flow. */
  privateAccess: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          true,
    requiresLogin:      false,
    hasNoAddons:        webCheckoutAddon,
    hasCategory: {
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,

  /** A national-ID-gated event — for testing the NationalID collection step. */
  requiresNationalId: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          false,
    requiresNationalId: true,
    requiresLogin:      false,
    hasNoAddons:        webCheckoutAddon,
    hasCategory: {
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,

  /** A login-required event — for testing anonymous-user redirect-to-login. */
  requiresLogin: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          false,
    requiresNationalId: false,
    requiresLogin:      true,
    hasNoAddons:        webCheckoutAddon,
    hasCategory: {
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,

  /**
   * An unpublished event — for testing the "not visible" branch. Almost every
   * visibility filter is relaxed because an unpub event typically fails them
   * anyway (webshop = 0, view window closed, etc.).
   */
  unpublished: {
    status: 'unpub',
    model:  'event',
    source: 'local',
  } satisfies EventCriteria,

  /** An event whose GA category is sold out — for testing the sold-out branch. */
  soldOutGa: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          false,
    requiresLogin:      false,
    hasNoAddons:        webCheckoutAddon,
    hasCategory: {
      numbering:    'none',
      webPublished: true,
      soldout:      true,
    },
  } satisfies EventCriteria,

  /**
   * An event that HAS an addon eligible on web checkout — for testing the
   * addons page in the checkout flow. `hasAddons` inverts the usual query.
   */
  withAddons: {
    status:             'pub',
    rep:                'sub-or-unique',
    model:              'event',
    source:             'local',
    webshop:            true,
    inViewWindow:       true,
    isFuture:           true,
    parentViewable:     true,
    isPresale:          false,
    isPrivate:          false,
    requiresLogin:      false,
    hasAddons:          webCheckoutAddon,
    hasCategory: {
      webPublished: true,
      soldout:      false,
    },
  } satisfies EventCriteria,
} as const;
