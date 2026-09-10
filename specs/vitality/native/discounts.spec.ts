import { test, expect } from '../../../helpers/test';
import { events } from '../../../helpers/presets/event';
import { requireTestCustomer } from '../../../helpers/tenant';
import { withAddon } from '../../../factories/addon';
import { withDiscount } from '../../../factories/discount';
import { currencyToNumber } from '../../../helpers/currency';
import { registeredPaymentKeys } from '../../../payments';


// Discount vitality coverage. Grouped by surface (addon, event, product)
// via sibling test.describe blocks in this file — the discount engine is
// shared across surfaces, so keeping them side-by-side makes it easy to
// spot missing coverage on the newer surfaces.
//
// Serial mode: all tests log in as the tenant's testCustomer and share the
// browser session.


test.describe('addon discounts', () => {

  test.describe.configure({ mode: 'serial' });


  test(39, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(true);
        const { current, original } = await customer.pages.checkoutProducts.readAddonCardPrice(addon.addonId);
        expect(original).not.toBeNull();
        expect(currencyToNumber(current)).toBeCloseTo(80, 2);
        expect(currencyToNumber(original!)).toBeCloseTo(100, 2);

        feedback(`addon ${addon.addonId}: discount ${discount.discountId} (percent 20%) → ${current} from ${original}`);
        await customer.logout();
      });
    });
  });


  test(40, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'fixe', value: 30,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(true);
        const { current, original } = await customer.pages.checkoutProducts.readAddonCardPrice(addon.addonId);
        expect(currencyToNumber(current)).toBeCloseTo(70, 2);
        expect(currencyToNumber(original!)).toBeCloseTo(100, 2);

        feedback(`addon ${addon.addonId}: discount ${discount.discountId} (fixed -30) → ${current} from ${original}`);
        await customer.logout();
      });
    });
  });


  test(41, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // 'real' = customer pays exactly this amount, regardless of original
      await withDiscount(db, {
        eventId: addon.addonId, type: 'real', value: 45,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(true);
        const { current, original } = await customer.pages.checkoutProducts.readAddonCardPrice(addon.addonId);
        expect(currencyToNumber(current)).toBeCloseTo(45, 2);
        expect(currencyToNumber(original!)).toBeCloseTo(100, 2);

        feedback(`addon ${addon.addonId}: discount ${discount.discountId} (real=45) → ${current} from ${original}`);
        await customer.logout();
      });
    });
  });


  test(42, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Unrestricted discount would normally auto-apply; the presence of a
      // second discount with min_tickets>0 on the same event suppresses
      // auto-apply entirely (helper.discount.php:337–402).
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 10,
      }, async (unrestricted) => {
        await withDiscount(db, {
          eventId: addon.addonId, type: 'percent', value: 25, minTickets: 5,
        }, async (restricted) => {
          await customer.login(creds);
          await customer.openEvent(event);
          await customer.pages.event.pickCategory(parentCat.id);
          await customer.pages.event.setQuantity(parentCat.id, 1);
          await customer.pages.event.acceptTerms();
          await customer.pages.event.addToCart(parentCat.id);
          await customer.pages.event.proceedToCheckout();

          expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(false);

          feedback(`addon ${addon.addonId}: auto-apply suppressed by restricted discount ${restricted.discountId} alongside ${unrestricted.discountId}`);
          await customer.logout();
        });
      });
    });
  });


  test(43, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 15, promoCode: 'ASHTWIN15',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        // Promo-only addon: card knows a discount exists but nothing auto-applies.
        // (`data-has-non-promo-discounts` is false — that flag means "has auto-eligible",
        // which promo-code discounts aren't. The promo entry lives inside the modal.)
        expect(await customer.pages.checkoutProducts.hasAddonAnyDiscount(addon.addonId)).toBe(true);
        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(false);

        feedback(`addon ${addon.addonId}: promo-only discount ${discount.discountId} → data-has-discounts + no auto-apply`);
        await customer.logout();
      });
    });
  });


  test(44, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    // Multi-cat addon so we have a sibling category to check against.
    await withAddon(db, event.id, {
      categories: [{ price: 100 }, { price: 100 }],
    }, async (addon) => {
      const [catA, catB] = addon.categoryIds;
      await withDiscount(db, {
        eventId: addon.addonId, categoryId: catA, type: 'percent', value: 20,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        const cats  = await customer.pages.checkoutProducts.readAddonCategoryData(addon.addonId);
        const cardA = cats.find(c => c.id === catA);
        const cardB = cats.find(c => c.id === catB);

        expect(cardA?.has_auto_discount).toBe(true);
        expect(cardA?.auto_discount_id).toBe(discount.discountId);
        expect(cardB?.has_auto_discount).toBe(false);
        expect(cardB?.auto_discount_id).toBeNull();

        feedback(`addon ${addon.addonId}: discount ${discount.discountId} scopes to catA (${catA}), catB (${catB}) untouched`);
        await customer.logout();
      });
    });
  });


  test(45, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Discount is scoped to the PARENT event, not the addon. The addon
      // should not pick it up on its card (helper.discount.php filters by
      // discount_event_id when set).
      await withDiscount(db, {
        eventId: event.id, type: 'percent', value: 25,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        // The tenant may already have universal-global discounts that show
        // up on every addon. What we're proving: the discount we created for
        // the PARENT event is not the one being applied to this addon.
        const appliedId = await customer.pages.checkoutProducts.readAddonAutoDiscountId(addon.addonId);
        expect(appliedId).not.toBe(discount.discountId);

        feedback(`addon ${addon.addonId}: parent-event discount ${discount.discountId} did not leak (applied=${appliedId})`);
        await customer.logout();
      });
    });
  });


  test(46, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Global discount (no discount_event_id) linked to the addon via
      // discountlink. Should apply just like a directly-scoped discount.
      await withDiscount(db, {
        eventId: null, type: 'percent', value: 30,
        linkedEventIds: [addon.addonId],
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(true);
        const { current, original } = await customer.pages.checkoutProducts.readAddonCardPrice(addon.addonId);
        expect(currencyToNumber(current)).toBeCloseTo(70, 2);
        expect(currencyToNumber(original!)).toBeCloseTo(100, 2);

        feedback(`addon ${addon.addonId}: linked global discount ${discount.discountId} → ${current} from ${original}`);
        await customer.logout();
      });
    });
  });


  test(47, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // POS-only discount — must not surface on the web addons page.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 40, active: 'pos',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        // Same pattern as 45: prove our pos-only discount is not the one
        // applied (tenant may have universal-global discounts unrelated to
        // this test).
        const appliedId = await customer.pages.checkoutProducts.readAddonAutoDiscountId(addon.addonId);
        expect(appliedId).not.toBe(discount.discountId);

        feedback(`addon ${addon.addonId}: pos-only discount ${discount.discountId} hidden from web (applied=${appliedId})`);
        await customer.logout();
      });
    });
  });


  test(48, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Fixed discount larger than price — result must floor at 0, never
      // negative. model.discount.php apply_to() semantics.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'fixe', value: 250,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        expect(await customer.pages.checkoutProducts.hasAddonAutoDiscount(addon.addonId)).toBe(true);
        const { current, original } = await customer.pages.checkoutProducts.readAddonCardPrice(addon.addonId);
        expect(currencyToNumber(current)).toBeCloseTo(0, 2);
        expect(currencyToNumber(original!)).toBeCloseTo(100, 2);

        feedback(`addon ${addon.addonId}: over-price fixed discount ${discount.discountId} floors at 0`);
        await customer.logout();
      });
    });
  });


  test(49, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'fixe', value: 30, promoCode: 'ASHTWIN-FIXE',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(1);
        expect(seats[0].promoId).toBe(discount.promoId);

        feedback(`addon ${addon.addonId}: promo ${discount.promoCode} (fixe -30) → seat ${seats[0].seatId} promo_id=${seats[0].promoId}`);
        await customer.logout();
      });
    });
  });


  test(50, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 25, promoCode: 'ASHTWIN-PCT',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(1);
        expect(seats[0].promoId).toBe(discount.promoId);

        feedback(`addon ${addon.addonId}: promo ${discount.promoCode} (percent 25) → seat ${seats[0].seatId} promo_id=${seats[0].promoId}`);
        await customer.logout();
      });
    });
  });


  test(51, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'real', value: 40, promoCode: 'ASHTWIN-REAL',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(1);
        expect(seats[0].promoId).toBe(discount.promoId);

        feedback(`addon ${addon.addonId}: promo ${discount.promoCode} (real=40) → seat ${seats[0].seatId} promo_id=${seats[0].promoId}`);
        await customer.logout();
      });
    });
  });


  test(52, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Real valid discount exists on the addon, but the code we submit is
      // nonexistent — the server should reject and add nothing.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-VALID',
      }, async (_valid) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: 'THIS-CODE-DOESNT-EXIST' },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(0);

        feedback(`addon ${addon.addonId}: bogus promo code rejected, no seat reserved`);
        await customer.pages.checkoutProducts.closeAddonModal();
        await customer.logout();
      });
    });
  });


  test(53, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      // No promo code at all — a plain add. Should succeed as a no-discount add.
      await customer.pages.checkoutProducts.addAddonViaModal(
        addon.addonId, addon.categoryIds[0], 1,
      );

      const seats = await db.addonSeatsInCart(addon.addonId, event.id);
      expect(seats.length).toBe(1);
      expect(seats[0].promoId).toBeNull();

      feedback(`addon ${addon.addonId}: no promo → seat ${seats[0].seatId} added without promo_id`);
      await customer.logout();
    });
  });


  test(54, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });
    
    await withAddon(db, event.id, {
      name: `ash-twin-addon-owner-${Date.now()}`,
      categories: [{ price: 100 }],
    }, async (owner) => {
      await withDiscount(db, {
        eventId: owner.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-SCOPED',
      }, async (discount) => {
        await withAddon(db, event.id, {
          name: `ash-twin-addon-target-${Date.now()}`,
          categories: [{ price: 100 }],
        }, async (target) => {
          await customer.login(creds);
          await customer.openEvent(event);
          await customer.pages.event.pickCategory(parentCat.id);
          await customer.pages.event.setQuantity(parentCat.id, 1);
          await customer.pages.event.acceptTerms();
          await customer.pages.event.addToCart(parentCat.id);
          await customer.pages.event.proceedToCheckout();

          await customer.pages.checkoutProducts.addAddonViaModal(
            target.addonId, target.categoryIds[0], 1,
            { promoCode: discount.promoCode! },
          );

          const seats = await db.addonSeatsInCart(target.addonId, event.id);
          expect(seats.length).toBe(0);

          feedback(`target addon ${target.addonId}: promo ${discount.promoCode} (scoped to ${owner.addonId}) rejected`);
          await customer.pages.checkoutProducts.closeAddonModal();
          await customer.logout();
        });
      });
    });
  });


  test(55, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // Promo counter already at its cap — plugin should reject on the used
      // >= max check (plugin.promocodes.php:706).
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-USEDUP',
        promoMax: 5, promoUsed: 5,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(0);

        feedback(`addon ${addon.addonId}: exhausted promo (${discount.promoCode}, used=5/5) rejected`);
        await customer.pages.checkoutProducts.closeAddonModal();
        await customer.logout();
      });
    });
  });


  test(56, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // min_tickets=3 — user tries to add just 1 with the promo → reject.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-MIN3',
        minTickets: 3,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(0);

        feedback(`addon ${addon.addonId}: min_tickets=3 rejected qty=1 with promo ${discount.promoCode}`);
        await customer.pages.checkoutProducts.closeAddonModal();
        await customer.logout();
      });
    });
  });


  test(57, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // max_tickets=2 — user tries to add 5 with the promo → reject.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-MAX2',
        maxTickets: 2,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 5,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(0);

        feedback(`addon ${addon.addonId}: max_tickets=2 rejected qty=5 with promo ${discount.promoCode}`);
        await customer.pages.checkoutProducts.closeAddonModal();
        await customer.logout();
      });
    });
  });


  test(58, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      // multiple_of=3 — qty=2 not a multiple → reject.
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 20, promoCode: 'ASHTWIN-MULT3',
        multipleOf: 3,
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 2,
          { promoCode: discount.promoCode! },
        );

        const seats = await db.addonSeatsInCart(addon.addonId, event.id);
        expect(seats.length).toBe(0);

        feedback(`addon ${addon.addonId}: multiple_of=3 rejected qty=2 with promo ${discount.promoCode}`);
        await customer.pages.checkoutProducts.closeAddonModal();
        await customer.logout();
      });
    });
  });


  test(59, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 25, promoCode: 'ASHTWIN-KEEP',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );
        await customer.pages.checkoutProducts.continue();

        const unitPrice = await customer.pages.checkout.readAddonLineUnitPrice(event.id, addon.name);
        expect(currencyToNumber(unitPrice)).toBeCloseTo(75, 2);

        feedback(`addon ${addon.addonId}: promo ${discount.promoCode} survives to preview line at ${unitPrice}`);
        await customer.logout();
      });
    });
  });


  test(60, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(180_000);
    const creds     = requireTestCustomer(tenant);
    const event     = await resolver.event({ ...events.normal, hasHandling: registeredPaymentKeys() });
    const parentCat = await resolver.category({
      eventId: event.id, numbering: 'none', webPublished: true, soldout: false,
    });

    await withAddon(db, event.id, {
      categories: [{ price: 100 }],
    }, async (addon) => {
      await withDiscount(db, {
        eventId: addon.addonId, type: 'percent', value: 30, promoCode: 'ASHTWIN-COMMIT',
      }, async (discount) => {
        await customer.login(creds);
        await customer.openEvent(event);
        await customer.pages.event.pickCategory(parentCat.id);
        await customer.pages.event.setQuantity(parentCat.id, 1);
        await customer.pages.event.acceptTerms();
        await customer.pages.event.addToCart(parentCat.id);
        await customer.pages.event.proceedToCheckout();

        await customer.pages.checkoutProducts.addAddonViaModal(
          addon.addonId, addon.categoryIds[0], 1,
          { promoCode: discount.promoCode! },
        );
        await customer.pages.checkoutProducts.continue();

        await customer.payWithAny();
        const order = await customer.pages.confirmation.readOrder();
        expect(order.status).toBe('paid');

        const seats = await db.paidAddonSeats(addon.addonId, event.id);
        expect(seats.length).toBe(1);
        expect(seats[0].discountId).toBe(discount.discountId);
        expect(seats[0].price).toBeCloseTo(70, 2);

        feedback(`addon ${addon.addonId}: order ${order.orderRef} committed with discount ${discount.discountId} on seat ${seats[0].seatId} @ ${seats[0].price}`);
      });
    });
  });


});
