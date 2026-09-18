import { mergeTests } from '@playwright/test';
import { tenantFixture } from './tenant';
import { observerFixtures } from './observer';
import { browserFixtures } from './browser';
import { actorsFixtures } from './actors';
import { feedbackFixtures } from './feedback';

export const test = mergeTests(tenantFixture, observerFixtures, browserFixtures, actorsFixtures, feedbackFixtures);
export { expect } from '@playwright/test';
