import type { TenantConfig } from '../types/tenant';
import { req } from './_env';

export default {
  name:  'blublood',
  env:   'staging',
  theme: 'capetown',

  baseUrl: 'https://staging.blubloodtickets.com',
  webUrl:  'https://staging.blubloodtickets.com',

  users: {
    superadmin:   { username: req('BLUBLOOD_STAGING_SUPERADMIN_USER'),   password: req('BLUBLOOD_STAGING_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('BLUBLOOD_STAGING_TESTCUSTOMER_USER'), password: req('BLUBLOOD_STAGING_TESTCUSTOMER_PASSWORD') },
  },

  db: {
    host:     req('BLUBLOOD_STAGING_DB_HOST'),
    port:     Number(req('BLUBLOOD_STAGING_DB_PORT')),
    user:     req('BLUBLOOD_STAGING_DB_USER'),
    password: req('BLUBLOOD_STAGING_DB_PASSWORD'),
    database: 'blublood_staging',
  },
} satisfies TenantConfig;
