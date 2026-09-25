import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unwrapTranscript } from "./CallSummaryMarkdown";

export function MeetingTranscript({ transcript }: { transcript: string | null }) {
  const [open, setOpen] = useState(false);
  const text = open && transcript ? unwrapTranscript(transcript) : "";
  return (
    <span onClick={(event) => event.stopPropagation()}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <FileText className="mr-2 h-4 w-4" /> Read transcript
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Meeting transcript</DialogTitle>
            <DialogDescription>Staff-only recording transcript. Read and select text here without leaving the portal.</DialogDescription>
          </DialogHeader>
          <div tabIndex={0} role="region" aria-label="Meeting transcript" className="max-h-[65dvh] overflow-y-auto rounded-md border p-4 text-sm leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {text || "The transcript has not synced yet. Use Sync from Fathom on the Calls page after Fathom finishes processing the recording."}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
