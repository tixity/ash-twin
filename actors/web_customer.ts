import type { Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { Event } from '../types/event';
import type { Category } from '../types/category';
import type { Order } from '../types/order';
import type { WebPages } from '../pages/web/types';
import type { CheckoutUserInfo } from '../pages/web/default/checkout';
import type { LoginCreds } from '../types/user';
import type { TestCard } from '../payments';
import { webPages } from '../pages/web/factory';
import { Resolver } from '../helpers/resolver';
import { getPaymentStrategy, registeredPaymentKeys } from '../payments';

export interface BuyTicketOpts {
  userInfo?: CheckoutUserInfo;
  payment?: {
    key:           string;
    card?:         TestCard;
    strategyOpts?: Record<string, unknown>;
  } | 'any';
}

/**
 * WebCustomer — the business layer for the customer-facing purchase flow.
 * Only holds methods that either touch multiple pages, make a routing
 * decision, or add guards / service calls around the raw page gestures.
 * Atomic gestures live on the page objects; tests reach them through
 * `customer.pages.<page>.*`.
 */
export class WebCustomer {
  readonly pages: WebPages;

  constructor(
    readonly page:     Page,
    readonly tenant:   TenantConfig,
    readonly resolver: Resolver,
  ) {
    this.pages = webPages(page, tenant);
  }

  async login(creds: LoginCreds): Promise<void> {
    await this.pages.auth.open();
    await this.pages.auth.login(creds);
  }

  async isSignedIn(): Promise<boolean> {
    return this.pages.auth.isSignedIn();
  }

  async isOnAuthPage(): Promise<boolean> {
    return this.pages.auth.isOnPage();
  }

// navigate to event page

  async openEvent(event: Event): Promise<void> {
    if (event.rep === 'sub' && event.mainId != null) {
      await this.pages.event.open({ id: event.mainId, type: event.type });
      await this.pages.eventDates.pickDate(event.id);
      return;
    }

    await this.pages.event.open(event);

    if (event.rep === 'main') {
      const sub = await this.resolver.nextSub(event.id);
      await this.pages.eventDates.pickDate(sub.id);
    }
  }

  async openEventById(id: number): Promise<void> {
    const event = await this.resolver.event(id);
    await this.openEvent(event);
  }

  async payWith(
    paymentKey: string,
    testCard?:  TestCard,
    opts?:      Record<string, unknown>,
  ): Promise<void> {
    const available = await this.pages.checkout.readAvailableHandlings();
    if (!available.some(h => h.paymentKey === paymentKey)) {
      const list = available.map(h => h.paymentKey).join(', ') || '(none)';
      throw new Error(
        `Payment '${paymentKey}' not rendered on this checkout. Available: [${list}]`,
      );
    }
    const strategy      = getPaymentStrategy(paymentKey);
    const handlingLabel = await this.pages.checkout.pickHandlingByPayment(paymentKey);
    const ctx           = { handlingLabel, testCard, opts };

    await strategy.prepare?.(this.page, ctx);
    await this.pages.checkout.submit();
    await strategy.complete(this.page, ctx);
  }

  async logout(): Promise<void> {
    await this.pages.auth.logout();
  }

  async cartItemCount(): Promise<number> {
    const badge = this.page.locator('#cart .cart-count').first();
    if ((await badge.count()) === 0) return 0;
    const text = (await badge.textContent()) ?? '0';
    return parseInt(text.trim(), 10) || 0;
  }


// Pay using whichever rendered handling has a registered strategy.
  async payWithAny(): Promise<void> {
    const available  = await this.pages.checkout.readAvailableHandlings();
    const registered = new Set(registeredPaymentKeys());

    for (const h of available) {
      if (registered.has(h.paymentKey)) return this.payWith(h.paymentKey);
    }

    const availList = available.map(h => h.paymentKey).join(', ') || '(none)';
    const regList   = [...registered].join(', ') || '(none)';
    throw new Error(
      `payWithAny: no rendered handling has a registered strategy. ` +
      `Rendered: [${availList}]. Registered: [${regList}].`,
    );
  }

  /**
   * Full purchase flow: event → cart → (skip products interstitial if shown) →
   * checkout → optional payment → confirmation. Returns the resulting Order.
   *
   * Auto-skips the products interstitial when present — this composite is the
   * "happy-path buy". Tests that need to interact with addons/products should
   * drive the individual page objects through `customer.pages.*` instead.
   */
  async buyTicket(
    event:    Event,
    category: Category,
    quantity: number,
    opts?:    BuyTicketOpts,
  ): Promise<Order> {
    await this.openEvent(event);
    await this.pages.event.pickCategory(category.id);
    await this.pages.event.setQuantity(category.id, quantity);
    await this.pages.event.acceptTerms();
    await this.pages.event.addToCart(category.id);
    await this.pages.event.proceedToCheckout();

    if (await this.pages.checkoutProducts.isCurrent()) {
      await this.pages.checkoutProducts.continue();
    }

    if (opts?.userInfo) {
      await this.pages.checkout.fillUserInfo(opts.userInfo);
    }

    if (opts?.payment === 'any') {
      await this.payWithAny();
    } else if (opts?.payment) {
      await this.payWith(opts.payment.key, opts.payment.card, opts.payment.strategyOpts);
    } else {
      await this.pages.checkout.submit();
    }

    return await this.pages.confirmation.readOrder();
  }
}
