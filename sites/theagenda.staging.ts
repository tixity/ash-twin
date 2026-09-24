import type { TenantConfig } from '../types/tenant';
import { req, optCreds } from './_env';

export default {
  name:  'theagenda',
  env:   'staging',
  theme: 'capetown',

  baseUrl: 'https://staging.theagenda.com',
  webUrl:  'https://staging.theagenda.com',

  users: {
    superadmin:   { username: req('THEAGENDA_STAGING_SUPERADMIN_USER'),   password: req('THEAGENDA_STAGING_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('THEAGENDA_STAGING_TESTCUSTOMER_USER'), password: req('THEAGENDA_STAGING_TESTCUSTOMER_PASSWORD') },
    posManager:   optCreds('THEAGENDA_STAGING_POSMANAGER_USER', 'THEAGENDA_STAGING_POSMANAGER_PASSWORD'),
  },

  db: {
    host:     req('THEAGENDA_STAGING_DB_HOST'),
    port:     Number(req('THEAGENDA_STAGING_DB_PORT')),
    user:     req('THEAGENDA_STAGING_DB_USER'),
    password: req('THEAGENDA_STAGING_DB_PASSWORD'),
    database: 'theagenda_staging',
  },
} satisfies TenantConfig;
