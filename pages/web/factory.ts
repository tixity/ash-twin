import type { Page } from '@playwright/test';
import type { TenantConfig } from '../../types/tenant';
import type { WebPages } from './types';
import { DefaultLandingPage } from './default/landing';
import { DefaultEventPage } from './default/event';
import { DefaultEventDatesPage } from './default/event_dates';
import { DefaultCheckoutProductsPage } from './default/checkout_products';
import { DefaultCheckoutPage } from './default/checkout';
import { DefaultConfirmationPage } from './default/confirmation';
import { DefaultAuthPage } from './default/auth';
import { CapetownLandingPage } from './capetown/landing';
import { CapetownEventPage } from './capetown/event';
import { CapetownEventDatesPage } from './capetown/event_dates';
import { CapetownCheckoutProductsPage } from './capetown/checkout_products';
import { CapetownCheckoutPage } from './capetown/checkout';
import { CapetownConfirmationPage } from './capetown/confirmation';
import { CapetownAuthPage } from './capetown/auth';


// Return the WebPages bundle for the tenant's theme.
export function webPages(page: Page, tenant: TenantConfig): WebPages {
  switch (tenant.theme) {
    case 'default':  return defaultPages(page);
    case 'capetown': return capetownPages(page, tenant);
    case 'next':     return nextPages(page, tenant);
  }
}

function defaultPages(page: Page): WebPages {
  return {
    landing:          new DefaultLandingPage(page),
    event:            new DefaultEventPage(page),
    eventDates:       new DefaultEventDatesPage(page),
    checkoutProducts: new DefaultCheckoutProductsPage(page),
    checkout:         new DefaultCheckoutPage(page),
    confirmation:     new DefaultConfirmationPage(page),
    auth:             new DefaultAuthPage(page),
  };
}

function capetownPages(page: Page, _tenant: TenantConfig): WebPages {
  return {
    landing:          new CapetownLandingPage(page),
    event:            new CapetownEventPage(page),
    eventDates:       new CapetownEventDatesPage(page),
    checkoutProducts: new CapetownCheckoutProductsPage(page),
    checkout:         new CapetownCheckoutPage(page),
    confirmation:     new CapetownConfirmationPage(page),
    auth:             new CapetownAuthPage(page),
  };
}

function nextPages(_page: Page, tenant: TenantConfig): WebPages {
  throw new Error(
    `next page bundle not yet implemented (needed by tenant '${tenant.name}'). ` +
    `The Next.js customer app is a separate frontend — add pages/web/next/*.ts and finish nextPages() when ready.`,
  );
}
