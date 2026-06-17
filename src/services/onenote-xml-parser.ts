import { LocalOneNoteNotebook, LocalOneNoteSection, LocalOneNotePage } from '../types';

/**
 * Escape special HTML characters in text.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Last-resort text extraction from OneNote XML when DOM parsing fails.
 * Extracts text from CDATA-wrapped or plain T elements via regex.
 */
export function fallbackTextExtract(xml: string): string {
  try {
    const parts: string[] = [];

    // Method 1: Extract text from CDATA-wrapped T elements
    const cdataRegex = /<(?:one:)?T[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/(?:one:)?T>/gi;
    let match;
    while ((match = cdataRegex.exec(xml)) !== null) {
      const text = match[1].trim();
      if (text) {
        parts.push(`<p>${escapeHtml(text)}</p>`);
      }
    }

    // Method 2: Extract plain text from T elements (no CDATA)
    if (parts.length === 0) {
      const plainRegex = /<(?:one:)?T[^>]*>([^<]+)<\/(?:one:)?T>/gi;
      while ((match = plainRegex.exec(xml)) !== null) {
        const text = match[1].trim();
        if (text) {
          parts.push(`<p>${escapeHtml(text)}</p>`);
        }
      }
    }

    return parts.length > 0 ? parts.join('\n') : '<p><em>Could not parse OneNote page content</em></p>';
  } catch {
    return '<p><em>Could not parse OneNote page content</em></p>';
  }
}

/**
 * Process table elements from OneNote XML into HTML table markup.
 */
export function processTable(tableEl: Element): string {
  const rows = tableEl.querySelectorAll('Row');
  let html = '<table border="1" style="border-collapse:collapse;width:100%;">';

  rows.forEach((row: Element) => {
    html += '<tr>';
    const cells = row.querySelectorAll('Cell');
    cells.forEach((cell: Element) => {
      const cellTexts: string[] = [];
      const oeList = cell.querySelectorAll('OE');
      oeList.forEach((oe: Element) => {
        const tSpans = oe.querySelectorAll('T');
        tSpans.forEach((t: Element) => {
          const text = (t.textContent || '').trim();
          if (text) cellTexts.push(escapeHtml(text));
        });
      });
      html += `<td style="padding:4px 8px;">${cellTexts.join('<br>')}</td>`;
    });
    html += '</tr>';
  });

  html += '</table>';
  return html;
}

/**
 * Recursively process outline elements (OE) from OneNote XML,
 * converting them into HTML paragraph, list, image, and table parts.
 */
export function processOutlineElements(parent: Element, htmlParts: string[]): void {
  // Only find DIRECT child OEs to avoid the skip-nested bug
  const directOEs = parent.querySelectorAll(':scope > OE');

  directOEs.forEach((oe: Element) => {
    // Extract text from direct T children only
    const textParts: string[] = [];
    const tSpans = oe.querySelectorAll(':scope > T');
    tSpans.forEach((t: Element) => {
      const text = t.textContent || '';
      if (text.trim()) {
        textParts.push(escapeHtml(text));
      }
    });

    // Images are direct children of OE
    const images = oe.querySelectorAll(':scope > Image');
    images.forEach((img: Element) => {
      const dataEl = img.querySelector('Data');
      if (dataEl) {
        const base64Data = (dataEl.textContent || '').replace(/\s/g, '');
        if (base64Data.length > 0) {
          textParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
        }
      }
    });

    // InkDrawing elements (handwritten content) — extract companion image previews
    const inkDrawings = oe.querySelectorAll(':scope > InkDrawing');
    inkDrawings.forEach((ink: Element) => {
      // Try child Image > Data first (embedded preview image)
      const imgData = ink.querySelector('Image Data');
      if (imgData) {
        const base64Data = (imgData.textContent || '').replace(/\s/g, '');
        if (base64Data.length > 0) {
          textParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
          return;
        }
      }
      // Fallback: sibling Image > Data
      const siblingImg = oe.querySelector(':scope > Image Data');
      if (siblingImg) {
        const base64Data = (siblingImg.textContent || '').replace(/\s/g, '');
        if (base64Data.length > 0) {
          textParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
        }
      }
    });

    // InkPicture elements (ink + picture) — extract the picture preview
    const inkPictures = oe.querySelectorAll(':scope > InkPicture');
    inkPictures.forEach((inkPic: Element) => {
      const imgData = inkPic.querySelector('Image Data');
      if (imgData) {
        const base64Data = (imgData.textContent || '').replace(/\s/g, '');
        if (base64Data.length > 0) {
          textParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
        }
      }
    });

    // Tables are direct children of OE
    const tables = oe.querySelectorAll(':scope > Table');
    tables.forEach((table: Element) => {
      textParts.push(processTable(table));
    });

    if (textParts.length > 0) {
      const combined = textParts.join(' ');
      const isBullet = oe.getAttribute('bullet') || oe.getAttribute('bulletStyle');

      if (isBullet) {
        htmlParts.push(`<li>${combined}</li>`);
      } else {
        htmlParts.push(`<p>${combined}</p>`);
      }
    }

    // Recurse into direct OEChildren for nested content (sub-lists, indented paragraphs)
    const oeChildrenList = oe.querySelectorAll(':scope > OEChildren');
    oeChildrenList.forEach((oeChildren: Element) => {
      const nestedParts: string[] = [];
      processOutlineElements(oeChildren, nestedParts);
      if (nestedParts.length > 0) {
        htmlParts.push(`<ul>${nestedParts.join('\n')}</ul>`);
      }
    });
  });
}

/**
 * Process standalone image elements (regular, ink, ink-picture) from OneNote XML.
 */
export function processImages(parent: Element, htmlParts: string[]): void {
  // Regular images
  const images = parent.querySelectorAll('Image');
  images.forEach((img: Element) => {
    const dataEl = img.querySelector('Data');
    if (dataEl) {
      const base64Data = (dataEl.textContent || '').replace(/\s/g, '');
      if (base64Data.length > 0) {
        htmlParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
      }
    }
  });

  // InkDrawing companion images
  const inkDrawings = parent.querySelectorAll('InkDrawing');
  inkDrawings.forEach((ink: Element) => {
    const imgData = ink.querySelector('Image Data');
    if (imgData) {
      const base64Data = (imgData.textContent || '').replace(/\s/g, '');
      if (base64Data.length > 0) {
        htmlParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
      }
    }
  });

  // InkPicture companion images
  const inkPictures = parent.querySelectorAll('InkPicture');
  inkPictures.forEach((inkPic: Element) => {
    const imgData = inkPic.querySelector('Image Data');
    if (imgData) {
      const base64Data = (imgData.textContent || '').replace(/\s/g, '');
      if (base64Data.length > 0) {
        htmlParts.push(`<img src="data:image/png;base64,${base64Data}" style="max-width:100%;height:auto;" />`);
      }
    }
  });
}

/**
 * Parse OneNote page XML (from GetPageContent) into clean HTML.
 * OneNote returns XML with embedded binary data (images, ink) that must be
 * converted to proper HTML elements before rendering in a browser.
 */
export function parseOneNotePageXml(xml: string): string {
  try {
    // Strip the one: namespace prefix so DOMParser + querySelectorAll work normally
    xml = xml.replace(/<(\/?)one:/g, '<$1');

    // Count InkDrawing elements for handwritten page detection
    const inkCount = (xml.match(/<InkDrawing[\s>]/g) || []).length;

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return fallbackTextExtract(xml);
    }

    const htmlParts: string[] = [];

    // Find the Page element (namespace prefix already stripped)
    const pageEl = doc.getElementsByTagName('Page')[0]
      || doc.documentElement;

    if (!pageEl) {
      return fallbackTextExtract(xml);
    }

    // Process all OE (Outline Element) children - these contain the actual content
    processOutlineElements(pageEl, htmlParts);

    // If no OE elements found, try processing Image elements directly
    if (htmlParts.length === 0) {
      processImages(pageEl, htmlParts);
    }

    const result = htmlParts.join('\n');

    // Detect handwritten pages: many InkDrawings but little renderable content
    if (result.length < 200 && inkCount > 5) {
      return `<div class="onenote-handwritten-placeholder" data-ink-count="${inkCount}">` +
        result +
        `<div class="onenote-handwritten-notice">` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>` +
        `<span>This page contains handwritten content (${inkCount} ink strokes) that cannot be rendered inline.</span>` +
        `</div></div>`;
    }

    return result || '<p><em>Empty page</em></p>';
  } catch (e: any) {
    console.error('Error parsing OneNote page XML:', e);
    return fallbackTextExtract(xml);
  }
}

/**
 * Parse OneNote XML hierarchy (Windows) - Complete structure with sections and pages.
 */
export function parseOneNoteHierarchy(xml: string): LocalOneNoteNotebook[] {
  const notebooks: LocalOneNoteNotebook[] = [];

  try {
    // Parse the XML to find all notebooks
    // Method 1: With namespace prefix - ID before name
    const notebookRegex = /<one:Notebook\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"([^>]*)>/gi;
    let match;

    while ((match = notebookRegex.exec(xml)) !== null) {
      const id = match[1];
      const name = match[2];

      // Extract sections for this notebook from the XML
      const sections = extractSectionsForNotebook(xml, id);

      notebooks.push({
        id,
        name,
        sections: sections.length > 0 ? sections : undefined
      });
    }

    // Method 2: Try reversed attribute order (name before ID)
    if (notebooks.length === 0) {
      const notebookRegex2 = /<one:Notebook\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"([^>]*)>/gi;
      while ((match = notebookRegex2.exec(xml)) !== null) {
        const name = match[1];
        const id = match[2];

        const sections = extractSectionsForNotebook(xml, id);

        notebooks.push({
          id,
          name,
          sections: sections.length > 0 ? sections : undefined
        });
      }
    }

    // Method 3: Try without namespace prefix
    if (notebooks.length === 0) {
      const notebookRegex3 = /<Notebook\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"([^>]*)>/gi;
      while ((match = notebookRegex3.exec(xml)) !== null) {
        const id = match[1];
        const name = match[2];

        const sections = extractSectionsForNotebook(xml, id);

        notebooks.push({
          id,
          name,
          sections: sections.length > 0 ? sections : undefined
        });
      }
    }
  } catch (error: any) {
    console.error('Failed to parse hierarchy XML:', error);
  }

  return notebooks;
}

/**
 * Extract sections for a specific notebook from the complete hierarchy XML.
 */
export function extractSectionsForNotebook(xml: string, notebookId: string): LocalOneNoteSection[] {
  const sections: LocalOneNoteSection[] = [];

  try {
    // Find the notebook section in the XML by ID
    // We need to find content between this notebook's opening tag and its closing tag
    const notebookPattern = new RegExp(`<one:Notebook[^>]*ID="${notebookId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([\\s\\S]*?)<\/one:Notebook>`, 'gi');
    const notebookMatch = notebookPattern.exec(xml);

    if (!notebookMatch) {
      return sections;
    }

    const notebookContent = notebookMatch[1];

    // Extract sections from notebook content
    // Method 1: With namespace prefix - ID before name
    const sectionRegex = /<one:Section\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"([^>]*)>/gi;
    let sectionMatch;

    while ((sectionMatch = sectionRegex.exec(notebookContent)) !== null) {
      const sectionId = sectionMatch[1];
      const sectionName = sectionMatch[2];

      // Extract pages for this section
      const pages = extractPagesForSection(notebookContent, sectionId);

      sections.push({
        id: sectionId,
        name: sectionName,
        notebookId: notebookId,
        pages: pages.length > 0 ? pages : undefined
      });
    }

    // Method 2: Try reversed attribute order
    if (sections.length === 0) {
      const sectionRegex2 = /<one:Section\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"([^>]*)>/gi;
      while ((sectionMatch = sectionRegex2.exec(notebookContent)) !== null) {
        const sectionName = sectionMatch[1];
        const sectionId = sectionMatch[2];

        const pages = extractPagesForSection(notebookContent, sectionId);

        sections.push({
          id: sectionId,
          name: sectionName,
          notebookId: notebookId,
          pages: pages.length > 0 ? pages : undefined
        });
      }
    }

  } catch (error: any) {
    console.error(`Error extracting sections for notebook ${notebookId}:`, error);
  }

  return sections;
}

/**
 * Extract pages for a specific section from the notebook XML content.
 */
export function extractPagesForSection(notebookContent: string, sectionId: string): LocalOneNotePage[] {
  const pages: LocalOneNotePage[] = [];

  try {
    // Find the section content in the XML
    const sectionPattern = new RegExp(`<one:Section[^>]*ID="${sectionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([\\s\\S]*?)<\/one:Section>`, 'gi');
    const sectionMatch = sectionPattern.exec(notebookContent);

    if (!sectionMatch) {
      return pages;
    }

    const sectionContent = sectionMatch[1];

    // Extract pages from section content
    // Method 1: With namespace prefix - ID before name
    const pageRegex = /<one:Page\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"([^>]*)>/gi;
    let pageMatch;

    while ((pageMatch = pageRegex.exec(sectionContent)) !== null) {
      const pageId = pageMatch[1];
      const pageTitle = pageMatch[2];
      const pageAttrs = pageMatch[3];

      // Extract dateTime if probable
      const dateTimeMatch = pageAttrs.match(/dateTime="([^"]*)"/i);
      const lastModifiedMatch = pageAttrs.match(/lastModifiedTime="([^"]*)"/i);

      pages.push({
        id: pageId,
        title: pageTitle,
        sectionId: sectionId,
        createdTime: dateTimeMatch?.[1],
        lastModifiedTime: lastModifiedMatch?.[1] || dateTimeMatch?.[1]
      });
    }

    // Method 2: Try reversed attribute order
    if (pages.length === 0) {
      const pageRegex2 = /<one:Page\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"([^>]*)>/gi;
      while ((pageMatch = pageRegex2.exec(sectionContent)) !== null) {
        const pageTitle = pageMatch[1];
        const pageId = pageMatch[2];
        const pageAttrs = pageMatch[3];

        const dateTimeMatch = pageAttrs.match(/dateTime="([^"]*)"/i);
        const lastModifiedMatch = pageAttrs.match(/lastModifiedTime="([^"]*)"/i);

        pages.push({
          id: pageId,
          title: pageTitle,
          sectionId: sectionId,
          createdTime: dateTimeMatch?.[1],
          lastModifiedTime: lastModifiedMatch?.[1] || dateTimeMatch?.[1]
        });
      }
    }

  } catch (error: any) {
    console.error(`Error extracting pages for section ${sectionId}:`, error);
  }

  return pages;
}

/**
 * Parse OneNote sections XML (Windows).
 */
export function parseOneNoteSections(xml: string): LocalOneNoteSection[] {
  const sections: LocalOneNoteSection[] = [];

  try {
    // Method 1: With namespace prefix
    const sectionRegex = /<one:Section\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"[^>]*>/gi;
    let match;

    while ((match = sectionRegex.exec(xml)) !== null) {
      const name = match[1];
      const id = match[2];
      sections.push({ id, name, notebookId: '' });
    }

    // Method 2: Try reversed attribute order
    if (sections.length === 0) {
      const sectionRegex2 = /<one:Section\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"[^>]*>/gi;
      while ((match = sectionRegex2.exec(xml)) !== null) {
        const id = match[1];
        const name = match[2];
        sections.push({ id, name, notebookId: '' });
      }
    }

    // Method 3: Without namespace prefix
    if (sections.length === 0) {
      const sectionRegex3 = /<Section\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"[^>]*>/gi;
      while ((match = sectionRegex3.exec(xml)) !== null) {
        const name = match[1];
        const id = match[2];
        sections.push({ id, name, notebookId: '' });
      }
    }
  } catch (error: any) {
    console.error('Failed to parse sections XML:', error);
  }

  return sections;
}

/**
 * Parse OneNote pages XML (Windows).
 */
export function parseOneNotePages(xml: string): LocalOneNotePage[] {
  const pages: LocalOneNotePage[] = [];

  try {
    // Method 1: With namespace prefix - standard format (ID before name)
    const pageRegex = /<one:Page\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"[^>]*>/gi;
    let match;

    while ((match = pageRegex.exec(xml)) !== null) {
      const id = match[1];
      const name = match[2];
      // Extract dateTime attribute from the matched tag
      const pageTag = match[0];
      const dateTimeMatch = pageTag.match(/dateTime="([^"]*)"/i);
      pages.push({
        id,
        title: name,
        sectionId: '',
        createdTime: dateTimeMatch?.[1],
        lastModifiedTime: dateTimeMatch?.[1]
      });
    }

    // Method 2: Try reversed attribute order (name before ID)
    if (pages.length === 0) {
      const pageRegex2 = /<one:Page\s+[^>]*name="([^"]*)"[^>]*ID="([^"]*)"[^>]*>/gi;
      while ((match = pageRegex2.exec(xml)) !== null) {
        const name = match[1];
        const id = match[2];
        const pageTag = match[0];
        const dateTimeMatch = pageTag.match(/dateTime="([^"]*)"/i);
        pages.push({
          id,
          title: name,
          sectionId: '',
          createdTime: dateTimeMatch?.[1],
          lastModifiedTime: dateTimeMatch?.[1]
        });
      }
    }

    // Method 3: Without namespace prefix
    if (pages.length === 0) {
      const pageRegex3 = /<Page\s+[^>]*ID="([^"]*)"[^>]*name="([^"]*)"[^>]*>/gi;
      while ((match = pageRegex3.exec(xml)) !== null) {
        const id = match[1];
        const name = match[2];
        const pageTag = match[0];
        const dateTimeMatch = pageTag.match(/dateTime="([^"]*)"/i);
        pages.push({
          id,
          title: name,
          sectionId: '',
          createdTime: dateTimeMatch?.[1],
          lastModifiedTime: dateTimeMatch?.[1]
        });
      }
    }
  } catch (error: any) {
    console.error('Failed to parse pages XML:', error);
  }

  return pages;
}
