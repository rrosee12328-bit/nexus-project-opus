export function formatIntakeExport(name: string, response: Record<string, unknown>, files: Array<{file_name:string;purpose?:string|null;category:string}> = []) {
  const lines = ["VEKTISS - INTAKE RESPONSE", name, ""];
  const payload = response.response_payload as {sections?: Array<{title:string;questions:Array<{label:string;answer:string|null}>}>} | null;
  for (const [key,value] of Object.entries(response)) {
    if (["id","intake_form_id","client_id","response_payload"].includes(key) || value == null || value === "" || (Array.isArray(value) && !value.length)) continue;
    const label = key.replace(/_/g," ").replace(/^./,c=>c.toUpperCase());
    lines.push(`${label}: ${typeof value === "object" ? JSON.stringify(value,null,2) : String(value)}`, "");
  }
  for (const section of payload?.sections || []) {
    lines.push(section.title.toUpperCase(), "");
    for (const question of section.questions) lines.push(`Question: ${question.label}`,`Answer: ${question.answer?.trim() || "No written answer provided."}`, "");
  }
  lines.push("ATTACHMENTS", "File contents are downloaded separately from the portal.", "");
  if (!files.length) lines.push("No attachments.");
  for (const file of files) lines.push(`File: ${file.file_name}`, `Purpose / question: ${file.purpose || (file.category === "logo" ? "Company logo" : file.category === "photos" ? "Company / team photos" : "Not recorded")}`, "");
  return lines.join("\n");
}
