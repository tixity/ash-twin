import type { DbClient } from '../db_client';
import type { Event, EventFactoryInput, EventRep } from '../../types/event';
import type { Category } from '../../types/category';
import { CategoryFactory } from './category';
import { nonce } from './nonce';

//  Default event configuration
const DEFAULT_TIME = '20:00:00';
const DEFAULT_TYPE = 'music';
const DAYS_AHEAD   = 30;

export class EventFactory {
  private categoryFactory: CategoryFactory;

  constructor(private db: DbClient) {
    this.categoryFactory = new CategoryFactory(db);
  }

  async build(input: EventFactoryInput): Promise<{ event: Event; categories: Category[] }> {
    this.refuseUnsupported(input);

    const name  = input.name  ?? `ash-twin-event-${nonce()}`;
    const date  = input.date  ?? futureDate(DAYS_AHEAD);
    const time  = input.time  ?? DEFAULT_TIME;
    const type  = input.type  ?? DEFAULT_TYPE;
    const rep   = normalizeRepForInsert(input.rep);
    const model = input.model ?? 'event';

    const catSpecs = input.categories ?? [{ numbering: 'none' }];
    const sizes    = catSpecs.map(c => c.size ?? 100);
    const frees    = catSpecs.map((c, i) => c.soldout === true ? 0 : sizes[i]!);
    const total    = sizes.reduce((a, b) => a + b, 0);
    const free     = frees.reduce((a, b) => a + b, 0);

    const eventId = await this.db.insert(
      `INSERT INTO event (
        event_name, event_type, event_model, event_rep,
        event_status, event_webshop, event_source,
        event_date, event_time,
        event_total, event_free,
        event_presales, event_is_private, event_requires_login, event_nationalid,
        event_main_id
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        name, type, model, rep,
        input.status ?? 'pub',
        input.webshop === false ? 0 : 1,
        date, time,
        total, free,
        input.isPresale          === true ? 1 : 0,
        input.isPrivate          === true ? 1 : 0,
        input.requiresLogin      === true ? 1 : 0,
        input.requiresNationalId === true ? 1 : 0,
      ],
    );

    const categories: Category[] = [];
    for (const spec of catSpecs) {
      categories.push(await this.categoryFactory.build(eventId, spec));
    }

    const event: Event = {
      id: eventId,
      title: name,
      type,
      status: input.status ?? 'pub',
      date,
      time,
      rep: domainRep(rep),
      model,
      mainId: null,
      capacity: total,
    };

    return { event, categories };
  }

  private refuseUnsupported(input: EventFactoryInput): void {
    if (input.rep === 'sub') {
      throw new Error(`EventFactory v1 does not build sub events — requires an existing parent.`);
    }
    if (input.rep === 'main') {
      throw new Error(`EventFactory v1 does not build main events — a main with no subs is unviewable.`);
    }
    if (input.hasAddons) {
      throw new Error(`EventFactory v1 does not build addons; this criteria needs seeded data in the tenant.`);
    }
    if (input.hasHandling !== undefined) {
      throw new Error(`EventFactory v1 does not create handling links; event inherits the tenant's handling pool.`);
    }
  }
}

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizeRepForInsert(rep: EventFactoryInput['rep']): string {
  if (rep === 'main' || rep === 'sub') return rep;
  return 'main,sub';
}

function domainRep(dbRep: string): EventRep {
  if (dbRep === 'main,sub') return 'unique';
  if (dbRep === 'main')     return 'main';
  return 'sub';
}
