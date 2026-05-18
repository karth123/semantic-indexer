import { PDFDocument, StandardFonts } from "pdf-lib";
import type { AnchorData } from "./types";
import { encodeMetadata } from "./metadata";

/**
 * Export PDF with invisible searchable text anchors and embedded metadata.
 * - Page tags: invisible text near top of each page.
 * - Box tags: invisible text near the box's top-left (in PDF coords).
 * - Metadata: encoded JSON stored in the Subject info field for re-import.
 */
export async function exportTaggedPdf(
  originalBytes: ArrayBuffer,
  anchors: AnchorData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const pageNum = i + 1;

    const pageTags = anchors.pageTags[pageNum] ?? [];
    if (pageTags.length > 0) {
      const text = pageTags.join(" ");
      // Near top of page (PDF origin bottom-left)
      page.drawText(text, {
        x: 4,
        y: height - 10,
        size: 6,
        font,
        opacity: 0,
      });
    }

    const boxesOnPage = anchors.boxes.filter((b) => b.page === pageNum);
    for (const box of boxesOnPage) {
      if (box.tags.length === 0) continue;
      const text = box.tags.join(" ");
      // box.x, box.y are normalized with origin at TOP-LEFT
      const pdfX = box.x * width;
      const pdfY = height - box.y * height - 6; // shift down a little so it sits in-region
      page.drawText(text, {
        x: Math.max(0, pdfX),
        y: Math.max(0, pdfY),
        size: 6,
        font,
        opacity: 0,
      });
    }
  }

  // Embed metadata for re-import
  pdfDoc.setSubject(encodeMetadata(anchors));
  pdfDoc.setProducer("AnchorWrite");
  pdfDoc.setCreator("AnchorWrite");

  return await pdfDoc.save();
}
