import type { DbClient } from '../db_client';
import type { Category, CategoryFactoryInput } from '../../types/category';
import { nonce } from './nonce';

//  Default category configuration
const DEFAULT_PRICE = 100;
const DEFAULT_SIZE  = 100;

export class CategoryFactory {
  constructor(private db: DbClient) {}

  async build(eventId: number, input: CategoryFactoryInput): Promise<Category> {
    const numbering = input.numbering ?? 'none';
    if (numbering !== 'none') {
      throw new Error(
        `CategoryFactory v1 builds GA categories only (numbering: 'none'). ` +
        `Requested numbering: '${numbering}' — seated categories require a seeded place map.`,
      );
    }

    const name  = input.name  ?? `ash-twin-category-${nonce()}`;
    const price = input.price ?? DEFAULT_PRICE;
    const size  = input.size  ?? DEFAULT_SIZE;
    const free  = input.soldout === true ? 0 : size;
    const mode  = input.mode ?? 'ticket';

    const id = await this.db.insert(
      `INSERT INTO category (
        category_event_id, category_name, category_mode,
        category_price, category_numbering, category_size, category_free,
        category_web, category_pos, category_b2b
      ) VALUES (?, ?, ?, ?, 'none', ?, ?, ?, ?, ?)`,
      [
        eventId, name, mode,
        price, size, free,
        input.webPublished === false ? 0 : 1,
        input.posPublished === false ? 0 : 1,
        input.b2bPublished === true  ? 1 : 0,
      ],
    );

    return {
      id,
      eventId,
      name,
      price,
      size,
      free,
      numbering: 'none',
      isSeated: false,
      mode,
      webStatus: input.webPublished === false ? 0 : 1,
      posStatus: input.posPublished === false ? 0 : 1,
      b2bStatus: input.b2bPublished === true  ? 1 : 0,
    };
  }
}
