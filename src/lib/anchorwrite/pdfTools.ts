import { PDFDocument } from "pdf-lib";

/**
 * Remove the first page of a PDF (used to drop a previously injected
 * AnchorWrite glossary page so re-import shows the original document).
 * Returns the new PDF bytes.
 */
export async function stripFirstPage(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (doc.getPageCount() > 1) {
    doc.removePage(0);
  }
  const out = await doc.save();
  // Return a fresh ArrayBuffer copy
  return out.slice().buffer;
}
