import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const project='ogcgqbrewfzkchwqrrxj';
const management='https://api.supabase.com/v1/projects/'+project;
const base='https://'+project+'.supabase.co';
const access=fs.readFileSync(process.env.HOME+'/.supabase/access-token','utf8').trim();
async function sql(query){const r=await fetch(management+'/database/query',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({query})});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;}
const token=crypto.randomBytes(32).toString('hex');
const [form]=await sql(`insert into public.intake_forms(token,form_type,recipient_name) values ('${token}','website_development','Synthetic upload test') returning id`);
let path;
async function request(token,file,category='logo') {const body=new FormData();body.append('token',token);body.append('category',category);if(file)body.append('file',file);const r=await fetch(base+'/functions/v1/intake-upload',{method:'POST',body});return {status:r.status,data:await r.json()};}
try {
  assert.equal((await request('invalid')).status,403);
  const bad=await request(token,new File(['not an image'],'bad.png',{type:'image/png'}));
  assert.equal(bad.status,400);
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=','base64');
  const uploaded=await request(token,new File([pixel],'synthetic-logo.png',{type:'image/png'}));
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  const [row]=await sql(`select storage_path,status from public.intake_uploads where intake_form_id='${form.id}'`);
  path=row.storage_path;assert.equal(row.status,'ready');
  assert.equal((await request(token)).data.files.length,1);
  const keys=await(await fetch(management+'/api-keys',{headers:{Authorization:'Bearer '+access}})).json();
  const anon=keys.find(k=>k.name==='anon').api_key;
  const denied=await fetch(base+'/rest/v1/intake_uploads?select=id',{headers:{apikey:anon,Authorization:'Bearer '+anon}});
  assert.ok(denied.status===401 || denied.status===403);
  const publicFile=await fetch(base+'/storage/v1/object/public/intake-materials/'+path);
  assert.ok(!publicFile.ok);
  await sql(`update public.intake_forms set status='completed' where id='${form.id}'`);
  assert.equal((await request(token,new File([pixel],'another.png',{type:'image/png'}))).status,403);
  console.log('PASS: upload, persistence, list, invalid link/file, private storage, anonymous denial, closed form');
} finally {
  const keys=await(await fetch(management+'/api-keys',{headers:{Authorization:'Bearer '+access}})).json();
  const service=keys.find(k=>k.name==='service_role').api_key;
  const rows=await sql(`select storage_path from public.intake_uploads where intake_form_id='${form.id}'`);
  if(rows.length){const r=await fetch(base+'/storage/v1/object/intake-materials',{method:'DELETE',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({prefixes:rows.map(r=>r.storage_path)})});assert.ok(r.ok,'Test file cleanup failed');}
  await sql(`delete from public.intake_uploads where intake_form_id='${form.id}'; delete from public.intake_forms where id='${form.id}';`);
  console.log('Synthetic files and records removed; no client emails sent.');
}
