import { useState, useRef, useEffect } from "react";
import Moveable from "react-moveable";
import { IconX } from "@tabler/icons-react";
import { Button } from "@mantine/core";

interface DraggableSignatureProps {
  id: string;
  initialUrl: string;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  scale: number;
  onUpdate: (id: string, updates: any) => void;
  onRemove: (id: string) => void;
  scrollContainer: HTMLElement | null;
}

export function DraggableSignature({
  id,
  initialUrl,
  initialX,
  initialY,
  initialWidth,
  initialHeight,
  scale,
  onUpdate,
  onRemove,
  scrollContainer,
}: DraggableSignatureProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const [isSelected, setIsSelected] = useState(true);

  // Local state for smooth interactions
  const [translate, setTranslate] = useState([initialX, initialY]);
  const [dims, setDims] = useState([initialWidth, initialHeight]);
  const [rotate, setRotate] = useState(0);

  // Sync state when props change and handle Deselect on Zoom
  useEffect(() => {
    setTranslate([initialX, initialY]);
    setDims([initialWidth, initialHeight]);

    // Deselect when scale (zoom) changes to prevent visual drift
    setIsSelected(false);
  }, [initialX, initialY, initialWidth, initialHeight, scale]);

  return (
    <>
      <div
        ref={targetRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsSelected(true);
        }}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: dims[0],
          height: dims[1],
          transform: `translate(${translate[0]}px, ${translate[1]}px) rotate(${rotate}deg)`,
          cursor: isSelected ? "move" : "pointer",
          zIndex: 10,
          border: isSelected ? "1px dashed #228be6" : "none",
        }}
      >
        <img
          src={initialUrl}
          alt="Signature"
          style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        />

        {isSelected && (
          <Button
            color="red"
            variant="filled"
            size="compact-xs"
            radius="xl"
            leftSection={<IconX size={12} />}
            style={{
              position: "absolute",
              top: -25,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100,
              boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              fontSize: 10,
              height: 22,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(id);
            }}
          >
            Delete
          </Button>
        )}
      </div>

      {isSelected && (
        <Moveable
          target={targetRef.current}
          draggable={true}
          resizable={true}
          rotatable={true}
          keepRatio={true}
          origin={false}
          renderDirections={["nw", "ne", "sw", "se"]}
          // FIX: Conditional Scroll Options to satisfy TypeScript
          scrollable={!!scrollContainer}
          scrollOptions={
            scrollContainer
              ? {
                  container: scrollContainer,
                  threshold: 30,
                  checkScrollEvent: true,
                }
              : undefined
          }
          onDrag={(e) => {
            e.target.style.transform = e.transform;
          }}
          onDragEnd={(e) => {
            const t = e.lastEvent?.translate;
            if (t) {
              setTranslate(t);
              onUpdate(id, { x: t[0], y: t[1] });
            }
          }}
          onResize={(e) => {
            e.target.style.width = `${e.width}px`;
            e.target.style.height = `${e.height}px`;
            e.target.style.transform = e.drag.transform;
          }}
          onResizeEnd={(e) => {
            const t = e.lastEvent?.drag?.translate;
            if (t) {
              setTranslate(t);
              setDims([e.lastEvent.width, e.lastEvent.height]);
              onUpdate(id, {
                x: t[0],
                y: t[1],
                width: e.lastEvent.width,
                height: e.lastEvent.height,
              });
            }
          }}
          onRotate={(e) => {
            e.target.style.transform = e.drag.transform;
          }}
          onRotateEnd={(e) => {
            const t = e.lastEvent?.drag?.translate;
            const r = e.lastEvent?.rotate;
            if (t && r !== undefined) {
              setTranslate(t);
              setRotate(r);
              onUpdate(id, { x: t[0], y: t[1], rotation: r });
            }
          }}
        />
      )}

      {isSelected && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9 }}
          onClick={() => setIsSelected(false)}
        />
      )}
    </>
  );
}
