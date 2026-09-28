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
  uuid:        string;
  label:       string;
  rowLabel:    string;
  categoryId:  string | number;
  sectionUuid: string | null;
  status:      number;
  type:        'row_seat' | 'table_seat';
}

export interface SeatFilter {
  categoryId?:  string | number;
  sectionUuid?: string;
  freeOnly?:    boolean;
}

export interface SectionSummary {
  uuid:          string;
  categoryId:    string | number;
  ga:            boolean;
  bestAvailable: boolean;
}

export interface SectionFilter {
  categoryId?: string | number;
}

export interface SeatQuery {
  uuid?:     string;
  rowLabel?: string;
  label?:    string;
}

export type SelectionStrategy =
  | { kind: 'seats';           uuids: string[] }
  | { kind: 'first-n';         categoryId: string | number; count: number; sectionUuid?: string }
  | { kind: 'section';         sectionUuid: string; count: number }
  | { kind: 'best-available';  sectionUuid: string; count: number };

export interface SeatMapDriver {
  waitReady():                                                                              Promise<void>;
  list(filter?: SeatFilter):                                                                Promise<SeatSummary[]>;
  listSections(filter?: SectionFilter):                                                     Promise<SectionSummary[]>;
  find(query: SeatQuery):                                                                   Promise<SeatSummary>;
  pick(uuids: string[]):                                                                    Promise<void>;
  pickFirstN(categoryId: string | number, count: number, sectionUuid?: string):             Promise<void>;
  pickInSection(sectionUuid: string, count: number):                                        Promise<void>;
  enterSection(sectionUuid: string):                                                        Promise<void>;
  pickByStrategy(strategy: SelectionStrategy):                                              Promise<void>;
  selection():                                                                              Promise<SeatSummary[]>;
  clearSelection():                                                                         Promise<void>;
}
