import { useState, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { degrees, PDFDocument } from "pdf-lib";
import {
  AppShell,
  Group,
  Button,
  Title,
  ActionIcon,
  Text,
} from "@mantine/core";
import { Dropzone, PDF_MIME_TYPE } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import {
  IconFileDownload,
  IconPencil,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
} from "@tabler/icons-react";

import { PdfViewer, type SignatureData } from "./components/PdfViewer";
import { SignatureModal } from "./components/SignatureModal";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [signatures, setSignatures] = useState<SignatureData[]>([]);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  const [isSigning, setIsSigning] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);

  // NEW: Reference to the scrollable area
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

  const changePage = (offset: number) => {
    setPageNumber((prev) => Math.min(Math.max(prev + offset, 1), numPages));
  };

  const handleDrop = async (files: File[]) => {
    const droppedFile = files[0];
    setFile(droppedFile);
    const buffer = await droppedFile.arrayBuffer();
    setPdfBytes(buffer);
    setPageNumber(1);
    setSignatures([]);
  };

  const startSigning = () => {
    if (!currentSignature) {
      setModalOpened(true);
    } else {
      setIsSigning(true);
      notifications.show({
        title: "Signing Mode",
        message: "Click anywhere on the PDF to place your signature.",
      });
    }
  };

  const replaceSignature = () => {
    setModalOpened(true);
    setIsSigning(false);
  };

  const handleSignatureCreated = (dataUrl: string) => {
    setCurrentSignature(dataUrl);
    setIsSigning(true);
    notifications.show({
      title: "Signature Saved",
      message: "Click on the PDF page to place it.",
      color: "green",
    });
  };

  const handleAddSignature = (
    pageNum: number,
    xRatio: number,
    yRatio: number
  ) => {
    if (!currentSignature) return;

    const defaultWidthRatio = 0.2;
    const defaultHeightRatio = 0.1;

    const newSig: SignatureData = {
      id: uuidv4(),
      page: pageNum,
      xRatio: xRatio - defaultWidthRatio / 2,
      yRatio: yRatio - defaultHeightRatio / 2,
      widthRatio: defaultWidthRatio,
      heightRatio: defaultHeightRatio,
      rotation: 0,
      dataUrl: currentSignature,
    };

    setSignatures((prev) => [...prev, newSig]);
    setIsSigning(false);
    notifications.show({
      title: "Placed",
      message: "Drag, resize, or rotate the signature.",
      color: "blue",
    });
  };

  const handleUpdateSignature = (
    id: string,
    updates: Partial<SignatureData>
  ) => {
    setSignatures((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleRemoveSignature = (id: string) => {
    setSignatures((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDownload = async () => {
    if (!pdfBytes) return;

    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      const uniqueUrls = [...new Set(signatures.map((s) => s.dataUrl))];
      const imgMap = new Map();
      for (const url of uniqueUrls) {
        const img = await pdfDoc.embedPng(url);
        imgMap.set(url, img);
      }

      for (const sig of signatures) {
        const page = pages[sig.page - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const img = imgMap.get(sig.dataUrl);

        const pdfWidth = sig.widthRatio * pageWidth;
        const pdfHeight = sig.heightRatio * pageHeight;
        const pdfX = sig.xRatio * pageWidth;
        const pdfY = pageHeight - sig.yRatio * pageHeight - pdfHeight;

        page.drawImage(img, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
          rotate: degrees(-sig.rotation),
        });
      }

      const newPdfBytes = await pdfDoc.save();
      const newBlob = new Blob([newPdfBytes as any], {
        type: "application/pdf",
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(newBlob);
      link.download = `signed-${file?.name || "document.pdf"}`;
      link.click();
    } catch (e) {
      console.error(e);
      notifications.show({
        title: "Error",
        message: "Failed to save PDF",
        color: "red",
      });
    }
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>PDFesign</Title>

          {file && (
            <Group>
              <Group gap="xs" mr="xl">
                <ActionIcon
                  variant="default"
                  onClick={() => changePage(-1)}
                  disabled={pageNumber <= 1}
                >
                  <IconArrowLeft size={16} />
                </ActionIcon>
                <Text size="sm" w={80} ta="center">
                  Page {pageNumber} of {numPages}
                </Text>
                <ActionIcon
                  variant="default"
                  onClick={() => changePage(1)}
                  disabled={pageNumber >= numPages}
                >
                  <IconArrowRight size={16} />
                </ActionIcon>
              </Group>

              <Group gap="xs" mr="xl">
                <ActionIcon variant="default" onClick={zoomOut}>
                  <IconZoomOut size={16} />
                </ActionIcon>
                <Text size="sm" w={40} ta="center">
                  {Math.round(scale * 100)}%
                </Text>
                <ActionIcon variant="default" onClick={zoomIn}>
                  <IconZoomIn size={16} />
                </ActionIcon>
              </Group>

              {currentSignature && (
                <Button
                  variant="default"
                  onClick={replaceSignature}
                  leftSection={<IconRefresh size={16} />}
                >
                  Replace Sign
                </Button>
              )}

              <Button
                leftSection={<IconPencil size={18} />}
                color={isSigning ? "red" : "blue"}
                onClick={isSigning ? () => setIsSigning(false) : startSigning}
              >
                {isSigning ? "Cancel" : "Sign"}
              </Button>

              <Button
                leftSection={<IconFileDownload size={18} />}
                variant="outline"
                onClick={handleDownload}
              >
                Save
              </Button>
              <ActionIcon
                variant="light"
                color="red"
                size="lg"
                onClick={() => {
                  setFile(null);
                  setPdfBytes(null);
                  setSignatures([]);
                  setCurrentSignature(null);
                }}
              >
                <IconX size={20} />
              </ActionIcon>
            </Group>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Main bg="gray.1">
        {!file ? (
          <Dropzone
            onDrop={handleDrop}
            onReject={() =>
              notifications.show({
                title: "Error",
                message: "Invalid file",
                color: "red",
              })
            }
            maxSize={5 * 1024 ** 2}
            accept={PDF_MIME_TYPE}
            h={400}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* ... Dropzone Content ... */}
            <Text size="xl" inline>
              Drag PDF here
            </Text>
          </Dropzone>
        ) : (
          <div
            // 1. Attach the REF here
            ref={scrollViewportRef}
            style={{
              width: "100%",
              height: "calc(100vh - 100px)",
              overflow: "auto",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <PdfViewer
              file={file}
              pageNumber={pageNumber}
              scale={scale}
              onLoadSuccess={setNumPages}
              signatures={signatures}
              onAddSignature={handleAddSignature}
              onUpdateSignature={handleUpdateSignature}
              onRemoveSignature={handleRemoveSignature}
              isSigningMode={isSigning}
              // 2. Pass the REF down
              scrollContainer={scrollViewportRef.current}
            />
          </div>
        )}

        <SignatureModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          onConfirm={handleSignatureCreated}
        />
      </AppShell.Main>
    </AppShell>
  );
}
