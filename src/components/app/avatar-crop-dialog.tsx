import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, ZoomIn, RotateCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type Props = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
  saving?: boolean;
};

/**
 * Square 1:1 avatar cropper. Renders the picked file, lets the user zoom/rotate
 * and drag to reframe, then produces a 512×512 JPEG blob for persistence.
 */
export function AvatarCropDialog({ file, onCancel, onConfirm, saving }: Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (!file) { setImageSrc(null); return; }
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setPixels(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_: Area, px: Area) => setPixels(px), []);

  async function handleConfirm() {
    if (!imageSrc || !pixels) return;
    const blob = await getCroppedBlob(imageSrc, pixels, rotation);
    await onConfirm(blob);
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>Drag to reframe, then zoom or rotate to fit.</DialogDescription>
        </DialogHeader>

        <div className="relative w-full h-72 bg-muted rounded-control overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <ZoomIn className="w-6 h-6 text-muted-foreground shrink-0" />
            <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <div className="flex items-center gap-3">
            <RotateCw className="w-6 h-6 text-muted-foreground shrink-0" />
            <Slider value={[rotation]} min={0} max={360} step={1} onValueChange={(v) => setRotation(v[0])} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!pixels || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Rotate + crop the source image and return a 512×512 JPEG blob. */
async function getCroppedBlob(src: string, area: Area, rotation: number): Promise<Blob> {
  const image = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;

  // Rotated bounding box for the full source image.
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = image.width * cos + image.height * sin;
  const bBoxH = image.width * sin + image.height * cos;

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = bBoxW; rotCanvas.height = bBoxH;
  const rctx = rotCanvas.getContext("2d")!;
  rctx.translate(bBoxW / 2, bBoxH / 2);
  rctx.rotate(rad);
  rctx.drawImage(image, -image.width / 2, -image.height / 2);

  const out = document.createElement("canvas");
  const SIZE = 512;
  out.width = SIZE; out.height = SIZE;
  const octx = out.getContext("2d")!;
  octx.drawImage(rotCanvas, area.x, area.y, area.width, area.height, 0, 0, SIZE, SIZE);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))), "image/jpeg", 0.9);
  });
}
