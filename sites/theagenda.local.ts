import type { TenantConfig } from '../types/tenant';
import { req, optCreds } from './_env';

export default {
  name:  'theagenda',
  env:   'local',
  theme: 'capetown',

  baseUrl: 'https://theagenda',
  webUrl:  'https://theagenda',

  users: {
    superadmin:   { username: req('THEAGENDA_LOCAL_SUPERADMIN_USER'),   password: req('THEAGENDA_LOCAL_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('THEAGENDA_LOCAL_TESTCUSTOMER_USER'), password: req('THEAGENDA_LOCAL_TESTCUSTOMER_PASSWORD') },
    posManager:   optCreds('THEAGENDA_LOCAL_POSMANAGER_USER', 'THEAGENDA_LOCAL_POSMANAGER_PASSWORD'),
  },

  db: {
    host:     req('THEAGENDA_LOCAL_DB_HOST'),
    port:     Number(req('THEAGENDA_LOCAL_DB_PORT')),
    user:     req('THEAGENDA_LOCAL_DB_USER'),
    password: req('THEAGENDA_LOCAL_DB_PASSWORD'),
    database: 'theagenda',
  },
} satisfies TenantConfig;
