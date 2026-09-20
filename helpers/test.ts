import { test as base } from '../fixtures';
import { registry } from '../specs/registry';

// TestFn use playwright's test callable signature.
type TestFn = Parameters<typeof base>[2];


// Load-time integrity check — fail the whole test process on a duplicate id
const byId = new Map<number, typeof registry[number]>();
for (const entry of registry) {
  if (byId.has(entry.id)) {
    throw new Error(`ash-twin registry: duplicate test id ${entry.id}`);
  }
  byId.set(entry.id, entry);
}


function callable(id: number, category: string, fn: TestFn): void {
  const entry = byId.get(id);
  if (!entry) {
    throw new Error(
      `ash-twin: test id ${id} is not in specs/registry.ts. Add it before writing the spec.`,
    );
  }
  // ID lives at the start of the title so it's visible everywhere the title
  base(`ID: ${entry.id} ${entry.title}`, { tag: [`@${category}`] }, fn);
}

// Extending our test function to include playwright's test callable signature.
export const test = Object.assign(callable, base);
export { expect } from '../fixtures';
