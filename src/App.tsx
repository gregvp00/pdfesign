import { useState, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { PDFDocument } from "pdf-lib";
import {
  AppShell,
  Group,
  Button,
  Title,
  ActionIcon,
  Text,
  Modal,
  Progress,
  Stack,
} from "@mantine/core";
import { Dropzone, PDF_MIME_TYPE } from "@mantine/dropzone";
import { notifications } from "@mantine/notifications";
import {
  IconUpload,
  IconFileDownload,
  IconPencil,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconArrowLeft,
  IconArrowRight,
  IconRefresh,
} from "@tabler/icons-react";

import {
  PdfViewer,
  type SignatureData,
  type ExistingSignatureDisplay,
} from "./components/PdfViewer";
import { SignatureModal } from "./components/SignatureModal";
import { signPdf, getExistingSignatures } from "./utils/pdf-signing";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [signatures, setSignatures] = useState<SignatureData[]>([]);
  const [existingSignatures, setExistingSignatures] = useState<
    ExistingSignatureDisplay[]
  >([]);

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  const [isSigning, setIsSigning] = useState(false);
  const [modalOpened, setModalOpened] = useState(false);
  const [currentSignature, setCurrentSignature] = useState<string | null>(null);

  const [signingCredentials, setSigningCredentials] = useState<any>(null);
  const [shouldLock, setShouldLock] = useState(false);

  // Loading State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

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
    setSigningCredentials(null);
    setShouldLock(false);

    // Detect Existing Signatures
    try {
      const found = await getExistingSignatures(buffer);
      setExistingSignatures(found);
      if (found.length > 0) {
        notifications.show({
          title: "Signatures Detected",
          message: `Found ${found.length} existing signatures.`,
        });
      }
    } catch (e) {
      console.warn("Error scanning signatures", e);
    }
  };

  const startSigning = () => {
    // If a signature is already placed, we don't allow adding another one
    if (signatures.length > 0) {
      notifications.show({
        message: "One signature allowed. Use 'Replace' to change.",
        color: "orange",
      });
      return;
    }

    if (!currentSignature) {
      setModalOpened(true);
    } else {
      setIsSigning(true);
      notifications.show({
        title: "Signing Mode",
        message: "Click on the PDF to place your signature.",
      });
    }
  };

  const replaceSignature = () => {
    // Clear current placement to allow new one
    setSignatures([]);
    setModalOpened(true);
    setIsSigning(false);
  };

  const handleSignatureCreated = (dataUrl: string, identityData?: any) => {
    setCurrentSignature(dataUrl);
    if (identityData && identityData.credentials) {
      setSigningCredentials(identityData.credentials);
      setShouldLock(identityData.lockDocument || false);
    } else {
      // Clear credentials if switched to Draw mode
      setSigningCredentials(null);
      setShouldLock(false);
    }
    setIsSigning(true);
    notifications.show({
      title: "Signature Prepared",
      message: identityData
        ? "Certificate Loaded. Click to stamp."
        : "Drawing Saved. Click to stamp.",
      color: "green",
    });
  };

  const handleAddSignature = (
    pageNum: number,
    xRatio: number,
    yRatio: number,
    pageWidth: number,
    pageHeight: number
  ) => {
    if (!currentSignature) return;
    if (signatures.length > 0) return; // Prevent multiple

    const img = new Image();
    img.src = currentSignature;

    img.onload = () => {
      const imgAspect = img.width / img.height;
      const defaultWidthRatio = 0.2;
      const signatureWidthPx = pageWidth * defaultWidthRatio;
      const signatureHeightPx = signatureWidthPx / imgAspect;
      const defaultHeightRatio = signatureHeightPx / pageHeight;

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

      setSignatures([newSig]); // Only one signature allowed
      setIsSigning(false);
      notifications.show({
        title: "Placed",
        message: "Signature placed. You can now Save.",
        color: "blue",
      });
    };
  };

  const handleUpdateSignature = (
    id: string,
    updates: Partial<SignatureData>
  ) => {
    setSignatures((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const handleRemoveSignature = () => {
    setSignatures([]);
  };

  const handleDownload = async () => {
    if (!pdfBytes) return;
    if (signatures.length === 0) {
      notifications.show({
        title: "No Signatures",
        message: "Please place signature before saving.",
        color: "red",
      });
      return;
    }

    setIsExporting(true);
    setExportProgress(10);

    try {
      const signatureToSign = signatures[0];
      const processingBuffer = pdfBytes; // Original buffer

      setExportProgress(40);

      if (signingCredentials) {
        // DIGITAL SIGNATURE FLOW
        const tempDoc = await PDFDocument.load(processingBuffer);
        const page = tempDoc.getPages()[signatureToSign.page - 1];
        const { width, height } = page.getSize();

        const pdfX = signatureToSign.xRatio * width;
        const pdfY =
          height -
          signatureToSign.yRatio * height -
          signatureToSign.heightRatio * height;
        const pdfW = signatureToSign.widthRatio * width;
        const pdfH = signatureToSign.heightRatio * height;

        const fetchRes = await fetch(signatureToSign.dataUrl);
        const blob = await fetchRes.blob();
        const imagePng = new Uint8Array(await blob.arrayBuffer());

        setExportProgress(70);

        const signedPdfBytes = await signPdf(
          processingBuffer,
          signingCredentials,
          {
            pageIndex: signatureToSign.page - 1,
            rect: [pdfX, pdfY, pdfW, pdfH],
            imagePng: imagePng,
          },
          shouldLock
        );

        downloadFile(signedPdfBytes, "signed");
      } else {
        // VISUAL ONLY FLOW
        const pdfDoc = await PDFDocument.load(processingBuffer);
        const pages = pdfDoc.getPages();
        const page = pages[signatureToSign.page - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();

        const img = await pdfDoc.embedPng(signatureToSign.dataUrl);

        const pdfX = signatureToSign.xRatio * pageWidth;
        const pdfY =
          pageHeight -
          signatureToSign.yRatio * pageHeight -
          signatureToSign.heightRatio * pageHeight;
        const pdfW = signatureToSign.widthRatio * pageWidth;
        const pdfH = signatureToSign.heightRatio * pageHeight;

        page.drawImage(img, { x: pdfX, y: pdfY, width: pdfW, height: pdfH });

        setExportProgress(80);
        const finalBytes = await pdfDoc.save();
        downloadFile(finalBytes, "visual-signed");
      }

      setExportProgress(100);
      notifications.show({
        title: "Success",
        message: "Saved!",
        color: "green",
      });
    } catch (e) {
      console.error(e);
      notifications.show({
        title: "Error",
        message: (e as Error).message,
        color: "red",
      });
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
      }, 1000);
    }
  };

  const downloadFile = (data: Uint8Array | ArrayBuffer, prefix: string) => {
    const newBlob = new Blob([data as any], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(newBlob);
    link.download = `${prefix}-${file?.name || "doc.pdf"}`;
    link.click();
  };

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>PDFesign Desktop</Title>
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
                  Replace
                </Button>
              )}
              <Button
                leftSection={<IconPencil size={18} />}
                color={isSigning ? "red" : "blue"}
                onClick={isSigning ? () => setIsSigning(false) : startSigning}
                disabled={signatures.length > 0}
              >
                {isSigning
                  ? "Cancel"
                  : signatures.length > 0
                  ? "Signed"
                  : "Sign"}
              </Button>
              <Button
                leftSection={<IconFileDownload size={18} />}
                variant="outline"
                onClick={handleDownload}
                loading={isExporting}
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
                  setSigningCredentials(null);
                  setShouldLock(false);
                  setExistingSignatures([]);
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
            <Group justify="center" gap="xl" style={{ pointerEvents: "none" }}>
              <IconUpload size={50} stroke={1.5} />
              <Text size="xl" inline>
                Drag PDF here
              </Text>
            </Group>
          </Dropzone>
        ) : (
          <div
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
              existingSignatures={existingSignatures}
              onAddSignature={handleAddSignature}
              onUpdateSignature={handleUpdateSignature}
              onRemoveSignature={handleRemoveSignature}
              isSigningMode={isSigning}
              scrollContainer={scrollViewportRef.current}
            />
          </div>
        )}
        <SignatureModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          onConfirm={handleSignatureCreated}
        />
        <Modal
          opened={isExporting}
          onClose={() => {}}
          withCloseButton={false}
          centered
          title="Processing Document"
        >
          <Stack>
            <Text size="sm">Encrypting and signing...</Text>
            <Progress value={exportProgress} animated />
          </Stack>
        </Modal>
      </AppShell.Main>
    </AppShell>
  );
}
