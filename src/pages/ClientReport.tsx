import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDown, Printer } from "lucide-react";
import "./clientReport.css";
import "./reportPresentation.css";
import "./reportEditorial.css";
import {ReportCampaign,ReportCharts,type CampaignOverview,type ReportChart} from "@/components/ReportCampaign";

type Report = {company_name:string;title:string;content:{campaign?:CampaignOverview;charts?:ReportChart[];period:string;headline:string;summary:string;metrics:Array<{label:string;value:string;note:string}>;sections:Array<{title:string;body:string;items?:string[]}>}};
export default function ClientReport() {
  const {token}=useParams();
  const [report,setReport]=useState<Report|null>(null);
  const [state,setState]=useState("loading");
  const [presentation,setPresentation]=useState(false);
  useEffect(()=>{
    let closed: HTMLDetailsElement[]=[];
    const expand=()=>{
      closed=Array.from(document.querySelectorAll<HTMLDetailsElement>(".client-report details:not([open])"));
      closed.forEach(detail=>{detail.open=true;});
    };
    const restore=()=>{closed.forEach(detail=>{detail.open=false;});closed=[];};
    window.addEventListener("beforeprint",expand);
    window.addEventListener("afterprint",restore);
    return ()=>{window.removeEventListener("beforeprint",expand);window.removeEventListener("afterprint",restore);};
  },[]);
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
  return <main className={`client-report ${presentation?"report-presentation":""}`}><div className="report-wrap">
    <button className="presentation-toggle" aria-pressed={presentation} onClick={()=>setPresentation(!presentation)}>{presentation?"Standard view":"Big-screen view"}</button>
    <header className="report-top"><a href="#report" aria-label="Report top"><img src="/vektiss-logo.png" alt="Vektiss" /></a><span>CLIENT REPORT / NOVEMBER 2026</span><button onClick={()=>window.print()}><Printer size={16}/> Print / Save PDF</button></header>
    <section id="report" className="report-hero"><div><p className="report-eyebrow">{report.company_name} / {report.content.period}</p><p className="report-edition">CAMPAIGN BRIEFING</p><h1>{report.content.headline}</h1><p className="hero-summary">{report.content.summary}</p><a href="#results">Explore the results <ArrowDown size={16}/></a></div><aside className="hero-score"><span>THE REPORT AT A GLANCE</span>{report.content.metrics.map(m=><div key={m.label}><strong>{m.value}</strong><p>{m.label}</p><small>{m.note}</small></div>)}<p className="score-note">Reported activity, not verified sales.</p></aside></section>
    {report.content.campaign && <ReportCampaign campaign={report.content.campaign} />}
    <section id="results" className="report-section-heading"><span>02 / PERFORMANCE</span><h2>What the numbers tell us.</h2><p>Completed reporting period: {report.content.period}. These are attributed lead events, not confirmed customers.</p></section>
    {report.content.charts && <ReportCharts charts={report.content.charts} />}
    <section className="report-section-heading"><span>03 / INTERPRETATION & NEXT STEPS</span><h2>The detail behind the decisions.</h2><p>Open any topic for the full findings, recommendations and reporting limitations.</p></section>
    <div className="report-sections">{report.content.sections.map((s,i)=><details id={`section-${i}`} key={s.title} className="report-detail"><summary><span className="report-number">{String(i+1).padStart(2,"0")}</span><h2>{s.title}</h2><span className="detail-plus" aria-hidden="true">+</span></summary><div className="report-detail-body"><p>{s.body}</p>{s.items && <ul>{s.items.map(item=><li key={item}>{item}</li>)}</ul>}</div></details>)}</div>
    <footer>{report.title} · Prepared November 19, 2026<br/>Shared review link. Anyone with this link can view this report. Please share only with intended recipients.</footer>
  </div></main>;
}
