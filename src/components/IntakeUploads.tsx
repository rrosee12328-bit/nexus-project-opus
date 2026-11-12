import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type IntakeUpload = { id: string; file_name: string; category: string; storage_path?: string };
export function IntakeUploads({ token, category, files, busy, onBusy, onUploaded }: { token:string; category:string; files:IntakeUpload[]; busy:boolean; onBusy:(v:boolean)=>void; onUploaded:(file:IntakeUpload)=>void }) {
  const [error,setError]=useState("");
  return <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-2">
    <label htmlFor={`upload-${category}`} className="block font-semibold">{category==="logo" ? "Upload company logo" : category==="photos" ? "Upload company / team photos" : "Upload website materials"}</label>
    <p className="text-xs text-muted-foreground">Choose files from your phone or computer. PNG, JPG, WEBP, GIF, or PDF. Up to 10 MB each, 20 files total. Files are uploaded immediately and privately attached to this questionnaire.</p>
    <input id={`upload-${category}`} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf" disabled={busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" onChange={async event=>{
      const selected=Array.from(event.target.files||[]);event.target.value="";setError("");onBusy(true);
      try { for(const file of selected) {
        if(file.size>10485760) throw new Error(`${file.name}: maximum size is 10 MB.`);
        const body=new FormData();body.append("token",token);body.append("category",category);body.append("file",file);
        const {data,error}=await supabase.functions.invoke("intake-upload",{body});
        if(error || data?.error) {
          const detail=error?.context instanceof Response ? await error.context.json().catch(()=>null) : null;
          throw new Error(detail?.error || data?.error || `Could not upload ${file.name}. Please try again.`);
        }
        onUploaded(data.file);
      }} catch(e){setError(e instanceof Error?e.message:"Upload failed");} finally{onBusy(false);}
    }} />
    {busy && <p role="status" className="text-sm">Uploading files. Please keep this page open...</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="text-sm space-y-1">{files.filter(f=>f.category===category).map(f=><li key={f.id} className="break-all">Uploaded: {f.file_name}</li>)}</ul>
  </div>;
}

export function StaffIntakeUploads({ formId, category }: {formId:string; category?:string}) {
  const {data:files,error,isLoading}=useQuery({queryKey:["intake-uploads",formId],queryFn:async()=>{
    const {data,error}=await supabase.from("intake_uploads" as never).select("id,file_name,category,storage_path").eq("intake_form_id",formId).eq("status","ready");if(error)throw error;return data as unknown as IntakeUpload[];
  }});
  if(error)return <p className="text-sm text-destructive">Unable to load uploaded materials. Please reopen this response to retry.</p>;
  if(isLoading)return <p className="text-sm text-muted-foreground">Loading attachments...</p>;
  const matchingFiles=(files || []).filter(file=>!category || file.category===category);
  if(!matchingFiles.length)return <p className="text-xs text-muted-foreground">No files uploaded{category ? " here" : ""}.</p>;
  return <section className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3"><h3 className="text-sm font-semibold">{category==="logo" ? "Company logo attachments" : category==="photos" ? "Company / team photo attachments" : "Website materials attachments"} ({matchingFiles.length})</h3>{matchingFiles.map(file=><div key={file.id} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border bg-background p-3"><span className="min-w-0 flex-1 text-sm break-all">{file.file_name}</span><Button className="shrink-0" size="sm" variant="outline" onClick={async()=>{
    const {data,error}=await supabase.storage.from("intake-materials").createSignedUrl(file.storage_path!,60,{download:file.file_name});
    if(error || !data){toast.error("Could not download file");return;}
    const a=document.createElement("a");a.href=data.signedUrl;a.rel="noreferrer";a.click();
  }}>Download</Button></div>)}</section>;
}
