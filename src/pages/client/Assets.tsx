import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileImage, FileVideo, FileText, FolderOpen } from "lucide-react";

export default function ClientAssets() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets & Deliverables</h1>
        <p className="text-muted-foreground mt-1">Upload files for your projects and access completed deliverables.</p>
      </div>

      {/* Upload zone */}
      <Card className="border-dashed border-2 border-border hover:border-primary/30 transition-colors cursor-pointer group">
        <CardContent className="py-16 flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Drag & drop files here</h3>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse — Logos, brand assets, content, documents
            </p>
          </div>
          <div className="flex gap-6 text-muted-foreground/50 mt-2">
            <div className="flex flex-col items-center gap-1">
              <FileImage className="h-5 w-5" />
              <span className="text-xs">Images</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileVideo className="h-5 w-5" />
              <span className="text-xs">Videos</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileText className="h-5 w-5" />
              <span className="text-xs">Documents</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state for files */}
      <Card className="bg-card/50">
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <FolderOpen className="h-10 w-10 text-muted-foreground/30" />
          <div>
            <p className="font-medium text-muted-foreground">No files yet</p>
            <p className="text-sm text-muted-foreground/70 mt-0.5">
              Upload your first file to get started. Your team can also share deliverables here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
