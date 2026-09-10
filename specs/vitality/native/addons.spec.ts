import { test, expect } from '../../../helpers/test';
import { events } from '../../../helpers/presets/event';
import { requireTestCustomer } from '../../../helpers/tenant';
import { withAddon } from '../../../factories/addon';


// Addon tests seed their own addon per-test via factories/addon.ts — no
// dependency on tenant-side pre-configured addons. Each test creates the
// exact shape it needs, drives the customer flow, asserts, and cleans up
// via withAddon's try/finally.

async function proceedToAddonsPage(resolver: import('../../../helpers/resolver').Resolver) {
  const event = await resolver.event(events.normal);
  const parentCat = await resolver.category({
    eventId:      event.id,
    numbering:    'none',
    webPublished: true,
    soldout:      false,
  });
  return { event, parentCat };
}


test.describe('addon visibility gates', () => {

  test.describe.configure({ mode: 'serial' });


  test(27, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, { webshop: false }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      expect(await customer.pages.checkoutProducts.hasAddon(addon.addonId, addon.name)).toBe(false);

      feedback(`addon ${addon.addonId} hidden when webshop=false`);
      await customer.logout();
    });
  });


  test(28, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, { status: 'unpub' }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      expect(await customer.pages.checkoutProducts.hasAddon(addon.addonId, addon.name)).toBe(false);

      feedback(`addon ${addon.addonId} hidden when status=unpub`);
      await customer.logout();
    });
  });


  test(29, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ webPublished: false }, { webPublished: false }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      expect(await customer.pages.checkoutProducts.hasAddon(addon.addonId, addon.name)).toBe(false);

      feedback(`addon ${addon.addonId} hidden when all categories are web-unpublished`);
      await customer.logout();
    });
  });


  // Id 30 ("addon renders sold-out when every category is out of stock") lives
  // in specs/vitality/default/addons.spec.ts — capetown's product_card_modal.tpl
  // has no sold-out branch, so the assertion is default-only.


  test(31, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 3 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      const min = await customer.pages.checkoutProducts.readAddonPickerAttr(addon.addonId, catId, 'data-min');
      expect(min).toBe('3');

      feedback(`addon ${addon.addonId} cat ${catId}: data-min=3`);
      await customer.logout();
    });
  });


  test(32, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ max: 5 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      const max = await customer.pages.checkoutProducts.readAddonPickerAttr(addon.addonId, catId, 'data-max');
      expect(max).toBe('5');

      feedback(`addon ${addon.addonId} cat ${catId}: data-max=5`);
      await customer.logout();
    });
  });

  test(33, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 0, max: 0, multipleOf: 0 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 3);
      const qty = await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId);
      expect(qty).toBe(3);

      feedback(`addon ${addon.addonId}: no constraints → qty=3 after 3 incs`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });


  test(34, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 5, max: 20 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 1);
      const qty = await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId);
      expect(qty).toBe(5);

      feedback(`addon ${addon.addonId}: min=5 → first inc jumps to 5`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });


  test(35, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 0, max: 3 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      // 6 clicks — should cap at max=3 (attempts past cap are blocked).
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 6);
      const qty = await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId);
      expect(qty).toBe(3);

      feedback(`addon ${addon.addonId}: max=3 → qty caps at 3 after 6 incs`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });


  test(36, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 0, max: 10, multipleOf: 2 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 2);
      const qty = await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId);
      expect(qty).toBe(4); // 0 → 2 → 4

      feedback(`addon ${addon.addonId}: multipleOf=2 → 2 incs = qty 4`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });


  test(37, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 3, max: 20, multipleOf: 2 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 1);
      expect(await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId)).toBe(3);
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 1);
      expect(await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId)).toBe(5);

      feedback(`addon ${addon.addonId}: min=3 multipleOf=2 → 0 → 3 → 5`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });


  test(38, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const { event, parentCat } = await proceedToAddonsPage(resolver);

    await withAddon(db, event.id, {
      categories: [{ min: 4, max: 4 }],
    }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      const catId = addon.categoryIds[0];
      await customer.pages.checkoutProducts.openAddonModal(addon.addonId);
      // First inc: max(min=4, 1) = 4. Second inc: 4 + 1 = 5 > max=4 → blocked, stays 4.
      await customer.pages.checkoutProducts.incAddon(addon.addonId, catId, 3);
      const qty = await customer.pages.checkoutProducts.getAddonQty(addon.addonId, catId);
      expect(qty).toBe(4);

      feedback(`addon ${addon.addonId}: min==max=4 → qty locks at 4`);
      await customer.pages.checkoutProducts.closeAddonModal();
      await customer.logout();
    });
  });

});
