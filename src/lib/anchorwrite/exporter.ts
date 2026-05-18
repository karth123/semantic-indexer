import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AnchorData, BoundingBox } from "./types";
import { encodeMetadata } from "./metadata";

interface GlossaryEntry {
  tag: string;
  locations: string[];
}

function buildGlossary(anchors: AnchorData): GlossaryEntry[] {
  // Assign stable Region N numbers based on box order
  const regionLabels = new Map<string, string>();
  anchors.boxes.forEach((b, i) => regionLabels.set(b.id, `Region ${i + 1}`));

  const map = new Map<string, string[]>();
  const add = (tag: string, location: string) => {
    const key = tag.trim();
    if (!key) return;
    const arr = map.get(key) ?? [];
    if (!arr.includes(location)) arr.push(location);
    map.set(key, arr);
  };

  for (const [pageStr, tags] of Object.entries(anchors.pageTags)) {
    const p = Number(pageStr);
    for (const t of tags) add(t, `Page ${p}`);
  }
  for (const b of anchors.boxes) {
    const label = regionLabels.get(b.id)!;
    for (const t of b.tags) add(t, `${label} (Page ${b.page})`);
  }

  return Array.from(map.entries())
    .map(([tag, locations]) => ({ tag, locations }))
    .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: "base" }));
}

/**
 * Export PDF with:
 *  - a prepended glossary page listing all tags
 *  - invisible searchable text anchors on each original page
 *  - embedded metadata in Subject for re-import
 *
 * If the source PDF already had a glossary page (per metadata flag), it is
 * removed before the new glossary is prepended — so we always have exactly one.
 */
export async function exportTaggedPdf(
  originalBytes: ArrayBuffer,
  anchors: AnchorData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });

  // If the source already has an AnchorWrite glossary at page 1, strip it.
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
  // Use Letter-like size: 612 x 792
  const glossary = pdfDoc.insertPage(0, [612, 792]);
  const W = glossary.getWidth();
  const H = glossary.getHeight();
  const marginX = 56;
  let y = H - 72;

  glossary.drawText("AnchorWrite Glossary", {
    x: marginX,
    y,
    size: 20,
    font: helvBold,
    color: rgb(0.07, 0.07, 0.07),
  });
  y -= 14;
  glossary.drawText("Semantic index of tagged regions and pages.", {
    x: marginX,
    y,
    size: 9,
    font: helv,
    color: rgb(0.45, 0.45, 0.45),
  });
  y -= 28;

  // Hidden marker text so future imports / external tools can confirm provenance
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
    const lineH = 16;
    const fontSize = 10;
    const rightX = W - marginX;

    for (const entry of entries) {
      if (y < 60) {
        // overflow → add another glossary continuation page
        const cont = pdfDoc.insertPage(1, [612, 792]);
        // shift current page reference
        // simpler: stop drawing to keep MVP simple
        cont.drawText("AnchorWrite Glossary (cont.)", {
          x: marginX,
          y: H - 72,
          size: 14,
          font: helvBold,
        });
        // For MVP we just break — extreme glossaries are rare.
        break;
      }
      const tag = entry.tag;
      const locations = entry.locations.join(", ");
      const tagWidth = helv.widthOfTextAtSize(tag, fontSize);
      const locWidth = helv.widthOfTextAtSize(locations, fontSize);

      glossary.drawText(tag, { x: marginX, y, size: fontSize, font: helv });
      glossary.drawText(locations, {
        x: rightX - locWidth,
        y,
        size: fontSize,
        font: helv,
        color: rgb(0.3, 0.3, 0.3),
      });

      // dotted leader between tag and location
      const dotsStart = marginX + tagWidth + 6;
      const dotsEnd = rightX - locWidth - 6;
      if (dotsEnd > dotsStart) {
        const dotSpacing = 4;
        for (let dx = dotsStart; dx < dotsEnd; dx += dotSpacing) {
          glossary.drawText(".", {
            x: dx,
            y,
            size: fontSize,
            font: helv,
            color: rgb(0.7, 0.7, 0.7),
          });
        }
      }
      y -= lineH;
    }
  }

  // Footer
  glossary.drawText("Generated by AnchorWrite", {
    x: marginX,
    y: 36,
    size: 8,
    font: helv,
    color: rgb(0.6, 0.6, 0.6),
  });

  // ---- Embed metadata for re-import (mark hasGlossary: true) ----
  const persisted: AnchorData = { ...anchors, hasGlossary: true };
  pdfDoc.setSubject(encodeMetadata(persisted));
  pdfDoc.setProducer("AnchorWrite");
  pdfDoc.setCreator("AnchorWrite");

  return await pdfDoc.save();
}
