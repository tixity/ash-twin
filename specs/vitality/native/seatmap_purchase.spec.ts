import { test, expect } from '../../../helpers/test';
import { events } from '../../../helpers/presets/event';
import { requireTestCustomer } from '../../../helpers/tenant';
import { registeredPaymentKeys } from '../../../payments';

test(71, 'vitality', async ({ customer, resolver, tenant, db, feedback }) => {
  test.setTimeout(180_000);

  const creds    = requireTestCustomer(tenant);
  const event    = await resolver.event({ ...events.seated, hasHandling: registeredPaymentKeys() });
  const category = await resolver.category({
    eventId:      event.id,
    numbering:    'seated',
    webPublished: true,
    soldout:      false,
  });

  await customer.login(creds);

  const order = await customer.buySeatedTicket(event, category, 3, { payment: 'any' });

  expect(order.orderRef).toBeTruthy();
  expect(order.status).toBe('paid');

  const dbOrder = await db.orderById(order.orderRef);
  expect(dbOrder, `order ${order.orderRef} not found in DB`).not.toBeNull();
  expect(dbOrder?.paymentStatus).toBe('paid');
  expect(dbOrder?.status).toBe('ord');

  feedback(`event ${event.id} category ${category.id}: paid seated order ${order.orderRef}`);
});
