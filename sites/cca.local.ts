import type { TenantConfig } from '../types/tenant';
import { req } from './_env';

export default {
  name:  'cca',
  env:   'local',
  theme: 'default',

  baseUrl: 'https://cca',
  webUrl:  'https://cca',

  users: {
    superadmin:   { username: req('CCA_LOCAL_SUPERADMIN_USER'),   password: req('CCA_LOCAL_SUPERADMIN_PASSWORD') },
    testCustomer: { username: req('CCA_LOCAL_TESTCUSTOMER_USER'), password: req('CCA_LOCAL_TESTCUSTOMER_PASSWORD') },
    posManager:   { username: req('CCA_LOCAL_POSMANAGER_USER'),   password: req('CCA_LOCAL_POSMANAGER_PASSWORD') },
  },

  db: {
    host:     req('CCA_LOCAL_DB_HOST'),
    port:     Number(req('CCA_LOCAL_DB_PORT')),
    user:     req('CCA_LOCAL_DB_USER'),
    password: req('CCA_LOCAL_DB_PASSWORD'),
    database: 'cca',
  },
} satisfies TenantConfig;
