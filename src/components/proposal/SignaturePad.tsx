import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eraser, Type, PenTool } from "lucide-react";

interface SignaturePadProps {
  onSignatureChange: (data: { type: "typed" | "drawn"; value: string } | null) => void;
}

export default function SignaturePad({ onSignatureChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [mode, setMode] = useState<"type" | "draw">("type");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (hasDrawn && canvasRef.current) {
      onSignatureChange({ type: "drawn", value: canvasRef.current.toDataURL("image/png") });
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasDrawn(false);
    onSignatureChange(null);
  };

  const handleTypedChange = (val: string) => {
    setTypedName(val);
    if (val.trim()) {
      onSignatureChange({ type: "typed", value: val.trim() });
    } else {
      onSignatureChange(null);
    }
  };

  const handleModeChange = (val: string) => {
    setMode(val as "type" | "draw");
    onSignatureChange(null);
    setTypedName("");
    clearCanvas();
  };

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="type" className="text-xs gap-1.5">
            <Type className="h-3.5 w-3.5" /> Type Signature
          </TabsTrigger>
          <TabsTrigger value="draw" className="text-xs gap-1.5">
            <PenTool className="h-3.5 w-3.5" /> Draw Signature
          </TabsTrigger>
        </TabsList>

        <TabsContent value="type" className="mt-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type your full legal name</Label>
            <Input
              value={typedName}
              onChange={(e) => handleTypedChange(e.target.value)}
              placeholder="Your full legal name"
              className="text-xl font-serif italic h-14 px-4"
            />
          </div>
        </TabsContent>

        <TabsContent value="draw" className="mt-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Draw your signature below</Label>
              <Button variant="ghost" size="sm" onClick={clearCanvas} className="h-7 text-xs gap-1">
                <Eraser className="h-3 w-3" /> Clear
              </Button>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg bg-card overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full cursor-crosshair touch-none"
                style={{ height: 140 }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Use your mouse or finger to draw your signature
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
