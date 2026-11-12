import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type IntakeUpload = { id: string; file_name: string; category: string; purpose?: string | null; storage_path?: string };
export function IntakeUploads({ token, category, files, busy, onBusy, onUploaded }: { token:string; category:string; files:IntakeUpload[]; busy:boolean; onBusy:(v:boolean)=>void; onUploaded:(file:IntakeUpload)=>void }) {
  const [error,setError]=useState("");
  const [customPurpose,setCustomPurpose]=useState("");
  const uploadPurpose=customPurpose.trim() || "Anything else to upload?";
  return <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-2">
    <label htmlFor={`upload-${category}`} className="block font-semibold">{category==="logo" ? "Upload company logo" : category==="photos" ? "Upload company / team photos" : "Upload additional files"}</label>
    <p className="text-xs text-muted-foreground">Choose files from your phone or computer. PNG, JPG, WEBP, GIF, or PDF. Up to 10 MB each, 20 files total. Files are uploaded immediately and privately attached to this questionnaire.</p>
    {category==="materials" && <div className="space-y-2">
      <label htmlFor="upload-purpose" className="block text-sm font-medium">Short description (optional)</label>
      <input id="upload-purpose" value={customPurpose} maxLength={500} disabled={busy} onChange={e=>setCustomPurpose(e.target.value)} placeholder="e.g. Service brochure" className="w-full rounded-md border bg-background p-2 text-sm" />
    </div>}
    <input id={`upload-${category}`} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf" disabled={busy} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" onChange={async event=>{
      const selected=Array.from(event.target.files||[]);event.target.value="";setError("");onBusy(true);
      try { for(const file of selected) {
        if(file.size>10485760) throw new Error(`${file.name}: maximum size is 10 MB.`);
        const body=new FormData();body.append("token",token);body.append("category",category);body.append("file",file);
        body.append("purpose",uploadPurpose);
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
    <ul className="text-sm space-y-1">{files.filter(f=>f.category===category).map(f=><li key={f.id} className="break-all">{f.purpose || "Uploaded"}: {f.file_name}</li>)}</ul>
  </div>;
}

export function StaffIntakeUploads({ formId, category }: {formId:string; category?:string}) {
  const {data:files,error,isLoading,refetch}=useQuery({queryKey:["intake-uploads",formId],queryFn:async()=>{
    const {data,error}=await supabase.from("intake_uploads" as never).select("id,file_name,category,storage_path,purpose").eq("intake_form_id",formId).eq("status","ready");if(error)throw error;return data as unknown as IntakeUpload[];
  }});
  if(error)return <p className="text-sm text-destructive">Unable to load uploaded materials. Please reopen this response to retry.</p>;
  if(isLoading)return <p className="text-sm text-muted-foreground">Loading attachments...</p>;
  const matchingFiles=(files || []).filter(file=>!category || file.category===category);
  if(!matchingFiles.length)return <p className="text-xs text-muted-foreground">No files uploaded{category ? " here" : ""}.</p>;
  return <section className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3"><h3 className="text-sm font-semibold">Attachments ({matchingFiles.length})</h3>{matchingFiles.map(file=><div key={file.id} className="space-y-3 rounded-md border bg-background p-3"><FilePurpose file={file} onSaved={()=>{void refetch();}} /><div className="flex flex-col sm:flex-row sm:items-center gap-2"><span className="min-w-0 flex-1 text-sm break-all">{file.file_name}</span><Button className="shrink-0" size="sm" variant="outline" onClick={async()=>{
    const {data,error}=await supabase.storage.from("intake-materials").createSignedUrl(file.storage_path!,60,{download:file.file_name});
    if(error || !data){toast.error("Could not download file");return;}
    const a=document.createElement("a");a.href=data.signedUrl;a.rel="noreferrer";a.click();
  }}>Download</Button></div></div>)}</section>;
}

function FilePurpose({file,onSaved}:{file:IntakeUpload;onSaved:()=>void}) {
  const label=file.purpose || (file.category==="logo" ? "Company logo" : file.category==="photos" ? "Company / team photos" : "Purpose not recorded - label this file");
  const [editing,setEditing]=useState(false);
  const [value,setValue]=useState("");
  const [saving,setSaving]=useState(false);
  return <div className="space-y-2"><p className="text-sm font-semibold">{label}</p>{editing ? <form className="space-y-2" onSubmit={async e=>{
    e.preventDefault();if(!value.trim())return;setSaving(true);
    try {
      const {data,error}=await supabase.from("intake_uploads" as never).update({purpose:value.trim()} as never).eq("id",file.id).select("id");
      if(error || !data?.length)throw error || new Error("Not saved");
      onSaved();setEditing(false);toast.success("File label saved");
    } catch {toast.error("Could not save file label");} finally {setSaving(false);}
  }}><input aria-label={`Purpose for ${file.file_name}`} required maxLength={500} value={value} onChange={e=>setValue(e.target.value)} className="w-full rounded-md border bg-background p-2 text-sm" placeholder="What is this file, or which question does it answer?" /><div className="flex gap-2"><Button size="sm" disabled={saving || !value.trim()}>Save label</Button><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={()=>setEditing(false)}>Cancel</Button></div></form> : <Button size="sm" variant="outline" onClick={()=>{setValue(file.purpose || (file.category==="materials" ? "" : label));setEditing(true);}}>Edit purpose / question</Button>}</div>;
}
