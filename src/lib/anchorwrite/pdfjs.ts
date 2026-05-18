import * as pdfjsLib from "pdfjs-dist";
// Vite-friendly worker import
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ?url import
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc as unknown as string;

export { pdfjsLib };
