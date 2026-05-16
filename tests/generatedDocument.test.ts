import { describe, expect, it } from 'vitest';
import {
  generatedDocumentExtension,
  generatedDocumentPathLabel
} from '../src/scm/generatedDocument';

describe('generated document helpers', () => {
  it('uses a diff extension for diff content and text extension otherwise', () => {
    expect(generatedDocumentExtension('diff')).toBe('diff');
    expect(generatedDocumentExtension('text')).toBe('txt');
  });

  it('sanitizes generated document labels for virtual document paths', () => {
    expect(generatedDocumentPathLabel('Bazaar Commit 12: README.md')).toBe('Bazaar Commit 12 README.md');
    expect(generatedDocumentPathLabel('   ')).toBe('Bazaar');
  });
});
