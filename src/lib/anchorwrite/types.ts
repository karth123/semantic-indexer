export interface BoundingBox {
  id: string;
  page: number; // 1-indexed
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
}

export const emptyAnchors = (): AnchorData => ({
  version: 1,
  pageTags: {},
  boxes: [],
});
