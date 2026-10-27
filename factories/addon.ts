import type { DbClient } from '../helpers/db_client';
import type { AddonCriteria } from '../types/addon';
import type { CategoryCriteria, CategoryNumbering } from '../types/category';
import { nonce } from './nonce';

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
 * Cleanup order matters: addonlink → seat → category → event (children before
 * parent). `withAddon(...)` enforces that; standalone callers rely on the
 * `ash-twin*` prefix sweep.
 */

export interface CreateAddonCategoryOpts {
  name?:         string;
  price?:        number;
  size?:         number;
  free?:         number;
  numbering?:    CategoryNumbering;
  mode?:         string;
  soldout?:      boolean;
  webPublished?: boolean;
  posPublished?: boolean;
  b2bPublished?: boolean;
  min?:          number;
  max?:          number;
  multipleOf?:   number;
}

export interface CreateAddonOpts {
  name?:             string;
  status?:           'pub' | 'unpub' | 'nosal';
  webshop?:          boolean;
  soldout?:          boolean;
  showOnCheckout?:   boolean;
  stockShared?:      boolean;
  currentPrice?:     number;
  orderLimit?:       number;
  parentCategoryId?: number;
  categories?:       CreateAddonCategoryOpts[];
}

export interface CreatedAddon {
  addonId:     number;
  categoryIds: number[];
  addonLinkId: number;
  name:        string;
}

/** Full criteria input the resolver maps directly into addon-factory shape. */
export interface AddonFactoryInput extends AddonCriteria, CreateAddonOpts {}

const DEFAULT_CATEGORY: Required<CreateAddonCategoryOpts> = {
  name:         'Default',
  price:        100,
  size:         20,
  free:         20,
  numbering:    'none',
  mode:         '',
  soldout:      false,
  webPublished: true,
  posPublished: true,
  b2bPublished: false,
  min:          0,
  max:          0,
  multipleOf:   0,
};

async function createAddon(
  db:            DbClient,
  parentEventId: number,
  opts:          CreateAddonOpts = {},
): Promise<CreatedAddon> {
  const name           = opts.name           ?? `ash-twin-addon-${nonce()}`;
  const status         = opts.status         ?? 'pub';
  const webshop        = opts.webshop        === false ? 0 : 1;
  const soldout        = opts.soldout        ? 1 : 0;
  const showOnCheckout = opts.showOnCheckout === false ? 0 : 1;
  const stockShared    = opts.stockShared    ? 1 : 0;
  const currentPrice   = opts.currentPrice   ?? 0;
  const orderLimit     = opts.orderLimit     ?? 0;
  // Template's sold-out branch checks `$item.free == 0` (which maps to
  // event_free), not just event_soldout — so zero the free count when the
  // caller asks for a sold-out addon, matches Event::isSoldOut()'s truth.
  const free           = opts.soldout        ? 0 : 10_000;
  const cats           = (opts.categories && opts.categories.length > 0)
    ? opts.categories
    : [{}];

  // 1. Insert the addon (an `event` row).
  const addonId = await db.insert(
    `INSERT INTO event
       (event_name, event_status, event_rep, event_model, event_addon,
        event_webshop, event_soldout, event_total, event_free,
        event_show_on_checkout, event_stock_shared,
        event_current_price, event_order_limit,
        event_source, event_created, event_publish_date)
     VALUES (?, ?, 'main,sub', 'product', 1, ?, ?, 10000, ?, ?, ?, ?, ?, '', NOW(), NOW())`,
    [name, status, webshop, soldout, free, showOnCheckout, stockShared, currentPrice, orderLimit],
  );

  // 2. Insert one category per opts entry.
  const categoryIds: number[] = [];
  for (const c of cats) {
    const merged = { ...DEFAULT_CATEGORY, ...c };
    // Honor `soldout` on category: free = 0 regardless of size.
    const catFree = merged.soldout ? 0 : (c.free ?? merged.size);
    const catId   = await db.insert(
      `INSERT INTO category
         (category_event_id, category_name, category_price, category_numbering, category_mode,
          category_color, category_size, category_free,
          category_web, category_pos, category_b2b,
          category_min, category_max, category_multiple_of, category_sort)
       VALUES (?, ?, ?, ?, ?, '#cccccc', ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        addonId,
        merged.name,
        merged.price,
        merged.numbering,
        merged.mode,
        merged.size,
        catFree,
        merged.webPublished ? 1 : 0,
        merged.posPublished ? 1 : 0,
        merged.b2bPublished ? 1 : 0,
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
    if (merged.size > 0 && !merged.soldout && !opts.soldout) {
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

async function deleteAddon(db: DbClient, addonId: number): Promise<void> {
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

/**
 * Class wrapper around `createAddon` so the resolver can hold a reusable
 * builder, matching the shape of `EventFactory` / `CategoryFactory`. The
 * resolver uses `build()` on criteria miss; direct `createAddon` / `withAddon`
 * calls remain the right choice for test-scoped fixtures that want cleanup.
 */
export class AddonFactory {
  constructor(private db: DbClient) {}

  async build(parentEventId: number, input: AddonFactoryInput): Promise<CreatedAddon> {
    const opts = criteriaToOpts(input);
    return createAddon(this.db, parentEventId, opts);
  }
}

/**
 * Translate an `AddonCriteria` (with any `CreateAddonOpts` overrides merged
 * in) into the opts shape `createAddon` consumes. Caller-supplied opts win
 * over values derived from criteria; this keeps the resolver's "find or
 * build" story deterministic across repeated runs.
 */
function criteriaToOpts(input: AddonFactoryInput): CreateAddonOpts {
  const explicit: CreateAddonOpts = {
    name:             input.name,
    status:           input.status,
    webshop:          input.webshop,
    soldout:          input.soldout,
    showOnCheckout:   input.showOnCheckout,
    stockShared:      input.stockShared,
    currentPrice:     input.currentPrice,
    orderLimit:       input.orderLimit,
    parentCategoryId: input.parentCategoryId ?? input.categoryId,
    categories:       input.categories,
  };

  // If the criteria names a category shape and the caller didn't already
  // supply `categories`, materialise one category from `hasCategory`.
  if (!explicit.categories && input.hasCategory) {
    explicit.categories = [categoryCriteriaToOpts(input.hasCategory)];
  }

  // Price-range criteria without an explicit `currentPrice`: pick a value
  // inside the window so the resolver's follow-up SELECT finds this row.
  if (explicit.currentPrice === undefined) {
    if (input.minPrice !== undefined || input.maxPrice !== undefined) {
      const lo = input.minPrice ?? 0;
      const hi = input.maxPrice ?? Math.max(lo, 100);
      explicit.currentPrice = Math.floor((lo + hi) / 2);
    }
  }

  return explicit;
}

function categoryCriteriaToOpts(c: CategoryCriteria): CreateAddonCategoryOpts {
  const opts: CreateAddonCategoryOpts = {};
  if (c.name          !== undefined) opts.name         = c.name;
  if (c.numbering     !== undefined && c.numbering !== 'seated') opts.numbering = c.numbering;
  if (c.mode          !== undefined) opts.mode         = c.mode;
  if (c.soldout       !== undefined) opts.soldout      = c.soldout;
  if (c.webPublished  !== undefined) opts.webPublished = c.webPublished;
  if (c.posPublished  !== undefined) opts.posPublished = c.posPublished;
  if (c.b2bPublished  !== undefined) opts.b2bPublished = c.b2bPublished;
  if (c.minPrice !== undefined || c.maxPrice !== undefined) {
    const lo = c.minPrice ?? 0;
    const hi = c.maxPrice ?? Math.max(lo, 100);
    opts.price = Math.floor((lo + hi) / 2);
  }
  return opts;
}
