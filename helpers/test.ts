import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base } from '../fixtures';

const thisDir = path.dirname(fileURLToPath(import.meta.url));

type TestFn = Parameters<typeof base>[2];
interface RegistryEntry {
  id:    number;
  title: string;
}

const registryPath = path.resolve(thisDir, '..', 'specs', 'registry.json');
const registry: RegistryEntry[] = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));


// Load-time integrity check — fail the whole test process on a duplicate id
const byId = new Map<number, RegistryEntry>();

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
      `ash-twin: test id ${id} is not in specs/registry.json. Add it before writing the spec.`,
    );
  }
  // ID lives at the start of the title so it's visible everywhere the title
  base(`ID: ${entry.id} ${entry.title}`, { tag: [`@${category}`] }, fn);
}

export const test = Object.assign(callable, base);
export { expect } from '../fixtures';
