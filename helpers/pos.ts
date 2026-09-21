import type { DbClient } from './db_client';

// A POS office is a `user` row whose type marks it as a sales point.
export interface PosOffice {
  id:   number;
  name: string;
}


// Find any existing POS office on the tenant.
export async function findAnyPosOffice(db: DbClient): Promise<PosOffice | null> {
  const row = await db.one<{ user_id: number; user_lastname: string } & import('mysql2').RowDataPacket>(
    `SELECT user_id, user_lastname
     FROM \`user\`
     WHERE user_type IN ('store', 'virtual', 'venue')
     ORDER BY user_id
     LIMIT 1`,
  );
  return row ? { id: row.user_id, name: row.user_lastname } : null;
}
