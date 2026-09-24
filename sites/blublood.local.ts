import type { TenantConfig } from '../types/tenant';
import { req, optCreds } from './_env';

export default {
  name:  'blublood',
  env:   'local',
  theme: 'capetown',

  baseUrl: 'https://blublood',
  webUrl:  'https://blublood',

  users: {
    superadmin:   { username: req('BLUBLOOD_LOCAL_SUPERADMIN_USER'),   password: req('BLUBLOOD_LOCAL_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('BLUBLOOD_LOCAL_TESTCUSTOMER_USER'), password: req('BLUBLOOD_LOCAL_TESTCUSTOMER_PASSWORD') },
    posManager:   optCreds('BLUBLOOD_LOCAL_POSMANAGER_USER', 'BLUBLOOD_LOCAL_POSMANAGER_PASSWORD'),
  },

  db: {
    host:     req('BLUBLOOD_LOCAL_DB_HOST'),
    port:     Number(req('BLUBLOOD_LOCAL_DB_PORT')),
    user:     req('BLUBLOOD_LOCAL_DB_USER'),
    password: req('BLUBLOOD_LOCAL_DB_PASSWORD'),
    database: 'blublood',
  },
} satisfies TenantConfig;
