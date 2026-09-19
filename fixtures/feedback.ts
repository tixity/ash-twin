import { test as base } from '@playwright/test';

// Attach a custom human-readable note to the current test's result. Notes
export const feedbackFixtures = base.extend<{
  feedback: (message: string) => void;
}>({
  feedback: async ({}, use, testInfo) => {
    await use((message: string) => {
      testInfo.annotations.push({ type: 'feedback', description: message });
    });
  },
});
