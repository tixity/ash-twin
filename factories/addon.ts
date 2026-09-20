import type { DbClient } from '../helpers/db_client';

/**
 * Direct-DB factory for addon fixtures. Creates an addon (an `event` row with
 * `event_model = 'product'` and `event_addon = 1`), one or more `category`
 * rows for it, and an `addonlink` binding to a parent event.
 *
 * Bypasses squaremaze's PHP save hooks. That's fine for pure content addons —
 * no plugin currently needs to fire on addon-create. If a future test needs
 * hook side-effects (e.g. seat inventory init), escalate that fixture to an
 * admin HTTP POST instead.
 *
 * Cleanup order matters: addonlink → category → event (children before parent).
 */

export interface CreateAddonCategoryOpts {
  name?:         string;
  price?:        number;
  size?:         number;
  free?:         number;
  webPublished?: boolean;
  min?:          number;
  max?:          number;
  multipleOf?:   number;
}

export interface CreateAddonOpts {
  name?:             string;
  status?:           'pub' | 'unpub' | 'nosal';
  webshop?:          boolean;
  soldout?:          boolean;
  parentCategoryId?: number;
  categories?:       CreateAddonCategoryOpts[];
}

export interface CreatedAddon {
  addonId:     number;
  categoryIds: number[];
  addonLinkId: number;
  name:        string;
}

const DEFAULT_CATEGORY: Required<CreateAddonCategoryOpts> = {
  name:         'Default',
  price:        100,
  size:         20,
  free:         20,
  webPublished: true,
  min:          0,
  max:          0,
  multipleOf:   0,
};

export async function createAddon(
  db:            DbClient,
  parentEventId: number,
  opts:          CreateAddonOpts = {},
): Promise<CreatedAddon> {
  const name    = opts.name    ?? `ash-twin-addon-${Date.now()}`;
  const status  = opts.status  ?? 'pub';
  const webshop = opts.webshop === false ? 0 : 1;
  const soldout = opts.soldout ? 1 : 0;
  // Template's sold-out branch checks `$item.free == 0` (which maps to
  // event_free), not just event_soldout — so zero the free count when the
  // caller asks for a sold-out addon, matches Event::isSoldOut()'s truth.
  const free    = opts.soldout ? 0 : 10_000;
  const cats    = (opts.categories && opts.categories.length > 0)
    ? opts.categories
    : [{}];

  // 1. Insert the addon (an `event` row).
  const addonId = await db.insert(
    `INSERT INTO event
       (event_name, event_status, event_rep, event_model, event_addon,
        event_webshop, event_soldout, event_total, event_free, event_source,
        event_created, event_publish_date)
     VALUES (?, ?, 'main,sub', 'product', 1, ?, ?, 10000, ?, '', NOW(), NOW())`,
    [name, status, webshop, soldout, free],
  );

  // 2. Insert one category per opts entry.
  const categoryIds: number[] = [];
  for (const c of cats) {
    const merged = { ...DEFAULT_CATEGORY, ...c };
    const catId  = await db.insert(
      `INSERT INTO category
         (category_event_id, category_name, category_price, category_numbering,
          category_color, category_size, category_free, category_web, category_pos,
          category_min, category_max, category_multiple_of, category_sort)
       VALUES (?, ?, ?, 'none', '#cccccc', ?, ?, ?, 1, ?, ?, ?, 0)`,
      [
        addonId,
        merged.name,
        merged.price,
        merged.size,
        merged.free,
        merged.webPublished ? 1 : 0,
        merged.min,
        merged.max,
        merged.multipleOf,
      ],
    );
    categoryIds.push(catId);

    // 3. Seed `seat` rows so the reservation flow finds inventory. Seat::publish
    // fires per-unit in the admin path; we bypass that with a bulk insert
    // matching the minimum shape the reserveNoneNumbered() query expects
    // (event_id, category_id, status='free', seat_sid IS NULL).
    if (merged.size > 0 && !opts.soldout) {
      const rows = Array.from({ length: merged.size }, () => `(${addonId}, ${catId}, 'free')`).join(',');
      await db.execute(
        `INSERT INTO seat (seat_event_id, seat_category_id, seat_status) VALUES ${rows}`,
      );
    }
  }

  // 4. Link the addon to the parent event.
  const addonLinkId = await db.insert(
    `INSERT INTO addonlink (addonlink_addon_id, addonlink_event_id, addonlink_category_id)
     VALUES (?, ?, ?)`,
    [addonId, parentEventId, opts.parentCategoryId ?? null],
  );

  return { addonId, categoryIds, addonLinkId, name };
}

export async function deleteAddon(db: DbClient, addonId: number): Promise<void> {
  await db.execute('DELETE FROM addonlink WHERE addonlink_addon_id = ?', [addonId]);
  await db.execute('DELETE FROM seat      WHERE seat_event_id      = ?', [addonId]);
  await db.execute('DELETE FROM category  WHERE category_event_id  = ?', [addonId]);
  await db.execute('DELETE FROM event     WHERE event_id           = ?', [addonId]);
}

/**
 * Create an addon, run `fn` with it, delete it unconditionally afterwards.
 * Mirrors the try/finally pattern already used by `db.setEventField` callers.
 */
export async function withAddon<T>(
  db:            DbClient,
  parentEventId: number,
  opts:          CreateAddonOpts,
  fn:            (addon: CreatedAddon) => Promise<T>,
): Promise<T> {
  const addon = await createAddon(db, parentEventId, opts);
  try {
    return await fn(addon);
  } finally {
    await deleteAddon(db, addon.addonId);
  }
}
