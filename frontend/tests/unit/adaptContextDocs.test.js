import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptContextFileError } from '../../src/lib/adaptContextDocs.js';

test('adaptContextFileError accepte un PDF et un DOCX', () => {
  assert.equal(adaptContextFileError({ name: 'Lettre.pdf', size: 1200 }, 0), '');
  assert.equal(adaptContextFileError({ name: 'Portfolio.docx', size: 1200 }, 2), '');
});

test('adaptContextFileError refuse le format, le poids et le nombre', () => {
  assert.match(adaptContextFileError({ name: 'notes.txt', size: 10 }, 0), /PDF ou DOCX/);
  assert.match(adaptContextFileError({ name: 'gros.pdf', size: 9 * 1024 * 1024 }, 0), /8 Mo/);
  assert.match(adaptContextFileError({ name: 'ok.pdf', size: 10 }, 3), /3 documents/);
});
