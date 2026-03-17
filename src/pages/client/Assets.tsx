export default function ClientAssets() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asset Uploads</h1>
        <p className="text-muted-foreground">Upload logos, brand assets, content, and documents for your project.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
        Drag-and-drop file upload with OCR extraction and quality checks will be built here.
      </div>
    </div>
  );
}
