// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  fallbackTextExtract,
  parseOneNoteHierarchy,
  parseOneNoteSections,
  parseOneNotePages,
  parseOneNotePageXml,
} from '../../src/services/onenote-xml-parser';

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------
describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it('should escape all special characters together', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'
    );
  });

  it('should return the same string when nothing to escape', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// fallbackTextExtract
// ---------------------------------------------------------------------------
describe('fallbackTextExtract', () => {
  it('should extract text from CDATA-wrapped T elements', () => {
    const xml = '<one:T><![CDATA[Hello CDATA]]></one:T>';
    const result = fallbackTextExtract(xml);
    expect(result).toContain('Hello CDATA');
    expect(result).toContain('<p>');
  });

  it('should extract plain text from T elements (no CDATA)', () => {
    const xml = '<one:T>Plain text here</one:T>';
    const result = fallbackTextExtract(xml);
    expect(result).toContain('Plain text here');
  });

  it('should return placeholder for empty input', () => {
    const result = fallbackTextExtract('');
    expect(result).toContain('Could not parse');
  });

  it('should return placeholder when no T elements found', () => {
    const xml = '<root><foo>bar</foo></root>';
    const result = fallbackTextExtract(xml);
    expect(result).toContain('Could not parse');
  });

  it('should escape HTML in extracted text', () => {
    const xml = '<one:T><![CDATA[<script>alert("xss")</script>]]></one:T>';
    const result = fallbackTextExtract(xml);
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// parseOneNoteHierarchy
// ---------------------------------------------------------------------------
describe('parseOneNoteHierarchy', () => {
  const sampleXml = `<?xml version="1.0"?>
<one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
  <one:Notebook ID="nb-id-1" name="My Notebook" path="C:\\test">
    <one:Section ID="sec-id-1" name="Section A">
      <one:Page ID="page-id-1" name="Page 1" dateTime="2024-01-15T10:00:00.000Z"/>
      <one:Page ID="page-id-2" name="Page 2" dateTime="2024-02-20T14:30:00.000Z"/>
    </one:Section>
  </one:Notebook>
</one:Notebooks>`;

  it('should parse well-formed XML with one:Notebook namespace prefix', () => {
    const notebooks = parseOneNoteHierarchy(sampleXml);
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].id).toBe('nb-id-1');
    expect(notebooks[0].name).toBe('My Notebook');
  });

  it('should include sections with pages', () => {
    const notebooks = parseOneNoteHierarchy(sampleXml);
    expect(notebooks[0].sections).toBeDefined();
    expect(notebooks[0].sections).toHaveLength(1);
    expect(notebooks[0].sections![0].id).toBe('sec-id-1');
    expect(notebooks[0].sections![0].name).toBe('Section A');
    expect(notebooks[0].sections![0].pages).toHaveLength(2);
    expect(notebooks[0].sections![0].pages![0].id).toBe('page-id-1');
    expect(notebooks[0].sections![0].pages![1].title).toBe('Page 2');
  });

  it('should handle reversed attribute order (name before ID)', () => {
    const reversedXml = `<?xml version="1.0"?>
<one:Notebooks xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
  <one:Notebook name="Reversed Notebook" ID="nb-id-rev" path="C:\\rev">
    <one:Section name="Rev Section" ID="sec-rev">
      <one:Page name="Rev Page" ID="page-rev" dateTime="2024-03-01T08:00:00.000Z"/>
    </one:Section>
  </one:Notebook>
</one:Notebooks>`;
    const notebooks = parseOneNoteHierarchy(reversedXml);
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].id).toBe('nb-id-rev');
    expect(notebooks[0].name).toBe('Reversed Notebook');
  });

  it('should handle XML without namespace prefix', () => {
    const noNsXml = `<?xml version="1.0"?>
<Notebooks>
  <Notebook ID="nb-no-ns" name="No NS Notebook" path="C:\\nons">
  </Notebook>
</Notebooks>`;
    const notebooks = parseOneNoteHierarchy(noNsXml);
    expect(notebooks).toHaveLength(1);
    expect(notebooks[0].id).toBe('nb-no-ns');
    expect(notebooks[0].name).toBe('No NS Notebook');
  });

  it('should return empty array for invalid XML', () => {
    const notebooks = parseOneNoteHierarchy('not xml at all');
    expect(notebooks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseOneNoteSections
// ---------------------------------------------------------------------------
describe('parseOneNoteSections', () => {
  it('should parse sections with namespace prefix', () => {
    const xml = `<one:Sections xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:Section name="Alpha" ID="sec-alpha"/>
      <one:Section name="Beta" ID="sec-beta"/>
    </one:Sections>`;
    const sections = parseOneNoteSections(xml);
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe('Alpha');
    expect(sections[0].id).toBe('sec-alpha');
    expect(sections[1].name).toBe('Beta');
  });

  it('should return empty array for empty input', () => {
    expect(parseOneNoteSections('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseOneNotePages
// ---------------------------------------------------------------------------
describe('parseOneNotePages', () => {
  it('should parse pages with namespace prefix and extract dateTime', () => {
    const xml = `<one:Pages xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:Page ID="p1" name="First Page" dateTime="2024-06-01T12:00:00.000Z"/>
      <one:Page ID="p2" name="Second Page" dateTime="2024-07-15T09:30:00.000Z"/>
    </one:Pages>`;
    const pages = parseOneNotePages(xml);
    expect(pages).toHaveLength(2);
    expect(pages[0].id).toBe('p1');
    expect(pages[0].title).toBe('First Page');
    expect(pages[0].createdTime).toBe('2024-06-01T12:00:00.000Z');
    expect(pages[1].id).toBe('p2');
    expect(pages[1].title).toBe('Second Page');
  });

  it('should handle pages without dateTime attribute', () => {
    const xml = `<one:Pages xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:Page ID="p-no-date" name="No Date"/>
    </one:Pages>`;
    const pages = parseOneNotePages(xml);
    expect(pages).toHaveLength(1);
    expect(pages[0].createdTime).toBeUndefined();
  });

  it('should return empty array for invalid XML', () => {
    expect(parseOneNotePages('<root/>')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseOneNotePageXml
// ---------------------------------------------------------------------------
describe('parseOneNotePageXml', () => {
  const simplePageXml = `<?xml version="1.0"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
  <one:OE>
    <one:T>Hello World</one:T>
  </one:OE>
  <one:OE>
    <one:T>Second paragraph</one:T>
  </one:OE>
</one:Page>`;

  it('should parse simple text OE elements into HTML paragraphs', () => {
    const html = parseOneNotePageXml(simplePageXml);
    expect(html).toContain('<p>Hello World</p>');
    expect(html).toContain('<p>Second paragraph</p>');
  });

  it('should return empty-page placeholder for a page with no content', () => {
    const emptyPageXml = `<?xml version="1.0"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
</one:Page>`;
    const html = parseOneNotePageXml(emptyPageXml);
    expect(html).toContain('Empty page');
  });

  it('should use fallback for malformed XML', () => {
    const malformedXml = `<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
      <one:OE><one:T>Some text</one:T>
      <!-- unclosed tags to make it malformed -->`;
    const html = parseOneNotePageXml(malformedXml);
    // Should still produce some output via fallback
    expect(html).toBeTruthy();
    expect(typeof html).toBe('string');
  });

  it('should escape HTML in text content', () => {
    const xssXml = `<?xml version="1.0"?>
<one:Page xmlns:one="http://schemas.microsoft.com/office/onenote/2013/onenote">
  <one:OE>
    <one:T><![CDATA[<img src=x onerror=alert(1)>]]></one:T>
  </one:OE>
</one:Page>`;
    const html = parseOneNotePageXml(xssXml);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&gt;');
    // The raw <img tag must NOT appear unescaped
    expect(html).not.toContain('<img src=x');
  });
});
