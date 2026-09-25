import type { CategoryCriteria } from './category';
import type { AddonCriteria } from './addon';
import type { PaymentKey } from './handling';

export type EventRep = 'unique' | 'main' | 'sub';

export type EventModel = 'event' | 'seasonpass' | 'voucher' | 'product' | 'ebook';

export interface Event {
  id: number;
  title: string;
  type?: string;                        // event_type — 'music' / 'sports' / 'comedy' / 'festival' / ...
  status?: 'pub' | 'unpub' | 'nosal' | 'trash';
  date?: string | null;                 
  time?: string | null;                 
  rep?: EventRep;
  model?: EventModel;
  mainId?: number | null;               // populated for sub events only
  capacity?: number | null;
  data?: Record<string, unknown>;
}

  // Filter set for querying events.

export interface EventCriteria {
  // Core selection
  status?: 'pub' | 'unpub' | 'nosal' | 'trash';
  rep?:    EventRep | 'main-or-unique' | 'sub-or-unique';
  model?:  EventModel;
  source?: 'local' | (string & {});

  // Visibility flags
  webshop?:            boolean;   // event_webshop = 1
  inViewWindow?:       boolean;   // NOW() between event_view_begin and event_view_end
  isFuture?:           boolean;   // event_date >= CURDATE() (NULL date passes)
  parentViewable?:     boolean;   // for subs, parent main is pub + webshop + inside its view window
  isPresale?:          boolean;   // event_presales flag
  isPrivate?:          boolean;   // event_is_private flag
  requiresNationalId?: boolean;   // event_nationalid flag
  requiresLogin?:      boolean;   // event_requires_login flag
  hasExternalUrl?:     boolean;   // event_external_url is (not) set — a set URL redirects the CTA off-site and breaks web checkout tests

  hasCategory?: CategoryCriteria;

  hasAddons?:   AddonCriteria;   // event MUST have an addon matching this shape
  hasNoAddons?: AddonCriteria;   // event MUST NOT have any addon matching this shape

  hasHandling?: PaymentKey | PaymentKey[];
  
  shipmentIn?: string[];
}
