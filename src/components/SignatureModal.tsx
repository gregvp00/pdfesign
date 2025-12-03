import { useRef, useEffect } from "react";
import { Modal, Button, Group, Stack } from "@mantine/core";
import SignatureCanvas from "react-signature-canvas";

interface SignatureModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (signatureDataUrl: string) => void;
}

// Helper: Trim transparent pixels (Keeps the signature tight)
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

  if (top === null || bottom === null || left === null || right === null) {
    return canvas;
  }

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

  // CONFIGURATION
  const width = 400; // Visual width (CSS)
  const height = 200; // Visual height (CSS)
  const scale = 3; // 3x Resolution (1200x600 internal)

  // Force scale application
  const applyScale = () => {
    if (sigCanvas.current) {
      const canvas = sigCanvas.current.getCanvas();
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
        ctx.scale(scale, scale); // Scale 3x
      }
    }
  };

  // Apply scale when modal opens
  useEffect(() => {
    if (opened) {
      // Small timeout ensures canvas is mounted in DOM before we touch context
      setTimeout(applyScale, 10);
    }
  }, [opened]);

  const handleConfirm = () => {
    if (sigCanvas.current) {
      // 1. Get the High-Res Canvas
      const originalCanvas = sigCanvas.current.getCanvas();

      // 2. Trim whitespace (crucial so it doesn't paste as a giant empty box)
      const trimmed = trimCanvas(originalCanvas);

      // 3. Export
      const dataURL = trimmed.toDataURL("image/png");
      onConfirm(dataURL);
      onClose();
    }
  };

  const handleClear = () => {
    sigCanvas.current?.clear();
    applyScale(); // Re-apply scale after clear
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Draw Your Signature"
      centered
    >
      <Stack>
        <div
          style={{ border: "1px solid #ccc", borderRadius: 4, width, height }}
        >
          <SignatureCanvas
            ref={sigCanvas}
            penColor="black"
            // FIX: Increase pen width so it's visible on high-res canvas
            minWidth={1 * scale}
            maxWidth={3 * scale}
            // Ensure scale persists if the library resets context
            onBegin={applyScale}
            canvasProps={{
              width: width * scale, // 1200px Internal
              height: height * scale, // 600px Internal
              className: "sigCanvas",
              style: {
                width: `${width}px`, // 400px Visual
                height: `${height}px`, // 200px Visual
                display: "block",
              },
            }}
          />
        </div>
        <Group justify="flex-end">
          <Button variant="default" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleConfirm}>Use Signature</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
