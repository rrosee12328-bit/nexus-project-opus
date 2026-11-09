import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SignaturePadProps {
  companyName: string;
  onSignatureChange: (data: { type: "typed"; value: string } | null) => void;
}

export default function SignaturePad({ companyName, onSignatureChange }: SignaturePadProps) {
  const id = useId();
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>Representative's full name *</Label>
        <Input
          id={`${id}-name`}
          value={signerName}
          placeholder="Enter your full name, not the business name"
          autoComplete="name"
          maxLength={200}
          required
          onChange={(event) => {
            setSignerName(event.target.value);
            setAgreed(false);
            onSignatureChange(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Signing on behalf of {companyName || "the client"}. Enter the name of the person signing this document.
        </p>
      </div>
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
          id={`${id}-agree`}
          checked={agreed}
          disabled={!signerName.trim()}
          onCheckedChange={(checked) => {
            const accepted = checked === true;
            setAgreed(accepted);
            onSignatureChange(accepted && signerName.trim() ? { type: "typed", value: signerName.trim() } : null);
          }}
          className="mt-0.5"
        />
        <Label htmlFor={`${id}-agree`} className="text-xs leading-relaxed text-muted-foreground cursor-pointer">
          I confirm I am authorized to sign on behalf of {companyName || "the client"}.{" "}
          I, <strong className="text-foreground">{signerName.trim() || "[Your Name]"}</strong>, acknowledge that by checking this box I am providing my electronic signature, which I understand and agree constitutes a legally binding signature under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and the Uniform Electronic Transactions Act (UETA). This signature carries the same legal weight as a handwritten signature.
        </Label>
      </div>
    </div>
  );
}
