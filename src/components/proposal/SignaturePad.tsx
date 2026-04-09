import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SignaturePadProps {
  signerName: string;
  onSignatureChange: (data: { type: "typed"; value: string } | null) => void;
}

export default function SignaturePad({ signerName, onSignatureChange }: SignaturePadProps) {
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (agreed && signerName.trim()) {
      onSignatureChange({ type: "typed", value: signerName.trim() });
    } else {
      onSignatureChange(null);
    }
  }, [agreed, signerName]);

  return (
    <div className="space-y-4">
      {/* Auto-generated signature preview */}
      <div className="border-2 border-dashed border-border rounded-lg bg-card p-6 text-center">
        <Label className="text-xs text-muted-foreground block mb-2">Digital Signature</Label>
        <p
          className="text-3xl italic text-foreground"
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
        >
          {signerName.trim() || "Your Name"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Legal disclaimer checkbox */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
        <Checkbox
          id="legal-agree"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(!!checked)}
          className="mt-0.5"
        />
        <Label htmlFor="legal-agree" className="text-xs leading-relaxed text-muted-foreground cursor-pointer">
          I, <strong className="text-foreground">{signerName.trim() || "[Your Name]"}</strong>, acknowledge that by checking this box I am providing my electronic signature, which I understand and agree constitutes a legally binding signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA). This signature carries the same legal weight as a handwritten signature.
        </Label>
      </div>
    </div>
  );
}
