// Client-only dynamic loader for pdf.js. Importing pdfjs-dist at module scope
// breaks SSR because it references DOMMatrix at import time.
import type * as PdfjsLib from "pdfjs-dist";

let pdfjsPromise: Promise<typeof PdfjsLib> | null = null;

export async function getPdfjs(): Promise<typeof PdfjsLib> {
  if (typeof window === "undefined") {
    throw new Error("pdf.js can only be used in the browser");
  }
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // @ts-expect-error - ?url import
      const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc as unknown as string;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}
