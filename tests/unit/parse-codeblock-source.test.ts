import { describe, it, expect } from 'vitest';
import { parseCodeBlockSource } from '../../src/utils/parse-codeblock-source';

describe('parseCodeBlockSource', () => {
  // -------------------------------------------------------------------------
  // Empty / whitespace-only source
  // -------------------------------------------------------------------------
  it('should return null/null for empty source', () => {
    expect(parseCodeBlockSource('')).toEqual({ pageId: null, pageTitle: null });
  });

  it('should return null/null for whitespace-only source', () => {
    expect(parseCodeBlockSource('   \n  \n  ')).toEqual({
      pageId: null,
      pageTitle: null,
    });
  });

  // -------------------------------------------------------------------------
  // Single-line page ID
  // -------------------------------------------------------------------------
  it('should extract a single-line page ID', () => {
    const result = parseCodeBlockSource('{12345-ABCDE}');
    expect(result.pageId).toBe('{12345-ABCDE}');
    expect(result.pageTitle).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Two-line: ID + title
  // -------------------------------------------------------------------------
  it('should extract page ID and title from two lines', () => {
    const result = parseCodeBlockSource('{12345-ABCDE}\nMy Page Title');
    expect(result.pageId).toBe('{12345-ABCDE}');
    expect(result.pageTitle).toBe('My Page Title');
  });

  // -------------------------------------------------------------------------
  // ID with embedded whitespace (COM quirk)
  // -------------------------------------------------------------------------
  it('should strip whitespace from page ID', () => {
    const result = parseCodeBlockSource('{ 1234 5-ABCDE }');
    expect(result.pageId).toBe('{12345-ABCDE}');
    expect(result.pageTitle).toBeNull();
  });

  it('should strip whitespace from page ID when title is present', () => {
    const result = parseCodeBlockSource('{ 1234 5-ABCDE }\nMy Title');
    expect(result.pageId).toBe('{12345-ABCDE}');
    expect(result.pageTitle).toBe('My Title');
  });

  // -------------------------------------------------------------------------
  // URL format
  // -------------------------------------------------------------------------
  it('should extract page ID from URL with id parameter', () => {
    const result = parseCodeBlockSource(
      'https://example.com/onenote?id={PAGE-GUID-123}'
    );
    expect(result.pageId).toBe('{PAGE-GUID-123}');
    expect(result.pageTitle).toBeNull();
  });

  it('should extract page ID from URL with page-id parameter', () => {
    const result = parseCodeBlockSource(
      'https://example.com/onenote?page-id={PAGE-456}'
    );
    expect(result.pageId).toBe('{PAGE-456}');
    expect(result.pageTitle).toBeNull();
  });

  it('should extract page ID and title from URL + second line', () => {
    const result = parseCodeBlockSource(
      'https://example.com/onenote?id={PAGE-789}\nFancy Title'
    );
    expect(result.pageId).toBe('{PAGE-789}');
    expect(result.pageTitle).toBe('Fancy Title');
  });

  it('should return null pageId when URL has no id parameter', () => {
    const result = parseCodeBlockSource('https://example.com/onenote?foo=bar');
    expect(result.pageId).toBeNull();
    expect(result.pageTitle).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Multi-line title (lines 2+ joined)
  // -------------------------------------------------------------------------
  it('should join lines 2+ into a single title', () => {
    const result = parseCodeBlockSource(
      '{PAGE-ID}\nTitle Line 1\nTitle Line 2\nTitle Line 3'
    );
    expect(result.pageId).toBe('{PAGE-ID}');
    expect(result.pageTitle).toBe('Title Line 1 Title Line 2 Title Line 3');
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  it('should skip blank lines when determining line count', () => {
    // Two non-empty lines after trimming: ID and title
    const result = parseCodeBlockSource('\n{ID-HERE}\n\nActual Title\n');
    expect(result.pageId).toBe('{ID-HERE}');
    expect(result.pageTitle).toBe('Actual Title');
  });
});
