import type { Page } from '@playwright/test';
import type { TenantConfig } from '../types/tenant';
import type { Event } from '../types/event';
import type { Category } from '../types/category';
import type { Order } from '../types/order';
import type { WebPages } from '../pages/web/types';
import type { CheckoutUserInfo } from '../pages/web/default/checkout';
import type { LoginCreds } from '../types/user';
import type { SelectionStrategy } from '../types/seat';
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
    return this.finishCheckout(opts);
  }

  /** Seated equivalent of buyTicket. Auto-picks first-n or best-available/GA based on the loaded map. */
  async buySeatedTicket(
    event:    Event,
    category: Category,
    count:    number,
    opts?:    BuyTicketOpts,
  ): Promise<Order> {
    await this.openEvent(event);
    await this.pages.event.pickCategory(category.id);
    await this.pages.event.openSeatMap(category.id);
    await this.pages.seatmap.waitReady();

    const strategy = await this.pickStrategyForCategory(category.id, count);

    if (strategy.kind === 'best-available') {
      await this.pages.seatmap.enterSection(strategy.sectionUuid);
      await this.pages.event.setQuantity(category.id, strategy.count);
      await this.pages.event.acceptTerms();
      await this.pages.event.addToCart(category.id);
    } else {
      await this.pages.seatmap.pickByStrategy(strategy);
      await this.pages.event.acceptTerms();
      await this.pages.event.commitSeatMap(category.id);
    }

    return this.finishCheckout(opts);
  }

  private async finishCheckout(opts?: BuyTicketOpts): Promise<Order> {
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

  private async pickStrategyForCategory(categoryId: string | number, count: number): Promise<SelectionStrategy> {
    // Section-level pick (GA or best-available) takes priority: individual seats
    // on these categories exist in the data but aren't clickable — the SUT
    // expects a single section click + quantity.
    const sections = await this.pages.seatmap.listSections({ categoryId });
    const sectionLevel = sections.find(s => s.ga || s.bestAvailable);
    if (sectionLevel) return { kind: 'best-available', sectionUuid: sectionLevel.uuid, count };

    const seats = await this.pages.seatmap.list({ categoryId, freeOnly: true });
    if (seats.length >= count) {
      const bySection = new Map<string, number>();
      for (const s of seats) {
        if (s.sectionUuid) bySection.set(s.sectionUuid, (bySection.get(s.sectionUuid) ?? 0) + 1);
      }
      const withEnough = [...bySection.entries()].find(([, n]) => n >= count);
      return { kind: 'first-n', categoryId, count, sectionUuid: withEnough?.[0] };
    }

    throw new Error(
      `buySeatedTicket: category ${categoryId} has only ${seats.length} free seats ` +
      `and no GA/best-available section fallback.`,
    );
  }
}
