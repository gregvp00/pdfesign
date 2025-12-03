import { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Box, LoadingOverlay, Text } from "@mantine/core";
import { DraggableSignature } from "./DraggableSignature";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
};

export interface SignatureData {
  id: string;
  page: number;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  rotation: number;
  dataUrl: string;
}

interface PdfViewerProps {
  file: File | null;
  pageNumber: number;
  scale: number;
  onLoadSuccess: (numPages: number) => void;
  signatures: SignatureData[];
  onAddSignature: (page: number, xRatio: number, yRatio: number) => void;
  onUpdateSignature: (id: string, updates: Partial<SignatureData>) => void;
  onRemoveSignature: (id: string) => void;
  isSigningMode: boolean;
  // NEW PROP
  scrollContainer: HTMLElement | null;
}

export function PdfViewer({
  file,
  pageNumber,
  scale,
  onLoadSuccess,
  signatures,
  onAddSignature,
  onUpdateSignature,
  onRemoveSignature,
  isSigningMode,
  scrollContainer,
}: PdfViewerProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageDimensions, setPageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    onLoadSuccess(numPages);
  }

  const handlePageClick = (e: React.MouseEvent) => {
    if (!isSigningMode || !pageRef.current || !pageDimensions) return;

    const rect = pageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xRatio = clickX / pageDimensions.width;
    const yRatio = clickY / pageDimensions.height;

    onAddSignature(pageNumber, xRatio, yRatio);
  };

  const onPageLoad = (page: any) => {
    setPageDimensions({ width: page.width, height: page.height });
  };

  if (!file) {
    return (
      <Box
        h="100%"
        display="flex"
        style={{ alignItems: "center", justifyContent: "center" }}
        c="dimmed"
      >
        <Text>No PDF loaded.</Text>
      </Box>
    );
  }

  return (
    <Box
      style={{ userSelect: "none", display: "flex", justifyContent: "center" }}
    >
      <Document
        file={file}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={<LoadingOverlay visible={true} />}
        options={pdfOptions}
      >
        <Box
          my="md"
          style={{
            border: "1px solid #ddd",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            position: "relative",
          }}
          ref={pageRef}
        >
          {isSigningMode && (
            <div
              onClick={handlePageClick}
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                cursor: "crosshair",
              }}
            />
          )}

          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={onPageLoad}
          />

          {pageDimensions &&
            signatures
              .filter((s) => s.page === pageNumber)
              .map((sig) => (
                <DraggableSignature
                  key={sig.id}
                  id={sig.id}
                  initialUrl={sig.dataUrl}
                  initialX={sig.xRatio * pageDimensions.width}
                  initialY={sig.yRatio * pageDimensions.height}
                  initialWidth={sig.widthRatio * pageDimensions.width}
                  initialHeight={sig.heightRatio * pageDimensions.height}
                  scale={scale}
                  onRemove={onRemoveSignature}
                  onUpdate={(id, updates) => {
                    const scaledUpdates: any = {};
                    if (updates.x !== undefined)
                      scaledUpdates.xRatio = updates.x / pageDimensions.width;
                    if (updates.y !== undefined)
                      scaledUpdates.yRatio = updates.y / pageDimensions.height;
                    if (updates.width !== undefined)
                      scaledUpdates.widthRatio =
                        updates.width / pageDimensions.width;
                    if (updates.height !== undefined)
                      scaledUpdates.heightRatio =
                        updates.height / pageDimensions.height;
                    if (updates.rotation !== undefined)
                      scaledUpdates.rotation = updates.rotation;
                    onUpdateSignature(id, scaledUpdates);
                  }}
                  // Pass reference down
                  scrollContainer={scrollContainer}
                />
              ))}
        </Box>
      </Document>
    </Box>
  );
}
