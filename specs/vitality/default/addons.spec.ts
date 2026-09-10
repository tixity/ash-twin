import { test, expect } from '../../../helpers/test';
import { events } from '../../../helpers/presets/event';
import { requireTestCustomer } from '../../../helpers/tenant';
import { withAddon } from '../../../factories/addon';

/**
 * Default-theme addon vitality specs. Tests here rely on default-only DOM
 * affordances that capetown's product_card_modal.tpl doesn't emit — sold-out
 * markers on the addon card being the current example.
 */

test.describe('addon visibility gates (default only)', () => {

  test.describe.configure({ mode: 'serial' });


  test(30, 'vitality', async ({ customer, tenant, db, resolver, feedback }) => {
    test.setTimeout(120_000);
    const creds = requireTestCustomer(tenant);
    const event = await resolver.event(events.normal);
    const parentCat = await resolver.category({
      eventId:      event.id,
      numbering:    'none',
      webPublished: true,
      soldout:      false,
    });

    await withAddon(db, event.id, { soldout: true }, async (addon) => {
      await customer.login(creds);
      await customer.openEvent(event);
      await customer.pages.event.pickCategory(parentCat.id);
      await customer.pages.event.setQuantity(parentCat.id, 1);
      await customer.pages.event.acceptTerms();
      await customer.pages.event.addToCart(parentCat.id);
      await customer.pages.event.proceedToCheckout();

      expect(await customer.pages.checkoutProducts.isAddonSoldOut(addon.addonId, addon.name)).toBe(true);

      feedback(`addon ${addon.addonId} rendered as sold-out`);
      await customer.logout();
    });
  });

});
