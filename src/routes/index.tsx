import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Tag,
  SquareDashed,
  Download,
  FileText,
  Trash2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { getPdfjs } from "@/lib/anchorwrite/pdfjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { TagInput } from "@/components/anchorwrite/TagInput";
import { exportTaggedPdf } from "@/lib/anchorwrite/exporter";
import { decodeMetadata } from "@/lib/anchorwrite/metadata";
import { stripFirstPage } from "@/lib/anchorwrite/pdfTools";
import { emptyAnchors, type AnchorData, type BoundingBox } from "@/lib/anchorwrite/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB hard limit
const WARN_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB warning

export const Route = createFileRoute("/")({
  component: AnchorWriteApp,
  head: () => ({
    meta: [
      { title: "AnchorWrite — Make handwritten PDFs searchable" },
      {
        name: "description",
        content:
          "Add hidden semantic anchors to scanned handwritten PDFs so Ctrl+F works in any PDF reader.",
      },
    ],
  }),
});

type Mode = "view" | "page-tags" | "box";

interface DraftBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function AnchorWriteApp() {
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1); // multiplier on fit-to-width
  const [anchors, setAnchors] = useState<AnchorData>(emptyAnchors());
  const [mode, setMode] = useState<Mode>("view");
  const [isLoading, setIsLoading] = useState(false);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  // Active box being created or selected
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Load PDF from bytes
  const loadPdfFromBytes = useCallback(async (rawBytes: ArrayBuffer, name: string) => {
    setIsLoading(true);
    try {
      // Peek metadata first to know if there's a glossary page to strip
      let workingBytes = rawBytes;
      let restored: AnchorData | null = null;
      try {
        const peekCopy = rawBytes.slice(0);
        const pdfjsLib = await getPdfjs();
        const peekDoc = await pdfjsLib.getDocument({ data: new Uint8Array(peekCopy) }).promise;
        const meta = await peekDoc.getMetadata();
        const subject: string | undefined = (meta?.info as { Subject?: string } | undefined)?.Subject;
        restored = decodeMetadata(subject);
        await peekDoc.destroy();
      } catch {
        restored = null;
      }

      if (restored?.hasGlossary) {
        // Drop the glossary page so the rendered document matches anchor page numbers
        workingBytes = await stripFirstPage(rawBytes);
      }

      const copy = workingBytes.slice(0);
      const pdfjsLib = await getPdfjs();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(copy) }).promise;

      setPdf(doc);
      setPdfBytes(workingBytes);
      setFileName(name);
      setPage(1);
      setZoom(1);
      setSelectedBoxId(null);
      setDraftBox(null);
      setMode("view");

      if (restored) {
        setAnchors(restored);
        toast.success("Restored existing AnchorWrite tags from this PDF");
      } else {
        setAnchors(emptyAnchors());
      }
    } catch (err) {
      console.error(err);
      toast.error("Could not open this PDF");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      setSizeWarning(null);
      toast.error("Files above 20 MB are currently unsupported for performance reasons.");
      return;
    }

    if (file.size > WARN_SIZE_BYTES) {
      setSizeWarning(
        "Large PDFs may reduce performance. For best experience, use files under 10 MB.",
      );
    } else {
      setSizeWarning(null);
    }

    const buf = await file.arrayBuffer();
    await loadPdfFromBytes(buf, file.name);
  };

  // Render page
  useEffect(() => {
    if (!pdf || !canvasRef.current || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const pageProxy: PDFPageProxy = await pdf.getPage(page);
      if (cancelled) return;
      const containerWidth = containerRef.current!.clientWidth - 32; // padding
      const unscaled = pageProxy.getViewport({ scale: 1 });
      const fitScale = containerWidth / unscaled.width;
      const finalScale = fitScale * zoom;
      const viewport = pageProxy.getViewport({ scale: finalScale });

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      const task = pageProxy.render({ canvasContext: ctx, viewport, canvas });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* cancelled */
      }
      if (!cancelled) {
        setCanvasSize({ w: viewport.width, h: viewport.height });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, page, zoom]);

  // Re-render on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      // bump zoom indirectly by forcing a re-render through state
      setZoom((z) => z);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const numPages = pdf?.numPages ?? 0;

  const pageBoxes = useMemo(
    () => anchors.boxes.filter((b) => b.page === page),
    [anchors.boxes, page],
  );

  const currentPageTags = anchors.pageTags[page] ?? [];

  // Box drawing handlers
  const drawing = useRef<{ startX: number; startY: number } | null>(null);
  // Pan (hand-tool) handlers — active when mode === "view" and the user drags empty PDF area
  const panning = useRef<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const onOverlayMouseDown = (e: React.MouseEvent) => {
    if (mode === "box") {
      if (!overlayRef.current) return;
      const rect = overlayRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      drawing.current = { startX: x, startY: y };
      setDraftBox({ x, y, w: 0, h: 0 });
      setSelectedBoxId(null);
      return;
    }
    // View mode → start panning the scroll container
    if (!containerRef.current) return;
    panning.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    };
    setIsPanning(true);
    e.preventDefault();
  };

  const onOverlayMouseMove = (e: React.MouseEvent) => {
    if (!drawing.current || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { startX, startY } = drawing.current;
    setDraftBox({
      x: Math.min(startX, cx),
      y: Math.min(startY, cy),
      w: Math.abs(cx - startX),
      h: Math.abs(cy - startY),
    });
  };

  const onOverlayMouseUp = () => {
    if (!drawing.current) return;
    drawing.current = null;
    if (draftBox && draftBox.w > 6 && draftBox.h > 6) {
      // Create a real box and select it (tags empty for now)
      const norm: BoundingBox = {
        id: uid(),
        page,
        x: draftBox.x / canvasSize.w,
        y: draftBox.y / canvasSize.h,
        w: draftBox.w / canvasSize.w,
        h: draftBox.h / canvasSize.h,
        tags: [],
      };
      setAnchors((a) => ({ ...a, boxes: [...a.boxes, norm] }));
      setSelectedBoxId(norm.id);
      setDraftBox(null);
      setMode("view");
    } else {
      setDraftBox(null);
    }
  };

  const updateBoxTags = (id: string, tags: string[]) => {
    setAnchors((a) => ({
      ...a,
      boxes: a.boxes.map((b) => (b.id === id ? { ...b, tags } : b)),
    }));
  };

  const deleteBox = (id: string) => {
    setAnchors((a) => ({ ...a, boxes: a.boxes.filter((b) => b.id !== id) }));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  const setPageTags = (tags: string[]) => {
    setAnchors((a) => ({ ...a, pageTags: { ...a.pageTags, [page]: tags } }));
  };

  const onExport = async () => {
    if (!pdfBytes) return;
    try {
      const out = await exportTaggedPdf(pdfBytes, anchors);
      // Bytes copy to satisfy Blob typing
      const blob = new Blob([out.slice().buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = fileName.replace(/\.pdf$/i, "");
      a.download = `${base || "anchorwrite"}.tagged.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported tagged PDF");
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    }
  };

  const selectedBox = pageBoxes.find((b) => b.id === selectedBoxId) ?? null;

  // Empty state
  if (!pdf) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <Toaster />
        <header className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-foreground text-background flex items-center justify-center font-semibold text-sm">
              A
            </div>
            <span className="font-semibold tracking-tight">AnchorWrite</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" strokeWidth={1.25} />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">
              Make handwritten PDFs searchable
            </h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Drop in a scanned PDF, add hidden semantic anchors to pages or regions, and export a
              normal PDF that works with Ctrl+F in any reader.
            </p>
            <label className="mt-8 inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium cursor-pointer hover:opacity-90 transition-opacity">
              <Upload className="h-4 w-4" />
              Upload PDF
              <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
            </label>
            <p className="mt-4 text-xs text-muted-foreground">
              Everything runs locally in your browser. No upload, no account.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground flex flex-col">
      <Toaster />
      {/* Toolbar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70 px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-2">
            <div className="h-6 w-6 rounded-md bg-foreground text-background flex items-center justify-center font-semibold text-[11px]">
              A
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">
              AnchorWrite
            </span>
          </div>

          <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium cursor-pointer hover:bg-accent transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Upload
            <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
          </label>

          <div className="hidden sm:flex items-center text-xs text-muted-foreground max-w-[180px] truncate ml-1">
            {fileName}
          </div>

          <div className="mx-2 h-5 w-px bg-border" />

          {/* Page nav */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-xs tabular-nums text-muted-foreground min-w-[60px] text-center">
              <span className="text-foreground font-medium">{page}</span> / {numPages}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(numPages, p + 1))}
              disabled={page >= numPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mx-2 h-5 w-px bg-border" />

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <div className="text-xs tabular-nums text-muted-foreground min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          <div className="mx-2 h-5 w-px bg-border" />

          {/* Mode toggles */}
          <Button
            variant={mode === "page-tags" ? "default" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setMode(mode === "page-tags" ? "view" : "page-tags")}
          >
            <Tag className="h-3.5 w-3.5" />
            Page tags
          </Button>
          <Button
            variant={mode === "box" ? "default" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setMode(mode === "box" ? "view" : "box")}
          >
            <SquareDashed className="h-3.5 w-3.5" />
            Box tag
          </Button>

          <div className="ml-auto" />

          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Viewer area */}
        <main
          ref={containerRef}
          className="flex-1 overflow-auto p-4 flex flex-col items-center"
        >
          <div
            className="relative shadow-sm rounded-sm bg-white"
            style={{ width: canvasSize.w || undefined }}
          >
            <canvas ref={canvasRef} className="block rounded-sm" />
            {/* Overlay */}
            <div
              ref={overlayRef}
              className={cn(
                "absolute inset-0",
                mode === "box" ? "cursor-crosshair" : "cursor-default",
              )}
              onMouseDown={onOverlayMouseDown}
              onMouseMove={onOverlayMouseMove}
              onMouseUp={onOverlayMouseUp}
              onMouseLeave={onOverlayMouseUp}
            >
              {/* Existing boxes */}
              {pageBoxes.map((b) => {
                const left = b.x * canvasSize.w;
                const top = b.y * canvasSize.h;
                const width = b.w * canvasSize.w;
                const height = b.h * canvasSize.h;
                const selected = selectedBoxId === b.id;
                return (
                  <div
                    key={b.id}
                    className={cn(
                      "absolute rounded-sm transition-colors",
                      selected
                        ? "border-2 border-foreground bg-foreground/5"
                        : "border border-foreground/40 hover:border-foreground/80 hover:bg-foreground/5",
                    )}
                    style={{ left, top, width, height }}
                    onMouseDown={(e) => {
                      if (mode !== "box") {
                        e.stopPropagation();
                        setSelectedBoxId(b.id);
                      }
                    }}
                  />
                );
              })}
              {/* Draft box */}
              {draftBox && (
                <div
                  className="absolute border-2 border-dashed border-foreground bg-foreground/10 rounded-sm pointer-events-none"
                  style={{
                    left: draftBox.x,
                    top: draftBox.y,
                    width: draftBox.w,
                    height: draftBox.h,
                  }}
                />
              )}
            </div>
          </div>
        </main>

        {/* Side panel */}
        <aside className="w-[320px] shrink-0 border-l border-border bg-background flex flex-col overflow-hidden">
          {mode === "page-tags" ? (
            <PanelSection
              title={`Page ${page} tags`}
              subtitle="Apply searchable tags to this whole page."
            >
              <TagInput
                tags={currentPageTags}
                onChange={setPageTags}
                placeholder="Add a tag and press Enter"
                autoFocus
              />
            </PanelSection>
          ) : selectedBox ? (
            <PanelSection
              title="Region tags"
              subtitle="Searchable text will be embedded inside this region."
              right={
                <button
                  onClick={() => deleteBox(selectedBox.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Delete region"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              }
            >
              <TagInput
                tags={selectedBox.tags}
                onChange={(tags) => updateBoxTags(selectedBox.id, tags)}
                placeholder="Add a tag and press Enter"
                autoFocus
              />
            </PanelSection>
          ) : (
            <PanelSection
              title="Regions"
              subtitle={
                mode === "box"
                  ? "Drag on the page to create a region."
                  : "Pick a region to edit, or draw a new one."
              }
            >
              {pageBoxes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No regions on this page yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {pageBoxes.map((b, i) => (
                    <li key={b.id}>
                      <button
                        onClick={() => setSelectedBoxId(b.id)}
                        className="w-full text-left rounded-md border border-border px-2.5 py-2 text-xs hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Region {i + 1}</span>
                          <span className="text-muted-foreground">
                            {b.tags.length} {b.tags.length === 1 ? "tag" : "tags"}
                          </span>
                        </div>
                        {b.tags.length > 0 && (
                          <div className="mt-1 text-muted-foreground truncate">
                            {b.tags.join(", ")}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PanelSection>
          )}

          {/* Always-visible compact summary */}
          <div className="mt-auto border-t border-border p-4 text-xs text-muted-foreground space-y-1">
            <div>
              Page tags:{" "}
              <span className="text-foreground tabular-nums">
                {Object.values(anchors.pageTags).flat().length}
              </span>
            </div>
            <div>
              Regions:{" "}
              <span className="text-foreground tabular-nums">{anchors.boxes.length}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PanelSection({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
