export type CampaignOverview = {offer:string;audience:string;approach:string;journey:string[];angles:string[]};
export type ReportChart = {title:string;note:string;unit:string;rows:Array<{label:string;value:number}>};
export function ReportCampaign({campaign}:{campaign:CampaignOverview}) {
  return <section className="campaign-overview" aria-label="Campaign overview">
    <div className="report-section-heading"><span>01 / THE CAMPAIGN</span><h2>The offer. The audience. The plan.</h2></div>
    <div className="campaign-grid">{[["THE OFFER",campaign.offer],["WHO IT IS FOR",campaign.audience],["WHAT WE ARE DOING",campaign.approach]].map(([title,body],i)=><article key={title}><span className="campaign-index">0{i+1}</span><h2>{title}</h2><p>{body}</p></article>)}</div>
    <article className="campaign-path"><h2>From attention to installation</h2><ol>{campaign.journey.map((step,i)=><li key={step}><b>{i+1}</b><span>{step}</span></li>)}</ol><p>Intended customer journey. Sales and installation outcomes still need verification.</p></article>
    <details className="campaign-path creative-library"><summary>Explore the creative messaging <span>{campaign.angles.length} prepared themes</span></summary><div className="campaign-angles">{campaign.angles.map((angle,i)=><strong key={angle}><span>{String(i+1).padStart(2,"0")}</span>{angle}</strong>)}</div><p>Creative themes and recommendations, not proof that every asset is live.</p></details>
  </section>;
}
export function ReportCharts({charts}:{charts:ReportChart[]}) {
  return <section className="report-charts" aria-label="Performance charts">{charts.map((chart,index)=>{
    const max=Math.max(1,...chart.rows.map(r=>r.value));
    return <figure key={chart.title} className={index===1||index===2?"column-chart":"horizontal-chart"}><span className="chart-kicker">{String(index+1).padStart(2,"0")} / {chart.unit}</span><h2>{chart.title}</h2><p className="chart-unit">Comparison from a zero baseline</p><div className="chart-plot">{chart.rows.map(row=><div key={row.label} className="chart-row"><div><strong>{row.label}</strong><b>{chart.unit==="USD"?`$${row.value.toFixed(2)}`:row.value}</b></div><div className="chart-track" aria-hidden="true"><span style={{width:`${row.value/max*100}%`,height:`${row.value/max*100}%`}} /></div></div>)}</div><figcaption>{chart.note}</figcaption></figure>;
  })}</section>;
}
