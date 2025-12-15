import { useRef, useEffect, useState } from "react";
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Alert,
  FileInput,
  PasswordInput,
  Checkbox, // New import
} from "@mantine/core";
import SignatureCanvas from "react-signature-canvas";
import {
  IconCertificate,
  IconAlertCircle,
  IconCheck,
  IconLock,
} from "@tabler/icons-react";
import forge from "node-forge";

interface SignatureModalProps {
  opened: boolean;
  onClose: () => void;
  // Updated signature to accept lock preference
  onConfirm: (
    signatureDataUrl: string,
    p12Details?: {
      commonName: string;
      issuer: string;
      credentials?: any;
      lockDocument?: boolean;
    }
  ) => void;
}

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

export function SignatureModal({
  opened,
  onClose,
  onConfirm,
}: SignatureModalProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [mode, setMode] = useState<"draw" | "cert">("draw");

  // P12 State
  const [p12File, setP12File] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock state (Default Enabled)
  const [lockDocument, setLockDocument] = useState(true);

  const [identity, setIdentity] = useState<{
    commonName: string;
    issuer: string;
    credentials?: any;
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
    if (opened) {
      setError(null);
      setIdentity(null);
      setP12File(null);
      setPassword("");
      setLockDocument(true); // Reset to true on open
    }
  }, [opened, mode]);

  const handleP12Parse = async () => {
    if (!p12File) return;
    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await p12File.arrayBuffer();
      const p12Der = forge.util.createBuffer(arrayBuffer).getBytes();
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      let certBag: any = null;
      for (const safeContents of p12.safeContents) {
        for (const safeBag of safeContents.safeBags) {
          if (safeBag.type === forge.pki.oids.certBag) {
            certBag = safeBag;
            break;
          }
        }
      }

      if (!certBag) throw new Error("No certificate found in P12 file.");

      const cert = certBag.cert;
      const commonNameAttr = cert.subject.attributes.find(
        (attr: any) => attr.shortName === "CN" || attr.name === "commonName"
      );
      const commonName = commonNameAttr ? commonNameAttr.value : "Unknown";

      const issuerAttr = cert.issuer.attributes.find(
        (attr: any) => attr.shortName === "CN" || attr.name === "commonName"
      );
      const issuer = issuerAttr ? issuerAttr.value : "Unknown Issuer";

      let privateKey;
      const keyBags = p12.getBags({
        bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
      });
      const bag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      if (bag) privateKey = bag.key;

      if (!privateKey) throw new Error("No private key found.");

      setIdentity({
        commonName,
        issuer,
        credentials: {
          privateKey,
          certificate: cert,
          certificates: [cert],
        },
      });
      setIsLoading(false);
    } catch (err: any) {
      console.error(err);
      setError("Failed to open P12. Check your password or file format.");
      setIsLoading(false);
    }
  };

  const BACKGROUND_IMAGE_URL = "/logoe.png";

  const handleCertConfirm = () => {
    if (!identity) return;

    const canvas = document.createElement("canvas");
    canvas.width = 650;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const drawStampOverlay = () => {
        ctx.globalAlpha = 1.0;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.strokeRect(5, 5, 640, 190);

        ctx.beginPath();
        ctx.moveTo(325, 20);
        ctx.lineTo(325, 180);
        ctx.lineWidth = 1;
        ctx.stroke();

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

        ctx.fillStyle = "#000";
        ctx.font = "600 40px Arial";

        const leftLines = getWrappedLines(identity.commonName, 300);
        const lineHeightLeft = 44;
        const totalLeftHeight = leftLines.length * lineHeightLeft;
        let yLeft = (200 - totalLeftHeight) / 2 + 30;

        for (const line of leftLines) {
          ctx.fillText(line, 20, yLeft);
          yLeft += lineHeightLeft;
        }

        const xRight = 335;
        const maxWidthRight = 300;
        const lineHeightRight = 22;
        const blockSpacing = 6;

        ctx.fillStyle = "#333";
        ctx.font = "18px Arial";

        const nameLines = getWrappedLines(identity.commonName, maxWidthRight);
        const issuerLines = getWrappedLines(
          `Issuer: ${identity.issuer}`,
          maxWidthRight
        );

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

        let yRight =
          (200 -
            (1 * lineHeightRight +
              nameLines.length * lineHeightRight +
              issuerLines.length * lineHeightRight +
              1 * lineHeightRight +
              blockSpacing * 3)) /
            2 +
          15;

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

        // Pass lock state back
        onConfirm(canvas.toDataURL("image/png"), { ...identity, lockDocument });
        onClose();
      };

      const img = new Image();
      img.src = BACKGROUND_IMAGE_URL;
      img.crossOrigin = "Anonymous";

      img.onload = () => {
        const scale = Math.min(
          canvas.width / img.width,
          canvas.height / img.height
        );
        const imgWidth = img.width * scale;
        const imgHeight = img.height * scale;
        const x = (canvas.width - imgWidth) / 2;
        const y = (canvas.height - imgHeight) / 2;

        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.drawImage(img, x, y, imgWidth, imgHeight);
        ctx.restore();
        drawStampOverlay();
      };

      img.onerror = () => {
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
            Digital Certificate (P12)
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
            {!identity ? (
              <Stack>
                <Text size="sm">
                  Select your .p12 or .pfx certificate file to sign.
                </Text>
                <FileInput
                  label="Certificate File"
                  placeholder="Select .p12 file"
                  accept=".p12,.pfx"
                  value={p12File}
                  onChange={setP12File}
                  leftSection={<IconCertificate size={16} />}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Certificate password"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  leftSection={<IconLock size={16} />}
                />
                {error && (
                  <Alert color="red" icon={<IconAlertCircle />}>
                    {error}
                  </Alert>
                )}
                <Button
                  onClick={handleP12Parse}
                  loading={isLoading}
                  disabled={!p12File}
                >
                  Load Certificate
                </Button>
              </Stack>
            ) : (
              <Stack>
                <Alert
                  title="Certificate Loaded"
                  color="green"
                  icon={<IconCheck />}
                >
                  Ready to sign.
                </Alert>
                <Text size="sm">
                  <strong>Signer:</strong> {identity.commonName}
                </Text>
                <Text size="sm">
                  <strong>Issuer:</strong> {identity.issuer}
                </Text>

                {/* NEW CHECKBOX */}
                <Checkbox
                  label="Lock document after signing"
                  description="Prevent further changes to the document"
                  checked={lockDocument}
                  onChange={(e) => setLockDocument(e.currentTarget.checked)}
                  mt="sm"
                />

                <Button
                  variant="outline"
                  size="xs"
                  color="gray"
                  onClick={() => setIdentity(null)}
                >
                  Change Certificate
                </Button>
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
            disabled={mode === "cert" && !identity}
          >
            {mode === "draw" ? "Use Drawing" : "Stamp & Embed Cert"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
