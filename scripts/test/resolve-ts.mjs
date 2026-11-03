// Lets `node --test` import TalkNinja's TypeScript modules the way Next.js does: "@/x" means src/x, and an import
// without an extension finds x.ts, x.tsx or x/index.ts. Node 24 strips the types itself. Registered by
// scripts/test/register.mjs (node --import ./scripts/test/register.mjs).
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const EXTENSIONS = ['.ts', '.tsx', '/index.ts'];

function findFile(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parent = fileURLToPath(context.parentURL);
    if (parent.startsWith(SRC)) base = path.resolve(path.dirname(parent), specifier);
  }
  if (base) {
    const file = findFile(base);
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  return nextResolve(specifier, context);
}
