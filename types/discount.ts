export type DiscountValidityState = 'active' | 'expired' | 'pending';

export interface DiscountCriteria {
  eventId?:    number | null;
  categoryId?: number | null;
  state?:      DiscountValidityState;
}

export interface Discount {
  id:         number;
  name:       string;
  eventId:    number | null;
  categoryId: number | null;
  type:       string;
  value:      number;
  active:     string;
  promo:      string | null;
  begin:      string | null;
  end:        string | null;
}
