import type { TenantConfig } from '../types/tenant';
import { req } from './_env';

export default {
  name:  'adrea',
  env:   'staging',
  theme: 'capetown',

  baseUrl: 'https://staging.adrea.ae/',
  webUrl:  'https://staging.adrea.ae/',

  users: {
    superadmin:   { username: req('ADREA_STAGING_SUPERADMIN_USER'),   password: req('ADREA_STAGING_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('ADREA_STAGING_TESTCUSTOMER_USER'), password: req('ADREA_STAGING_TESTCUSTOMER_PASSWORD') },
    posManager:   { username: req('ADREA_STAGING_POSMANAGER_USER'),   password: req('ADREA_STAGING_POSMANAGER_PASSWORD') },
  },

  db: {
    host:     req('ADREA_STAGING_DB_HOST'),
    port:     Number(req('ADREA_STAGING_DB_PORT')),
    user:     req('ADREA_STAGING_DB_USER'),
    password: req('ADREA_STAGING_DB_PASSWORD'),
    database: 'adrea_staging',
  },
} satisfies TenantConfig;
