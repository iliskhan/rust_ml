import test from 'node:test';
import assert from 'node:assert/strict';
import { concepts } from '../src/concepts.ts';
import { searchConcepts } from '../src/searchConcepts.ts';

test('concept search accepts titles, IDs and Russian case independently of route', () => {
  assert.ok(searchConcepts('  ЛОГАРИФМ  ').some(item => item.id === 'logarithm'));
  assert.ok(searchConcepts('dot-product').some(item => item.id === 'dot-product'));
  assert.deepEqual(searchConcepts(''), concepts);
  assert.deepEqual(searchConcepts('несуществующийтермин123'), []);
});

test('several words must all match and ё/е share the same search', () => {
  assert.ok(searchConcepts('градиент чувствительности').some(item => item.id === 'gradient'));
  assert.deepEqual(searchConcepts('градиент несуществующийтермин123'), []);
  assert.ok(searchConcepts('функция её').some(item => item.id === 'function'));
  assert.deepEqual(searchConcepts('функция её'), searchConcepts('ФУНКЦИЯ ее'));
});
