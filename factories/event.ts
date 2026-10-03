import type { DbClient } from '../helpers/db_client';
import type { Event, EventFactoryInput, SubFactoryInput } from '../types/event';
import type { Category, CategoryFactoryInput } from '../types/category';
import { CategoryFactory } from './category';
import { nonce } from './nonce';

const DEFAULT_TIME = '20:00:00';
const DEFAULT_TYPE = 'music';
const DAYS_AHEAD   = 30;

type Mode = 'unique' | 'main' | 'sub';

export class EventFactory {
  private categoryFactory: CategoryFactory;

  constructor(private db: DbClient) {
    this.categoryFactory = new CategoryFactory(db);
  }

  async build(input: EventFactoryInput): Promise<{ event: Event; categories: Category[] }> {
    this.refuseUnsupported(input);

    const mode = resolveMode(input.rep);
    if (mode === 'unique') return this.buildUnique(input);
    return this.buildMultiday(input, mode);
  }

  private async buildUnique(input: EventFactoryInput): Promise<{ event: Event; categories: Category[] }> {
    const name  = input.name ?? `ash-twin-event-${nonce()}`;
    const date  = input.date ?? futureDate(DAYS_AHEAD);
    const time  = input.time ?? DEFAULT_TIME;
    const type  = input.type ?? DEFAULT_TYPE;
    const model = input.model ?? 'event';

    const catSpecs = input.categories ?? [{ numbering: 'none' }];
    const { total, free } = totals(catSpecs);

    const eventId = await this.insertEvent({
      name, type, model, rep: 'main,sub',
      status:  input.status ?? 'pub',
      webshop: input.webshop === false ? 0 : 1,
      date, time,
      total, free,
      mainId: null,
      flags:  flagsFrom(input),
    });

    const categories = await this.insertCategories(eventId, catSpecs);

    return {
      event: {
        id: eventId, title: name, type, status: input.status ?? 'pub',
        date, time, rep: 'unique', model, mainId: null, capacity: total,
      },
      categories,
    };
  }

  private async buildMultiday(input: EventFactoryInput, returnWhich: 'main' | 'sub'): Promise<{ event: Event; categories: Category[] }> {
    const type   = input.type ?? DEFAULT_TYPE;
    const model  = input.model ?? 'event';
    const status = input.status ?? 'pub';
    const webshopFlag = input.webshop === false ? 0 : 1;

    const subSpecs = (input.subs && input.subs.length > 0) ? input.subs : [{}];
    const catSpecs = input.categories ?? [{ numbering: 'none' }];
    const perSub   = totals(catSpecs);
    const mainTotal = perSub.total * subSpecs.length;
    const mainFree  = perSub.free  * subSpecs.length;

    const mainName = input.name ?? `ash-twin-event-main-${nonce()}`;
    const mainId = await this.insertEvent({
      name: mainName, type, model, rep: 'main',
      status, webshop: webshopFlag,
      date: null, time: null,
      total: mainTotal, free: mainFree,
      mainId: null,
      flags: flagsFrom(input),
    });

    const builtSubs: Array<{ id: number; name: string; date: string; time: string; categories: Category[] }> = [];
    for (let i = 0; i < subSpecs.length; i++) {
      const spec     = subSpecs[i]!;
      const subName  = spec.name ?? `ash-twin-event-sub-${nonce()}`;
      const subDate  = spec.date ?? futureDate(DAYS_AHEAD + i);
      const subTime  = spec.time ?? input.time ?? DEFAULT_TIME;
      const subId    = await this.insertEvent({
        name: subName, type, model, rep: 'sub',
        status, webshop: webshopFlag,
        date: subDate, time: subTime,
        total: perSub.total, free: perSub.free,
        mainId,
        flags: flagsFrom(input),
      });
      const cats = await this.insertCategories(subId, catSpecs);
      builtSubs.push({ id: subId, name: subName, date: subDate, time: subTime, categories: cats });
    }

    if (returnWhich === 'main') {
      return {
        event: {
          id: mainId, title: mainName, type, status,
          date: null, time: null,
          rep: 'main', model, mainId: null, capacity: mainTotal,
        },
        categories: [],
      };
    }

    const first = builtSubs[0]!;
    return {
      event: {
        id: first.id, title: first.name, type, status,
        date: first.date, time: first.time,
        rep: 'sub', model, mainId, capacity: perSub.total,
      },
      categories: first.categories,
    };
  }

  private async insertEvent(args: {
    name: string; type: string; model: string; rep: string;
    status: string; webshop: number;
    date: string | null; time: string | null;
    total: number; free: number;
    mainId: number | null;
    flags: { presale: number; priv: number; login: number; nid: number };
  }): Promise<number> {
    return await this.db.insert(
      `INSERT INTO event (
        event_name, event_type, event_model, event_rep,
        event_status, event_webshop, event_source,
        event_date, event_time,
        event_total, event_free,
        event_presales, event_is_private, event_requires_login, event_nationalid,
        event_main_id
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.name, args.type, args.model, args.rep,
        args.status, args.webshop,
        args.date, args.time,
        args.total, args.free,
        args.flags.presale, args.flags.priv, args.flags.login, args.flags.nid,
        args.mainId,
      ],
    );
  }

  private async insertCategories(eventId: number, specs: CategoryFactoryInput[]): Promise<Category[]> {
    const out: Category[] = [];
    for (const spec of specs) out.push(await this.categoryFactory.build(eventId, spec));
    return out;
  }

  private refuseUnsupported(input: EventFactoryInput): void {
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

function totals(specs: CategoryFactoryInput[]): { total: number; free: number } {
  let total = 0, free = 0;
  for (const spec of specs) {
    const size = spec.size ?? 100;
    total += size;
    free  += spec.soldout === true ? 0 : size;
  }
  return { total, free };
}

function flagsFrom(input: EventFactoryInput): { presale: number; priv: number; login: number; nid: number } {
  return {
    presale: input.isPresale          === true ? 1 : 0,
    priv:    input.isPrivate          === true ? 1 : 0,
    login:   input.requiresLogin      === true ? 1 : 0,
    nid:     input.requiresNationalId === true ? 1 : 0,
  };
}

function resolveMode(rep: EventFactoryInput['rep']): Mode {
  if (rep === 'main') return 'main';
  if (rep === 'sub')  return 'sub';
  return 'unique';
}
