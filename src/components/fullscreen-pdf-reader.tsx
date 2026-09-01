"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { CompactAudioPlayer } from "@/components/audio-player";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type FullscreenPdfReaderProps = {
  fileName: string;
  headerAudioControls?: React.ReactNode;
  onClose: () => void;
  title: string;
  url: string;
};

export function FullscreenPdfReader({ fileName, headerAudioControls, onClose, title, url }: FullscreenPdfReaderProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState<number>();
  const [pageError, setPageError] = useState(false);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-close-button]")?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [close]);

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return;

    const updateWidth = () => setPageWidth(Math.max(1, Math.floor(container.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const hasReadablePages = numPages !== null && numPages > 0;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex flex-col bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-reader-title"
      aria-describedby="pdf-reader-description"
    >
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-zinc-950/95 px-3 shadow-xl shadow-black/25 sm:gap-4 sm:px-6">
        <button
          type="button"
          data-close-button
          onClick={close}
          aria-label="Cerrar lector de partitura"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-4"
        >
          Cerrar
        </button>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 id="pdf-reader-title" className="truncate font-semibold text-white">{title}</h2>
          <p id="pdf-reader-description" className="truncate text-xs text-zinc-500">Partitura · {fileName}</p>
        </div>
        <span className="min-w-14 shrink-0 text-right text-sm tabular-nums text-zinc-400" aria-live="polite">
          {hasReadablePages ? `${pageNumber} / ${numPages}` : ""}
        </span>
      </header>

      {headerAudioControls ? (
        <div className="shrink-0 border-b border-white/10 bg-zinc-950 px-3 py-3 sm:px-6">
          {headerAudioControls}
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-900 px-3 pb-8 pt-3 sm:px-6 sm:pb-10 sm:pt-6">
        <div ref={pageContainerRef} className="mx-auto flex w-full max-w-6xl justify-center">
          <Document
            file={url}
            loading={<ReaderStatus>Cargando PDF…</ReaderStatus>}
            error={<ReaderError>No se pudo cargar el PDF. El archivo puede ser inválido o no estar disponible.</ReaderError>}
            noData={<ReaderError>La dirección del PDF es inválida o no está disponible.</ReaderError>}
            onLoadSuccess={({ numPages: loadedPageCount }) => {
              setPageError(false);
              setNumPages(loadedPageCount);
              setPageNumber(1);
            }}
            onLoadError={() => {
              setNumPages(null);
            }}
          >
            {numPages === 0 ? (
              <ReaderError>Este PDF no contiene páginas legibles.</ReaderError>
            ) : hasReadablePages && pageWidth ? (
              pageError ? (
                <ReaderError>No se pudo mostrar esta página del PDF.</ReaderError>
              ) : (
                <Page
                  key={pageNumber}
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  loading={<ReaderStatus>Cargando página {pageNumber}…</ReaderStatus>}
                  onRenderError={() => setPageError(true)}
                  canvasRef={(canvas) => {
                    if (canvas) canvas.style.height = "auto";
                  }}
                />
              )
            ) : null}
          </Document>
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-zinc-950 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(0,0,0,0.25)] sm:px-6 sm:pt-3">
        {!headerAudioControls ? <CompactAudioPlayer /> : null}
        <div className={`${headerAudioControls ? "" : "mt-2 border-t border-white/[0.07] pt-2 sm:mt-3 sm:pt-3"} grid min-h-12 grid-cols-[1fr_auto_1fr] items-center gap-2`}>
        <button
          type="button"
          onClick={() => {
            setPageError(false);
            setPageNumber((current) => Math.max(1, current - 1));
          }}
          disabled={!hasReadablePages || pageNumber === 1}
          aria-label="Página anterior"
          className="min-h-12 justify-self-start rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-5 sm:text-base"
        >
          <span className="sm:hidden">Ant.</span><span className="hidden sm:inline">Anterior</span>
        </button>
        <p className="text-center text-sm font-semibold tabular-nums text-zinc-300" aria-live="polite">
          {hasReadablePages ? <><span className="sm:hidden">Pág. {pageNumber}/{numPages}</span><span className="hidden sm:inline">Página {pageNumber} de {numPages}</span></> : "—"}
        </p>
        <button
          type="button"
          onClick={() => {
            setPageError(false);
            setPageNumber((current) => Math.min(numPages ?? current, current + 1));
          }}
          disabled={!hasReadablePages || pageNumber === numPages}
          aria-label="Página siguiente"
          className="min-h-12 justify-self-end rounded-full bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-5 sm:text-base"
        >
          <span className="sm:hidden">Sig.</span><span className="hidden sm:inline">Siguiente</span>
        </button>
        </div>
      </footer>
    </div>
  );
}

function ReaderStatus({ children }: { children: React.ReactNode }) {
  return <div role="status" className="grid min-h-64 w-full place-items-center text-center text-sm text-zinc-400">{children}</div>;
}

function ReaderError({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="grid min-h-64 w-full place-items-center px-6 text-center text-sm text-rose-300">{children}</div>;
}
