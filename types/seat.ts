export interface SeatRef {
  row: string;
  number: number;
}

/** A row from the `seat` table shaped for addon-fixture assertions. */
export interface AddonSeatRow {
  seatId:     number;
  price:      number | null;
  discountId: number | null;
  promoId:    number | null;
  status:     string;
}
