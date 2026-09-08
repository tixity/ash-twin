import type { DbClient } from '../helpers/db-client';

/**
 * Direct-DB factory for discount fixtures. Creates a `discount` row and, for
 * multi-event / global discounts, one `discountlink` row per linked event.
 */

export type DiscountType = 'fixe' | 'real' | 'percent';
export type DiscountActive = 'www' | 'pos' | 'yes';

export interface CreateDiscountOpts {
  name?:            string;
  type?:            DiscountType;
  value?:           number;
  eventId?:         number | null;
  categoryId?:      number | null;
  active?:          DiscountActive;
  promoCode?:       string | null;
  /** promocodes-plugin per-code cap. 0 = unlimited. Defaults to 1000. */
  promoMax?:        number;
  /** promocodes-plugin per-user cap. 0 = unlimited. Defaults to 0. */
  promoMaxUser?:    number;
  /** Force the promocode counter to N used already (for exhausted-code tests). */
  promoUsed?:       number;
  minTickets?:      number;
  maxTickets?:      number;
  multipleOf?:      number;
  country?:         string | null;
  linkedEventIds?:  number[];
}

export interface CreatedDiscount {
  discountId:       number;
  linkedEventIds:   number[];
  name:             string;
  isPromo:          boolean;
  promoCode:        string | null;
  promoId:          number | null;
}

const DEFAULTS = {
  type:       'percent' as DiscountType,
  value:      10,
  active:     'www'     as DiscountActive,
  minTickets: 0,
  maxTickets: 0,
  multipleOf: 0,
};

export async function createDiscount(
  db:   DbClient,
  opts: CreateDiscountOpts = {},
): Promise<CreatedDiscount> {
  const name       = opts.name       ?? `ash-twin-discount-${Date.now()}`;
  const type       = opts.type       ?? DEFAULTS.type;
  const value      = opts.value      ?? DEFAULTS.value;
  const active     = opts.active     ?? DEFAULTS.active;
  const minTickets = opts.minTickets ?? DEFAULTS.minTickets;
  const maxTickets = opts.maxTickets ?? DEFAULTS.maxTickets;
  const multipleOf = opts.multipleOf ?? DEFAULTS.multipleOf;
  const promoCode  = opts.promoCode  ?? null;
  const promoType  = promoCode ? 'fix' : 'none';

  const discountId = await db.insert(
    `INSERT INTO discount
       (discount_event_id, discount_category_id, discount_name, discount_type,
        discount_value, discount_promo, discount_active, discount_country,
        discount_promo_type, discount_min_tickets, discount_max_tickets,
        discount_multiple_of)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.eventId    ?? null,
      opts.categoryId ?? null,
      name,
      type,
      value,
      promoCode ?? '',
      active,
      opts.country ?? null,
      promoType,
      minTickets,
      maxTickets,
      multipleOf,
    ],
  );

  const linkedEventIds = opts.linkedEventIds ?? [];
  for (const eventId of linkedEventIds) {
    await db.insert(
      `INSERT INTO discountlink (discountlink_discount_id, discountlink_event_id)
       VALUES (?, ?)`,
      [discountId, eventId],
    );
  }

  // Tenants with the promocodes plugin (all current active tenants) require a
  // matching `promocode` row — the plugin's updatePromoCode hook queries this
  // table and returns false without it, even when `discount.discount_promo`
  // holds the same value. Legacy tenants without the plugin still validate
  // through the fallback `discount.discount_promo` path, so writing to both
  // works everywhere.
  let promoId: number | null = null;
  if (promoCode) {
    promoId = await db.insert(
      `INSERT INTO promocode (promo_discount_id, promo_value, promo_max, promo_max_user, promo_used)
       VALUES (?, ?, ?, ?, ?)`,
      [
        discountId,
        promoCode,
        opts.promoMax     ?? 1000,
        opts.promoMaxUser ?? 0,
        opts.promoUsed    ?? 0,
      ],
    );
  }

  return {
    discountId,
    linkedEventIds,
    name,
    isPromo:   !!promoCode,
    promoCode,
    promoId,
  };
}

export async function deleteDiscount(db: DbClient, discountId: number): Promise<void> {
  await db.execute('DELETE FROM promocode    WHERE promo_discount_id       = ?', [discountId]);
  await db.execute('DELETE FROM discountlink WHERE discountlink_discount_id = ?', [discountId]);
  await db.execute('DELETE FROM discount     WHERE discount_id              = ?', [discountId]);
}

export async function withDiscount<T>(
  db:   DbClient,
  opts: CreateDiscountOpts,
  fn:   (discount: CreatedDiscount) => Promise<T>,
): Promise<T> {
  const discount = await createDiscount(db, opts);
  try {
    return await fn(discount);
  } finally {
    await deleteDiscount(db, discount.discountId);
  }
}
