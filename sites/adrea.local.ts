import type { TenantConfig } from '../types/tenant';
import { req } from './_env';

export default {
  name:  'adrea',
  env:   'local',
  theme: 'capetown',

  baseUrl: 'https://adrea',
  webUrl:  'https://adrea',

  users: {
    superadmin:   { username: req('ADREA_LOCAL_SUPERADMIN_USER'),   password: req('ADREA_LOCAL_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('ADREA_LOCAL_TESTCUSTOMER_USER'), password: req('ADREA_LOCAL_TESTCUSTOMER_PASSWORD') },
    posManager:   { username: req('ADREA_LOCAL_POSMANAGER_USER'),   password: req('ADREA_LOCAL_POSMANAGER_PASSWORD') },
  },

  db: {
    host:     req('ADREA_LOCAL_DB_HOST'),
    port:     Number(req('ADREA_LOCAL_DB_PORT')),
    user:     req('ADREA_LOCAL_DB_USER'),
    password: req('ADREA_LOCAL_DB_PASSWORD'),
    database: 'adrea',
  },
} satisfies TenantConfig;
