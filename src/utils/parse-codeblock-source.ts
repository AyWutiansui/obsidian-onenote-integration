/**
 * Parse a OneNote code-block source string to extract page ID and title.
 *
 * The source may be:
 * - A bare page ID (single line)
 * - A page ID followed by a title on the next line(s)
 * - A URL containing an `id` or `page-id` query parameter
 * - Empty (returns null for both fields)
 *
 * Whitespace inside page IDs is stripped to handle COM interop quirks.
 */
export function parseCodeBlockSource(source: string): { pageId: string | null; pageTitle: string | null } {
  const trimmed = source.trim();

  if (!trimmed) {
    return { pageId: null, pageTitle: null };
  }

  const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length >= 2) {
    const id = lines[0].replace(/\s+/g, '');
    const title = lines.slice(1).join(' ');
    if (id.startsWith('http')) {
      const urlParams = new URLSearchParams(id.split('?')[1]);
      return {
        pageId: urlParams.get('id') || urlParams.get('page-id') || null,
        pageTitle: title
      };
    }
    return { pageId: id, pageTitle: title };
  }

  const id = lines[0].replace(/\s+/g, '');
  if (id.startsWith('http')) {
    const urlParams = new URLSearchParams(id.split('?')[1]);
    return {
      pageId: urlParams.get('id') || urlParams.get('page-id') || null,
      pageTitle: null
    };
  }
  return { pageId: id, pageTitle: null };
}
