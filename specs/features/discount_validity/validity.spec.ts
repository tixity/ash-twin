import { test, expect } from '../../../helpers/test';
import { events } from '../../../helpers/presets/event';
import { requireTestCustomer } from '../../../helpers/tenant';


test.beforeAll(async ({ admin, db }) => {
  await db.overrideConfig('disable_config_cache', '1');
  await admin.clearCache();
});


test(72, 'features', async ({ customer, resolver, tenant, db, feedback }) => {
  const creds    = requireTestCustomer(tenant);
  const event    = await resolver.event(events.normal);
  const category = await resolver.category({ eventId: event.id, numbering: 'none', webPublished: true, soldout: false });
  const d        = await resolver.discount({ eventId: event.id, state: 'active' });

  await customer.login(creds);
  await customer.addToCart(event, category, 1);
  const applied = await db.cartSeatDiscountId(event.id, category.id);
  const ok = applied === d.id;

  feedback.report({
    ok,
    summary: 'ID 72 — a discount with no start/end dates should always be live, so adding a ticket to the cart should automatically apply it to the reserved seat',
    rows: [
      { label: 'event',    value: `#${event.id} "${event.title}"` },
      { label: 'category', value: `#${category.id} "${category.name}" (GA)` },
      { label: 'discount', value: `#${d.id} "${d.name}" (begin=${d.begin ?? '—'} end=${d.end ?? '—'})` },
      { label: 'seat',     value: `seat_discount_id = ${applied}` },
      { label: 'expected', value: d.id },
      { label: 'result',   value: ok ? 'match' : 'MISMATCH — SUT did not attach the discount to the reserved seat' },
    ],
  });
  expect(ok, 'see feedback above').toBe(true);
  await customer.logout().catch(() => {});
});


test(73, 'features', async ({ customer, resolver, tenant, db, feedback }) => {
  const creds    = requireTestCustomer(tenant);
  const event    = await resolver.event(events.normal);
  const category = await resolver.category({ eventId: event.id, numbering: 'none', webPublished: true, soldout: false });
  const d        = await resolver.discount({ eventId: event.id, state: 'expired' });

  await customer.login(creds);
  await customer.addToCart(event, category, 1);
  const applied = await db.cartSeatDiscountId(event.id, category.id);
  const ok = applied === null;

  feedback.report({
    ok,
    summary: 'ID 73 — a discount whose end date is in the past has expired; adding a ticket to the cart should NOT attach that discount to the reserved seat',
    rows: [
      { label: 'event',    value: `#${event.id} "${event.title}"` },
      { label: 'category', value: `#${category.id} "${category.name}" (GA)` },
      { label: 'discount', value: `#${d.id} "${d.name}" (ended ${d.end})` },
      { label: 'seat',     value: `seat_discount_id = ${applied}` },
      { label: 'expected', value: 'null (expired)' },
      { label: 'result',   value: ok ? 'match' : `MISMATCH — SUT applied expired discount ${applied}` },
    ],
  });
  expect(ok, 'see feedback above').toBe(true);
  await customer.logout().catch(() => {});
});


test(74, 'features', async ({ customer, resolver, tenant, db, feedback }) => {
  const creds    = requireTestCustomer(tenant);
  const event    = await resolver.event(events.normal);
  const category = await resolver.category({ eventId: event.id, numbering: 'none', webPublished: true, soldout: false });
  const d        = await resolver.discount({ eventId: event.id, state: 'pending' });

  await customer.login(creds);
  await customer.addToCart(event, category, 1);
  const applied = await db.cartSeatDiscountId(event.id, category.id);
  const ok = applied === null;

  feedback.report({
    ok,
    summary: 'ID 74 — a discount whose start date is still in the future has not kicked in yet; adding a ticket to the cart should NOT attach that discount to the reserved seat',
    rows: [
      { label: 'event',    value: `#${event.id} "${event.title}"` },
      { label: 'category', value: `#${category.id} "${category.name}" (GA)` },
      { label: 'discount', value: `#${d.id} "${d.name}" (begins ${d.begin})` },
      { label: 'seat',     value: `seat_discount_id = ${applied}` },
      { label: 'expected', value: 'null (not yet started)' },
      { label: 'result',   value: ok ? 'match' : `MISMATCH — SUT applied not-yet-valid discount ${applied}` },
    ],
  });
  expect(ok, 'see feedback above').toBe(true);
  await customer.logout().catch(() => {});
});
