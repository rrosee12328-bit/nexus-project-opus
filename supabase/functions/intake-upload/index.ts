import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" },405);
  try {
    // Bound the multipart body even when Content-Length is absent.
    if (!req.body) return reply({ error: "Missing upload" },400);
    const reader=req.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
    while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.length; if(size>11*1024*1024){await reader.cancel();return reply({error:"Files must be 10 MB or smaller"},413);} chunks.push(part.value); }
    const body=await new Response(new Blob(chunks),{headers:{"Content-Type":req.headers.get("content-type")||""}}).formData();
    const token=String(body.get("token")||"");
    if(token.length<20 || token.length>128) return reply({error:"Invalid link"},403);
    const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const {data:form,error}=await db.from("intake_forms").select("id,status,expires_at,form_type").eq("token",token).maybeSingle();
    if(error || !form || form.form_type!=="website_development" || form.status==="completed" || (form.expires_at && Date.parse(form.expires_at)<=Date.now())) return reply({error:"This upload link is unavailable"},403);
    const file=body.get("file");
    if(!file){const {data,error}=await db.from("intake_uploads").select("id,file_name,category,purpose").eq("intake_form_id",form.id).eq("status","ready");if(error)throw error;return reply({files:data});}
    const category=String(body.get("category")||"materials");
    const purpose=category==="logo" ? "Company logo" : category==="photos" ? "Company / team photos" : String(body.get("purpose")||"").trim();
    if(!purpose || purpose.length>500)return reply({error:"Choose what this file is for before uploading (maximum 500 characters)."},400);
    if(!(file instanceof File) || file.size<1 || file.size>10485760) return reply({error:"Choose a file up to 10 MB"},400);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const start=new TextDecoder().decode(bytes.slice(0,12));
    const mime=bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 ? "image/png" : bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? "image/jpeg" : start.startsWith("GIF8") ? "image/gif" : start.startsWith("RIFF") && start.slice(8,12)==="WEBP" ? "image/webp" : start.startsWith("%PDF-") ? "application/pdf" : null;
    const extensions:Record<string,string[]>={"image/png":["png"],"image/jpeg":["jpg","jpeg"],"image/gif":["gif"],"image/webp":["webp"],"application/pdf":["pdf"]};
    const ext=file.name.split(".").pop()?.toLowerCase()||"";
    if(!mime || !extensions[mime].includes(ext)) return reply({error:"Please use PNG, JPG, WEBP, GIF, or PDF files"},400);
    const {data:reserved,error:reserveError}=await db.rpc("reserve_intake_upload",{p_token:token,p_category:String(body.get("category")||"materials"),p_name:file.name.replace(/[\\/\x00-\x1f]/g,"_").slice(0,180),p_size:file.size,p_extension:ext});
    if(reserveError || !reserved) return reply({error:"Upload unavailable. The form may be closed or have reached its 20-file limit."},400);
    const {error:uploadError}=await db.storage.from("intake-materials").upload(reserved.storage_path,bytes,{contentType:mime,upsert:false});
    if(uploadError){await db.from("intake_uploads").delete().eq("id",reserved.id);throw uploadError;}
    const {error:saveError}=await db.from("intake_uploads").update({status:"ready",purpose}).eq("id",reserved.id);
    if(saveError){await db.storage.from("intake-materials").remove([reserved.storage_path]);await db.from("intake_uploads").delete().eq("id",reserved.id);throw saveError;}
    return reply({file:{id:reserved.id,file_name:reserved.file_name,category:reserved.category,purpose}});
  } catch { return reply({error:"Upload failed. Please try again."},500); }
});
