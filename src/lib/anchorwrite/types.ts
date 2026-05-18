export interface BoundingBox {
  id: string;
  page: number; // 1-indexed (page numbers refer to the ORIGINAL document, excluding any AnchorWrite glossary page)
  // normalized coordinates 0..1 in PDF space (origin top-left of page)
  x: number;
  y: number;
  w: number;
  h: number;
  tags: string[];
}

export interface AnchorData {
  version: 1;
  pageTags: Record<number, string[]>; // page number -> tags
  boxes: BoundingBox[];
  /** True if the source PDF had an AnchorWrite glossary page prepended. */
  hasGlossary?: boolean;
}

export const emptyAnchors = (): AnchorData => ({
  version: 1,
  pageTags: {},
  boxes: [],
});
