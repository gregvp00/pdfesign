import { useRef, useEffect, useState } from "react";
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Alert,
  Loader,
} from "@mantine/core";
import SignatureCanvas from "react-signature-canvas";
import {
  IconCertificate,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";

interface SignatureModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string) => void;
}

// ----------------------------------------
// 1. HELPER: Trim whitespace from signature
// ----------------------------------------
function trimCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const width = canvas.width;
  const height = canvas.height;
  const pixels = ctx.getImageData(0, 0, width, height);
  const length = pixels.data.length;

  let top = null,
    bottom = null,
    left = null,
    right = null;

  for (let i = 0; i < length; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      if (top === null || y < top) top = y;
      if (bottom === null || y > bottom) bottom = y;
      if (left === null || x < left) left = x;
      if (right === null || x > right) right = x;
    }
  }

  if (top === null || bottom === null || left === null || right === null)
    return canvas;

  const newWidth = right - left + 1;
  const newHeight = bottom - top + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = newWidth;
  trimmedCanvas.height = newHeight;

  trimmedCanvas
    .getContext("2d")
    ?.drawImage(
      canvas,
      left,
      top,
      newWidth,
      newHeight,
      0,
      0,
      newWidth,
      newHeight
    );
  return trimmedCanvas;
}

// ----------------------------------------
// 2. MAIN COMPONENT
// ----------------------------------------
export function SignatureModal({
  opened,
  onClose,
  onConfirm,
}: SignatureModalProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [mode, setMode] = useState<"draw" | "cert">("draw");
  const [certStatus, setCertStatus] = useState<
    "idle" | "waiting" | "success" | "error"
  >("idle");
  const [identity, setIdentity] = useState<{
    commonName: string;
    serialNumber: string;
    issuer: string;
  } | null>(null);

  // Canvas Config
  const width = 650;
  const height = 200;
  const scale = 3;

  const applyScale = () => {
    if (sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scale, scale);
      }
    }
  };

  useEffect(() => {
    if (opened && mode === "draw") setTimeout(applyScale, 10);
  }, [opened, mode]);

  // ----------------------------------------
  // 3. HANDLE DIGITAL CERTIFICATE (POPUP)
  // ----------------------------------------
  const openCertPopup = () => {
    setCertStatus("waiting");

    // POINT TO YOUR CADDY SERVER
    const SECURE_URL = "https://cccdev.gregvillar.com";

    // Open the popup
    const popup = window.open(
      SECURE_URL,
      "CertAuthWindow",
      "width=600,height=600,left=200,top=200"
    );

    const handleMessage = (event: MessageEvent) => {
      // SECURITY CHECK
      if (event.origin !== SECURE_URL) return;

      if (event.data?.type === "CERT_SUCCESS") {
        setIdentity(event.data.payload);
        setCertStatus("success");
        popup?.close();
        window.removeEventListener("message", handleMessage);
      }

      if (event.data?.type === "CERT_ERROR") {
        setCertStatus("error");
        popup?.close();
        window.removeEventListener("message", handleMessage);
      }
    };

    window.addEventListener("message", handleMessage);

    const timer = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(timer);
        window.removeEventListener("message", handleMessage);
        setCertStatus((prev) => (prev === "success" ? "success" : "idle"));
      }
    }, 1000);
  };

  // Define your background image path
  const BACKGROUND_IMAGE_URL = "/logoe.png";

  const handleCertConfirm = () => {
    if (!identity) return;

    const canvas = document.createElement("canvas");
    canvas.width = 650;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // --------------------------------------------------------
      // WRAPPER: Logic to draw borders & text
      // --------------------------------------------------------
      const drawStampOverlay = () => {
        // Reset Opacity for text
        ctx.globalAlpha = 1.0;

        // 1. Draw Border
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.strokeRect(5, 5, 640, 190);

        // 2. Vertical Divider Line
        ctx.beginPath();
        ctx.moveTo(325, 20);
        ctx.lineTo(325, 180);
        ctx.lineWidth = 1;
        ctx.stroke();

        // --- HELPER: Split text into lines ---
        const getWrappedLines = (text: string, maxWidth: number) => {
          const words = text.split(" ");
          const lines = [];
          let currentLine = words[0];

          for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
              currentLine += " " + word;
            } else {
              lines.push(currentLine);
              currentLine = word;
            }
          }
          lines.push(currentLine);
          return lines;
        };

        // --- LEFT COLUMN: AUTO-CENTERED NAME ---
        ctx.fillStyle = "#000";
        ctx.font = "600 40px Arial";

        const leftLines = getWrappedLines(identity.commonName, 300);
        const lineHeightLeft = 44;

        // Calculate vertical center for Left
        const totalLeftHeight = leftLines.length * lineHeightLeft;
        let yLeft = (200 - totalLeftHeight) / 2 + 30; // Baseline correction

        for (const line of leftLines) {
          ctx.fillText(line, 20, yLeft);
          yLeft += lineHeightLeft;
        }

        // --- RIGHT COLUMN: WRAPPED & CENTERED ---
        const xRight = 335;
        const maxWidthRight = 300;
        const lineHeightRight = 22;
        const blockSpacing = 6;

        ctx.fillStyle = "#333";
        ctx.font = "18px Arial";

        // Prepare Content & Measure Lines
        const nameLines = getWrappedLines(identity.commonName, maxWidthRight);
        const issuerLines = getWrappedLines(
          `Issuer: ${identity.issuer}`,
          maxWidthRight
        );

        // Calculate Date String
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const datePart = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(
          now.getDate()
        )}`;
        const timePart = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(
          now.getSeconds()
        )}`;
        const offset = -now.getTimezoneOffset();
        const sign = offset >= 0 ? "+" : "-";
        const offH = pad(Math.floor(Math.abs(offset) / 60));
        const offM = pad(Math.abs(offset) % 60);
        const dateString = `Date: ${datePart} ${timePart} ${sign}${offH}'${offM}'`;

        // Calculate Total Height of Right Block
        const totalRightHeight =
          1 * lineHeightRight +
          nameLines.length * lineHeightRight +
          issuerLines.length * lineHeightRight +
          1 * lineHeightRight +
          blockSpacing * 3;

        // Calculate Start Y
        let yRight = (200 - totalRightHeight) / 2 + 15;

        // Draw Content
        ctx.font = "18px Arial";
        ctx.fillText("Digitally signed by", xRight, yRight);
        yRight += lineHeightRight + blockSpacing;

        ctx.font = "18px Arial";
        for (const line of nameLines) {
          ctx.fillText(line, xRight, yRight);
          yRight += lineHeightRight;
        }
        yRight += blockSpacing;

        for (const line of issuerLines) {
          ctx.fillText(line, xRight, yRight);
          yRight += lineHeightRight;
        }
        yRight += blockSpacing;

        ctx.fillText(dateString, xRight, yRight);

        // FINALIZE
        onConfirm(canvas.toDataURL("image/png"));
        onClose();
      };

      // --------------------------------------------------------
      // IMAGE LOADING LOGIC
      // --------------------------------------------------------
      const img = new Image();
      img.src = BACKGROUND_IMAGE_URL;
      img.crossOrigin = "Anonymous";

      img.onload = () => {
        // Draw Image Background (ASPECT RATIO PRESERVED)
        // 1. Calculate scaling to fit within canvas
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        );
        const imgWidth = img.width * scale;
        const imgHeight = img.height * scale;

        // 2. Calculate centering
        const x = (canvas.width - imgWidth) / 2;
        const y = (canvas.height - imgHeight) / 2;

        ctx.save();
        ctx.globalAlpha = 0.3; // 30% Opacity (70% Transparent)
        ctx.drawImage(img, x, y, imgWidth, imgHeight);
        ctx.restore();

        // 3. Draw Text & Borders on top (Opacity reset inside helper)
        drawStampOverlay();
      };

      img.onerror = () => {
        console.warn(
          "Could not load background stamp image. Drawing text only."
        );
        drawStampOverlay();
      };
    }
  };

  const handleDrawConfirm = () => {
    if (sigCanvas.current) {
      const originalCanvas = sigCanvas.current.getCanvas();
      const trimmed = trimCanvas(originalCanvas);
      onConfirm(trimmed.toDataURL("image/png"));
      onClose();
    }
  };

  const handleClear = () => {
    sigCanvas.current?.clear();
    applyScale();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Sign Document"
      centered
      size="auto"
    >
      <Stack gap="md">
        <Group grow>
          <Button
            variant={mode === "draw" ? "filled" : "outline"}
            onClick={() => setMode("draw")}
          >
            Draw Signature
          </Button>
          <Button
            variant={mode === "cert" ? "filled" : "outline"}
            onClick={() => setMode("cert")}
            leftSection={<IconCertificate size={20} />}
          >
            Digital Certificate
          </Button>
        </Group>

        {mode === "draw" ? (
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: 4,
              width: "100%",
              maxWidth: width,
              height: height,
              display: "flex",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <SignatureCanvas
              ref={sigCanvas}
              penColor="black"
              minWidth={1 * scale}
              maxWidth={3 * scale}
              onBegin={applyScale}
              canvasProps={{
                width: width * scale,
                height: height * scale,
                className: "sigCanvas",
                style: { width: width, height: height },
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: 20,
              border: "1px solid #eee",
              borderRadius: 8,
              background: "#f8f9fa",
              minHeight: 200,
              width: width,
              maxWidth: "100%",
            }}
          >
            {certStatus === "idle" && (
              <Stack align="center" justify="center" h={160}>
                <Text size="sm" ta="center">
                  To sign with your digital certificate, click below. A secure
                  window will open.
                </Text>
                <Button onClick={openCertPopup} color="green">
                  Open Secure Gateway
                </Button>
              </Stack>
            )}

            {certStatus === "waiting" && (
              <Stack align="center" justify="center" h={160}>
                <Loader color="blue" />
                <Text size="sm">Waiting for certificate validation...</Text>
                <Text size="xs" c="dimmed">
                  Select your certificate in the popup window
                </Text>
              </Stack>
            )}

            {certStatus === "error" && (
              <Stack align="center" justify="center" h={160}>
                <Alert
                  title="Validation Error"
                  color="red"
                  icon={<IconAlertCircle />}
                >
                  Could not read the certificate or the operation was cancelled.
                </Alert>
                <Button
                  onClick={openCertPopup}
                  variant="outline"
                  color="red"
                  size="xs"
                >
                  Retry
                </Button>
              </Stack>
            )}

            {certStatus === "success" && identity && (
              <Stack>
                <Alert
                  title="Identity Verified"
                  color="green"
                  icon={<IconCheck />}
                >
                  Valid certificate detected.
                </Alert>
                <Text size="sm">
                  <strong>Signer:</strong> {identity.commonName}
                </Text>
                <Text size="sm">
                  <strong>Serial Number:</strong> {identity.serialNumber}
                </Text>
              </Stack>
            )}
          </div>
        )}

        <Group justify="flex-end" mt="md">
          {mode === "draw" && (
            <Button variant="default" onClick={handleClear}>
              Clear
            </Button>
          )}
          <Button
            onClick={mode === "draw" ? handleDrawConfirm : handleCertConfirm}
            disabled={mode === "cert" && certStatus !== "success"}
          >
            {mode === "draw" ? "Use Drawing" : "Stamp Signature"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
