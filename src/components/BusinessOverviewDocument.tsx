import ReactMarkdown from "react-markdown";
import { ArrowUpRight, Check, Layers, Radio, Sparkles } from "lucide-react";
import type { PublicOverview } from "@/lib/businessOverviews";
import "@/styles/business-overview.css";
import { OverviewDiscoveryForm } from "./OverviewDiscoveryForm";

export function overviewSections(content: string) {
  const sections: { title: string; body: string }[] = [];
  let current = { title: "", body: "" };
  let fence = "";
  // Headings inside fenced examples should not become document cards.
  for (const line of content.split("\n")) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = "";
    }
    const heading = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.title || current.body.trim()) sections.push(current);
      current = { title: heading[1], body: "" };
    } else current.body += `${line}\n`;
  }
  if (current.title || current.body.trim()) sections.push(current);
  return sections;
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown skipHtml components={{ img: () => null, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}</a>, li: ({ children }) => <li><Check aria-hidden="true" size={15} /><span>{children}</span></li> }}>{children}</ReactMarkdown>;
}

export function BusinessOverviewDocument({ overview, preview = false, token }: { overview: PublicOverview; preview?: boolean; token?: string }) {
  const sections = overviewSections(overview.content);
  const icons = [Radio, Layers, Sparkles];
  let opportunityIndex = 0;
  return <article className="business-overview">
    <header className="bo-hero">
      <div className="bo-topline">
        <div className="bo-logo"><img src="/vektiss-logo.png" alt="Vektiss" /></div>
        <span className="bo-pill"><span />{preview ? "Staff preview" : "Prepared for your team"}</span>
      </div>
      <div className="bo-eyebrow">A clearer path forward</div>
      <p className="bo-company">{overview.company_name}</p>
      <h1>{overview.title}</h1>
      <div className="bo-hero-bottom"><span>Understand the opportunity.<br /><strong>Build what matters next.</strong></span><span className="bo-discovery">DISCOVERY STAGE <ArrowUpRight size={18} /></span></div>
    </header>
    <div className="bo-content">
      <div className="bo-section-grid">
        {sections.map((section, index) => {
          const isOpportunity = /^\d{1,2}\s*\/|^Opportunity\s+\d/i.test(section.title);
          const number = isOpportunity ? opportunityIndex++ : -1;
          const Icon = icons[Math.max(number, 0) % icons.length];
          const isNext = /next step/i.test(section.title);
          const isQuestions = /understand|questions|discovery worksheet/i.test(section.title);
          return <section key={index} className={`bo-section ${isOpportunity ? `bo-opportunity bo-tone-${number % 3}` : isNext ? "bo-next" : isQuestions ? "bo-questions" : index === 0 ? "bo-intro" : "bo-roadmap"}`}>
            {isOpportunity && <div className="bo-card-top"><span className="bo-icon"><Icon size={23} /></span><span className="bo-number">{String(number + 1).padStart(2, "0")}</span></div>}
            {section.title && <h2>{section.title.replace(/^\d{1,2}\s*\/\s*/, "")}</h2>}
            <div className="bo-markdown"><Markdown>{section.body}</Markdown></div>
          </section>;
        })}
      </div>
      <footer className="bo-footer">
        <div><span className="bo-eyebrow">From possibility to a plan</span><h2>Your answers shape the next step.</h2><p>Four sections. 18 questions. A clearer picture of what you need.</p></div>
        <a className="bo-cta" href="#discovery-questionnaire">Complete discovery questions <ArrowUpRight size={18} /></a>
      </footer>
      <OverviewDiscoveryForm token={token} preview={preview} />
      <p className="bo-disclaimer">An opportunity overview. Not a contract, invoice, or request for payment.</p>
    </div>
  </article>;
}
