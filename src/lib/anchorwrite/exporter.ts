import { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFRef } from "pdf-lib";
import type { AnchorData, BoundingBox } from "./types";
import { encodeMetadata } from "./metadata";

interface GlossaryEntry {
  tag: string;
  locations: LocationRef[];
}

interface LocationRef {
  label: string;
  /** 1-indexed page number in the ORIGINAL document (excluding glossary). */
  page: number;
  /** Optional Y position (normalized 0..1) within the original page, for region links. */
  yNorm?: number;
}

const BRAND_WEBSITE = "anchorwrite.org/hello";
const BRAND_GITHUB = "https://github.com/karth123/semantic-indexer";

function buildGlossary(anchors: AnchorData): GlossaryEntry[] {
  const regionLabels = new Map<string, string>();
  anchors.boxes.forEach((b, i) => regionLabels.set(b.id, `Region ${i + 1}`));

  const map = new Map<string, LocationRef[]>();
  const add = (tag: string, loc: LocationRef) => {
    const key = tag.trim();
    if (!key) return;
    const arr = map.get(key) ?? [];
    if (!arr.some((l) => l.label === loc.label)) arr.push(loc);
    map.set(key, arr);
  };

  for (const [pageStr, tags] of Object.entries(anchors.pageTags)) {
    const p = Number(pageStr);
    for (const t of tags) add(t, { label: `Page ${p}`, page: p });
  }
  for (const b of anchors.boxes) {
    const label = regionLabels.get(b.id)!;
    for (const t of b.tags) {
      add(t, { label: `${label} (Page ${b.page})`, page: b.page, yNorm: b.y });
    }
  }

  return Array.from(map.entries())
    .map(([tag, locations]) => ({ tag, locations }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}

/**
 * Append a Link annotation to a page that jumps to another page (and optional Y position).
 */
function addInternalLink(
  pdfDoc: PDFDocument,
  hostPage: ReturnType<PDFDocument["getPages"]>[number],
  rect: [number, number, number, number],
  destPageRef: PDFRef,
  destY: number | null,
) {
  const dest = pdfDoc.context.obj([
    destPageRef,
    PDFName.of("XYZ"),
    null,
    destY ?? null,
    null,
  ]);
  const link = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: rect,
    Border: [0, 0, 0],
    Dest: dest,
  });
  const linkRef = pdfDoc.context.register(link);
  const existing = hostPage.node.lookup(PDFName.of("Annots"));
  if (existing instanceof PDFArray) {
    existing.push(linkRef);
  } else {
    hostPage.node.set(PDFName.of("Annots"), pdfDoc.context.obj([linkRef]));
  }
}

/**
 * Append an external URI Link annotation to a page.
 */
function addUriLink(
  pdfDoc: PDFDocument,
  hostPage: ReturnType<PDFDocument["getPages"]>[number],
  rect: [number, number, number, number],
  uri: string,
) {
  const action = pdfDoc.context.obj({ Type: "Action", S: "URI", URI: uri });
  const link = pdfDoc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: rect,
    Border: [0, 0, 0],
    A: action,
  });
  const linkRef = pdfDoc.context.register(link);
  const existing = hostPage.node.lookup(PDFName.of("Annots"));
  if (existing instanceof PDFArray) {
    existing.push(linkRef);
  } else {
    hostPage.node.set(PDFName.of("Annots"), pdfDoc.context.obj([linkRef]));
  }
}

/**
 * Export PDF with:
 *  - a prepended branded glossary page with clickable links
 *  - invisible searchable text anchors on each original page
 *  - embedded metadata in Subject for re-import
 */
export async function exportTaggedPdf(
  originalBytes: ArrayBuffer,
  anchors: AnchorData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });

  if (anchors.hasGlossary && pdfDoc.getPageCount() > 0) {
    pdfDoc.removePage(0);
  }

  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ---- Inject invisible anchors into each original page ----
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNum = i + 1;

    const pageTags = anchors.pageTags[pageNum] ?? [];
    if (pageTags.length > 0) {
      page.drawText(pageTags.join(" "), {
        x: 4,
        y: height - 10,
        size: 6,
        font: helv,
        opacity: 0,
      });
    }

    const boxesOnPage = anchors.boxes.filter((b: BoundingBox) => b.page === pageNum);
    for (const box of boxesOnPage) {
      if (box.tags.length === 0) continue;
      const pdfX = box.x * width;
      const pdfY = height - box.y * height - 6;
      page.drawText(box.tags.join(" "), {
        x: Math.max(0, pdfX),
        y: Math.max(0, pdfY),
        size: 6,
        font: helv,
        opacity: 0,
      });
    }
  }

  // ---- Build & prepend the glossary page ----
  const entries = buildGlossary(anchors);
  let glossary = pdfDoc.insertPage(0, [612, 792]);
  const W = glossary.getWidth();
  const H = glossary.getHeight();
  const marginX = 56;

  // Subtle top accent bar
  glossary.drawRectangle({
    x: 0,
    y: H - 6,
    width: W,
    height: 6,
    color: rgb(0.07, 0.07, 0.09),
  });

  // Brand mark — try to embed /icon.png if user supplied one, otherwise
  // fall back to a small "A" tile so exports always look intentional.
  let brandEmbedded = false;
  try {
    const res = await fetch("/icon.png", { cache: "no-cache" });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      const img = await pdfDoc.embedPng(buf).catch(() => null);
      if (img) {
        glossary.drawImage(img, {
          x: marginX,
          y: H - 86,
          width: 22,
          height: 22,
        });
        brandEmbedded = true;
      }
    }
  } catch {
    /* ignore — fall back to letter tile */
  }
  if (!brandEmbedded) {
    glossary.drawRectangle({
      x: marginX,
      y: H - 86,
      width: 22,
      height: 22,
      color: rgb(0.07, 0.07, 0.09),
    });
    glossary.drawText("A", {
      x: marginX + 6.5,
      y: H - 81,
      size: 13,
      font: helvBold,
      color: rgb(1, 1, 1),
    });
  }
  glossary.drawText("AnchorWrite", {
    x: marginX + 32,
    y: H - 80,
    size: 12,
    font: helvBold,
    color: rgb(0.1, 0.1, 0.12),
  });
  glossary.drawText("SEMANTIC INDEX", {
    x: marginX + 32,
    y: H - 94,
    size: 7,
    font: helv,
    color: rgb(0.5, 0.5, 0.55),
  });

  let y = H - 130;
  glossary.drawText("Glossary", {
    x: marginX,
    y,
    size: 24,
    font: helvBold,
    color: rgb(0.07, 0.07, 0.09),
  });
  y -= 18;
  glossary.drawText(
    "Tagged pages and regions in this document. Tap any entry to jump to its location.",
    {
      x: marginX,
      y,
      size: 9,
      font: helv,
      color: rgb(0.45, 0.45, 0.5),
    },
  );
  y -= 28;

  // ---- GitHub Star CTA ----
  const ctaX = marginX;
  const ctaY = y;
  const ctaWidth = W - marginX * 2;
  const ctaHeight = 64;

  glossary.drawRectangle({
    x: ctaX,
    y: ctaY - ctaHeight + 12,
    width: ctaWidth,
    height: ctaHeight,
    color: rgb(0.07, 0.07, 0.09),
  });

  glossary.drawText("Star our GitHub repository", {
    x: ctaX + 18,
    y: ctaY - 8,
    size: 18,
    font: helvBold,
    color: rgb(1, 1, 1),
  });

  glossary.drawText(
    "Support AnchorWrite and follow future development updates.",
    {
      x: ctaX + 18,
      y: ctaY - 28,
      size: 10,
      font: helv,
      color: rgb(0.86, 0.86, 0.9),
    },
  );

  glossary.drawText(BRAND_GITHUB, {
    x: ctaX + 18,
    y: ctaY - 45,
    size: 10,
    font: helv,
    color: rgb(0.55, 0.8, 1),
  });

  addUriLink(
    pdfDoc,
    glossary,
    [
      ctaX,
      ctaY - ctaHeight + 12,
      ctaX + ctaWidth,
      ctaY + 12,
    ],
    BRAND_GITHUB,
  );

  y -= 88;

  // Hidden marker text so future imports can confirm provenance
  glossary.drawText("ANCHORWRITE_GLOSSARY_PAGE", {
    x: 2,
    y: 2,
    size: 4,
    font: helv,
    opacity: 0,
  });


  if (entries.length === 0) {
    glossary.drawText("No tags have been added yet.", {
      x: marginX,
      y,
      size: 11,
      font: helv,
      color: rgb(0.4, 0.4, 0.4),
    });
  } else {
    const lineH = 18;
    const fontSize = 10;
    const rightX = W - marginX;
    const linkColor = rgb(0.12, 0.35, 0.78);
    let glossaryPageIndex = 0;
    const entriesPerPage = Math.floor((H - 90 - 80) / lineH);
    const totalGlossaryPages = Math.max(
      1,
      Math.ceil(entries.length / entriesPerPage),
    );

    for (const entry of entries) {
      // create new glossary page if current page is full
      if (y < 90) {
        drawFooter(pdfDoc, glossary, helv, helvBold, marginX);
    
        glossaryPageIndex += 1;

        glossary = pdfDoc.insertPage(
          glossaryPageIndex,
          [612, 792],
        );
    
        y = H - 80;
    
        glossary.drawText("Glossary (continued)", {
          x: marginX,
          y,
          size: 20,
          font: helvBold,
          color: rgb(0.07, 0.07, 0.09),
        });
    
        y -= 32;
      }
    
      const tag = entry.tag;
      const tagWidth = helv.widthOfTextAtSize(tag, fontSize);
    
      glossary.drawText(tag, {
        x: marginX,
        y,
        size: fontSize,
        font: helvBold,
        color: rgb(0.1, 0.1, 0.12),
      });
    
      // Render each location right-aligned, separated by " · "
      const sep = "  ·  ";
      const sepWidth = helv.widthOfTextAtSize(sep, fontSize);
    
      const widths = entry.locations.map((l) =>
        helv.widthOfTextAtSize(l.label, fontSize),
      );
    
      const totalWidth =
        widths.reduce((a, b) => a + b, 0) +
        Math.max(0, entry.locations.length - 1) * sepWidth;
    
      let cursorX = rightX - totalWidth;
    
      // Dotted leader
      const dotsStart = marginX + tagWidth + 6;
      const dotsEnd = cursorX - 6;
    
      if (dotsEnd > dotsStart) {
        const dotSpacing = 4;
    
        for (let dx = dotsStart; dx < dotsEnd; dx += dotSpacing) {
          glossary.drawText(".", {
            x: dx,
            y,
            size: fontSize,
            font: helv,
            color: rgb(0.75, 0.75, 0.78),
          });
        }
      }
    
      for (let li = 0; li < entry.locations.length; li++) {
        const loc = entry.locations[li];
        const w = widths[li];
    
        glossary.drawText(loc.label, {
          x: cursorX,
          y,
          size: fontSize,
          font: helv,
          color: linkColor,
        });
    
        // Hyperlink annotation
        const glossaryPageCount = totalGlossaryPages;
        const pagesAfter = pdfDoc.getPages();
        const destPageIdx = loc.page + glossaryPageCount - 1;
    
        if (destPageIdx >= 1 && destPageIdx < pagesAfter.length) {
          const destPage = pagesAfter[destPageIdx];
          const destHeight = destPage.getSize().height;
    
          const destY =
            loc.yNorm !== undefined
              ? Math.max(0, destHeight - loc.yNorm * destHeight + 20)
              : destHeight;
    
          addInternalLink(
            pdfDoc,
            glossary,
            [cursorX, y - 2, cursorX + w, y + fontSize],
            destPage.ref,
            destY,
          );
        }
    
        cursorX += w;
    
        if (li < entry.locations.length - 1) {
          glossary.drawText(sep, {
            x: cursorX,
            y,
            size: fontSize,
            font: helv,
            color: rgb(0.55, 0.55, 0.6),
          });
    
          cursorX += sepWidth;
        }
      }
    
      y -= lineH;
    }
  }

  // ---- Branded footer ----
  drawFooter(pdfDoc, glossary, helv, helvBold, marginX);

  // ---- Embed metadata for re-import ----
  const persisted: AnchorData = { ...anchors, hasGlossary: true };
  pdfDoc.setSubject(encodeMetadata(persisted));
  pdfDoc.setProducer("AnchorWrite");
  pdfDoc.setCreator("AnchorWrite");

  return await pdfDoc.save();
}

function drawFooter(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument["getPages"]>[number],
  helv: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  helvBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  marginX: number,
) {
  const W = page.getWidth();
  const footerY = 50;

  // Divider line
  page.drawLine({
    start: { x: marginX, y: footerY + 30 },
    end: { x: W - marginX, y: footerY + 30 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.88),
  });

  // Left: brand
  page.drawText("Generated by AnchorWrite", {
    x: marginX,
    y: footerY + 12,
    size: 9,
    font: helvBold,
    color: rgb(0.15, 0.15, 0.18),
  });
  page.drawText("Hidden semantic anchors for handwritten PDFs", {
    x: marginX,
    y: footerY,
    size: 7.5,
    font: helv,
    color: rgb(0.5, 0.5, 0.55),
  });

  // Right: link cluster (globe + website, GitHub mark + repo)
  const linkFontSize = 8.5;
  const iconSize = 9;
  const websiteText = BRAND_WEBSITE;
  const githubText = BRAND_GITHUB;
  const wsWidth = helv.widthOfTextAtSize(websiteText, linkFontSize);
  const ghWidth = helv.widthOfTextAtSize(githubText, linkFontSize);
  const gap = 18;

  const totalRightWidth = iconSize + 4 + wsWidth + gap + iconSize + 4 + ghWidth;
  let rx = W - marginX - totalRightWidth;
  const ry = footerY + 6;

  // Globe icon (circle + meridians)
  const globeCx = rx + iconSize / 2;
  const globeCy = ry + iconSize / 2;
  page.drawCircle({
    x: globeCx,
    y: globeCy,
    size: iconSize / 2,
    borderColor: rgb(0.25, 0.25, 0.3),
    borderWidth: 0.6,
  });
  page.drawLine({
    start: { x: globeCx - iconSize / 2, y: globeCy },
    end: { x: globeCx + iconSize / 2, y: globeCy },
    thickness: 0.5,
    color: rgb(0.25, 0.25, 0.3),
  });
  page.drawLine({
    start: { x: globeCx, y: globeCy - iconSize / 2 },
    end: { x: globeCx, y: globeCy + iconSize / 2 },
    thickness: 0.5,
    color: rgb(0.25, 0.25, 0.3),
  });

  rx += iconSize + 4;
  page.drawText(websiteText, {
    x: rx,
    y: ry + 1,
    size: linkFontSize,
    font: helv,
    color: rgb(0.12, 0.35, 0.78),
  });
  addUriLink(
    pdfDoc,
    page,
    [rx - (iconSize + 4), ry - 2, rx + wsWidth, ry + linkFontSize + 2],
    `${websiteText}`,
  );

  rx += wsWidth + gap;

  // GitHub icon (filled rounded square + small cutout suggestion)
  const ghCx = rx + iconSize / 2;
  const ghCy = ry + iconSize / 2;
  page.drawCircle({
    x: ghCx,
    y: ghCy,
    size: iconSize / 2,
    color: rgb(0.1, 0.1, 0.12),
  });
  // small "tail" mark
  page.drawRectangle({
    x: ghCx - 0.7,
    y: ghCy - iconSize / 2 - 1.2,
    width: 1.4,
    height: 2,
    color: rgb(0.1, 0.1, 0.12),
  });

  rx += iconSize + 4;
  page.drawText(githubText, {
    x: rx,
    y: ry + 1,
    size: linkFontSize,
    font: helv,
    color: rgb(0.12, 0.35, 0.78),
  });
  addUriLink(
    pdfDoc,
    page,
    [rx - (iconSize + 4), ry - 2, rx + ghWidth, ry + linkFontSize + 2],
    `https://${githubText}`,
  );
}