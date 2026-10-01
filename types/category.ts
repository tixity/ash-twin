/**
 * SquareMaze Category — a ticket tier belonging to an Event, scoped to a placemap.
 * Backing table: `category` (prefix `category_`), model class `PlaceMapCategory`.
 *
 * `numbering` distinguishes GA from seated variants:
 *   - 'none' → general admission (no assigned seats)
 *   - 'both' | 'rows' | 'seat' → seated (varying label formats)
 *
 * `isSeated` is a derived boolean the resolver computes from `numbering`.
 */

export type CategoryNumbering = 'none' | 'both' | 'rows' | 'seat';
export type CategoryMode      = 'ticket' | 'pass';
export type CategoryPubStatus = 0 | 1 | 2;  // unpublished | published | unavailable

export interface Category {
  id: number;
  eventId: number;

  name: string;
  price?: number;
  size?: number;                    // total capacity
  free?: number;                    // currently available

  numbering?: CategoryNumbering;
  isSeated?: boolean;               // derived: numbering !== 'none'
  mode?: CategoryMode;

  min?: number;                    
  max?: number;                    
  multipleOf?: number;              

  webStatus?: CategoryPubStatus;
  posStatus?: CategoryPubStatus;
  b2bStatus?: CategoryPubStatus;    // plugin.b2bapi only — see docstring above

  data?: Record<string, unknown>;
}

export interface CategoryCriteria {
  eventId?: number;
  name?: string;
  numbering?: CategoryNumbering | 'seated';
  soldout?: boolean;
  minPrice?: number;
  maxPrice?: number;
  mode?: CategoryMode;

  webPublished?: boolean;
  posPublished?: boolean;
  b2bPublished?: boolean;

}

export interface CategoryFactoryInput extends CategoryCriteria {
  size?:  number;   // GA only; factory throws when numbering !== 'none'
  price?: number;
  name?:  string;
}
