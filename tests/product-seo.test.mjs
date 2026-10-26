import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const descriptions = JSON.parse(await readFile(new URL('../src/data/product-seo.json', import.meta.url), 'utf8'));
const inventory = await readFile(new URL('../src/data/products.ts', import.meta.url), 'utf8');
const slugs = [...inventory.matchAll(/\bslug:\s*'([^']+)'/g)].map((match) => match[1]);

test('every direct product page has a dedicated SEO summary, including hidden products', () => {
  assert.deepEqual(Object.keys(descriptions).sort(), slugs.sort());
});

test('product summaries are distinct, substantive and free from markup or placeholders', () => {
  const values = Object.values(descriptions);
  assert.equal(new Set(values).size, values.length);
  for (const [slug, description] of Object.entries(descriptions)) {
    assert.equal(typeof description, 'string', slug);
    assert.ok(description.length >= 100 && description.length <= 180, `${slug}: ${description.length}`);
    assert.equal(description, description.trim(), slug);
    assert.doesNotMatch(description, /[<>]|\{\{|\b(?:TODO|undefined)\b/, slug);
  }
});
