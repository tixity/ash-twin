import type { TenantConfig } from '../types/tenant';
import { req } from './_env';

export default {
  name:  'cca',
  env:   'staging',
  theme: 'default',

  baseUrl: 'https://staging.coca-cola-arena.com',
  webUrl:  'https://staging.coca-cola-arena.com',

  users: {
    superadmin:   { username: req('CCA_STAGING_SUPERADMIN_USER'),   password: req('CCA_STAGING_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('CCA_STAGING_TESTCUSTOMER_USER'), password: req('CCA_STAGING_TESTCUSTOMER_PASSWORD') },
  },

  db: {
    host:     req('CCA_STAGING_DB_HOST'),
    port:     Number(req('CCA_STAGING_DB_PORT')),
    user:     req('CCA_STAGING_DB_USER'),
    password: req('CCA_STAGING_DB_PASSWORD'),
    database: 'cca_staging',
  },
} satisfies TenantConfig;
