import { describe, expect, it } from 'vitest';
import {
  decodeRevisionDocumentQuery,
  encodeRevisionDocumentQuery
} from '../src/scm/revisionDocumentQuery';

describe('revision document query parsing', () => {
  it('round-trips a valid relative path and revision', () => {
    const query = decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({
      path: 'plugins/readme.md',
      revision: 'revid:abc',
      empty: true
    }));

    expect(query).toEqual({
      path: 'plugins/readme.md',
      revision: 'revid:abc',
      empty: true
    });
  });

  it('rejects malformed JSON instead of throwing', () => {
    expect(decodeRevisionDocumentQuery('%7Bbad-json')).toBeUndefined();
  });

  it('rejects decoded arrays and primitive payloads', () => {
    expect(decodeRevisionDocumentQuery(encodeURIComponent(JSON.stringify(['README.md', '1'])))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeURIComponent(JSON.stringify('README.md')))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeURIComponent(JSON.stringify(1)))).toBeUndefined();
  });

  it('rejects empty path and empty revision', () => {
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: '', revision: '7' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'README.md', revision: '' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'README.md', revision: '   ' }))).toBeUndefined();
  });

  it('rejects invalid revision sentinels', () => {
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'README.md', revision: 'undefined' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'README.md', revision: '?' }))).toBeUndefined();
  });

  it('rejects absolute and escaping paths', () => {
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'C:/tmp/file.txt', revision: '1' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: '../secret.txt', revision: '1' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: 'docs\\..\\secret.txt', revision: '1' }))).toBeUndefined();
  });

  it('rejects paths that could be interpreted as Bazaar command options', () => {
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: '--help', revision: '1' }))).toBeUndefined();
    expect(decodeRevisionDocumentQuery(encodeRevisionDocumentQuery({ path: '-x', revision: '1' }))).toBeUndefined();
  });
});
