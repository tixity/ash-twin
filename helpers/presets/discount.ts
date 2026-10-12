import type { CreateDiscountOpts } from '../../factories/discount';

export const discounts = {

  /** A plain web-side percent discount with no validity bounds. */
  normal: {
    type:   'percent',
    value:  10,
    active: 'www',
  } satisfies Partial<CreateDiscountOpts>,

} as const;
