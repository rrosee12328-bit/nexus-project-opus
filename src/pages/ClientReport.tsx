import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, Printer } from "lucide-react";
import "./clientReport.css";

type Report = {company_name:string;title:string;content:{period:string;headline:string;summary:string;metrics:Array<{label:string;value:string;note:string}>;sections:Array<{title:string;body:string;items?:string[]}>}};
export default function ClientReport() {
  const {token}=useParams();
  const [report,setReport]=useState<Report|null>(null);
  const [state,setState]=useState("loading");
  useEffect(()=>{
    let active=true;
    setReport(null);setState("loading");
    const meta=document.createElement("meta");meta.name="robots";meta.content="noindex,nofollow,noarchive";
    const ref=document.createElement("meta");ref.name="referrer";ref.content="no-referrer";
    document.head.append(meta,ref);
    if(!token || !/^[a-f0-9]{64}$/.test(token))setState("missing");
    else supabase.rpc("read_client_report" as never,{p_token:token} as never).then(({data,error})=>{
      if(active){setReport(data as unknown as Report);setState(error?"error":data?"ready":"missing");}
    });
    return ()=>{active=false;meta.remove();ref.remove();};
  },[token]);
  if(!report)return <main className="client-report"><div className="report-wrap"><h1>{state==="loading"?"Loading report...":state==="error"?"Could not load report. Please refresh.":"This report is unavailable."}</h1></div></main>;
  return <main className="client-report"><div className="report-wrap">
    <header className="report-top"><a href="#report" aria-label="Report top"><img src="/vektiss-logo.png" alt="Vektiss" /></a><span>CLIENT REPORT / NOVEMBER 2026</span><button onClick={()=>window.print()}><Printer size={16}/> Print / Save PDF</button></header>
    <section id="report" className="report-hero"><p className="report-eyebrow">{report.company_name} / {report.content.period}</p><h1>{report.content.headline}</h1><p>{report.content.summary}</p><a href="#results">Explore the results <ArrowDown size={16}/></a></section>
    <section id="results" aria-label="Campaign results" className="report-metrics">{report.content.metrics.map(m=><article key={m.label}><p>{m.label}</p><strong>{m.value}</strong><small>{m.note}</small></article>)}</section>
    <nav className="report-nav" aria-label="Report sections">{report.content.sections.map((s,i)=><a key={s.title} href={`#section-${i}`}>{s.title}</a>)}</nav>
    <div className="report-sections">{report.content.sections.map((s,i)=><section id={`section-${i}`} key={s.title} className="report-panel"><span className="report-number">{String(i+1).padStart(2,"0")}</span><div><h2>{s.title}</h2><p>{s.body}</p>{s.items && <ul>{s.items.map(item=><li key={item}>{item}</li>)}</ul>}</div></section>)}</div>
    <footer>{report.title} · Prepared November 19, 2026<br/>Shared review link. Anyone with this link can view this report. Please share only with intended recipients.</footer>
  </div></main>;
}
