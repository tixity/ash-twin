export interface SeatRef {
  row: string;
  number: number;
}

// A row from the `seat` table shaped for addon-fixture assertions.
export interface AddonSeatRow {
  seatId:     number;
  price:      number | null;
  discountId: number | null;
  promoId:    number | null;
  status:     string;
}

export interface SeatSummary {
  uuid:        string | number;
  label:       string;
  rowLabel:    string;
  categoryId:  string | number;
  sectionUuid: string | number | null;
  status:      number;
  type:        'row_seat' | 'table_seat';
}

export interface SeatFilter {
  categoryId?:  string | number;
  sectionUuid?: string | number;
  freeOnly?:    boolean;
}

export interface SectionSummary {
  uuid:          string | number;
  name:          string;
  categoryId:    string | number;
  ga:            boolean;
  bestAvailable: boolean;
}

export interface SectionFilter {
  categoryId?: string | number;
}

export interface SeatQuery {
  uuid?:     string | number;
  rowLabel?: string;
  label?:    string;
}

// Outcome of a pickSeats call. Tells the caller what the driver did inside
// the iframe so the host-page side can finalise the add-to-cart correctly.
export type PickResult =
  | { kind: 'seats';   uuids: Array<string | number>; sectionUuid: string | number | null }
  | { kind: 'section'; sectionUuid: string | number; count: number };

export interface SeatMapDriver {
  waitReady():                                                                              Promise<void>;
  pickSeats(categoryId: string | number, count: number):                                    Promise<PickResult>;
  list(filter?: SeatFilter):                                                                Promise<SeatSummary[]>;
  listSections(filter?: SectionFilter):                                                     Promise<SectionSummary[]>;
  find(query: SeatQuery):                                                                   Promise<SeatSummary>;
  pick(uuids: Array<string | number>):                                                      Promise<void>;
  enterSection(sectionUuid: string | number):                                               Promise<void>;
  selection():                                                                              Promise<SeatSummary[]>;
  clearSelection():                                                                         Promise<void>;
}
