import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ArrowUpRight } from "lucide-react";
import { clientJourney, clientWorkspaceLink } from "@/lib/clientJourney";
import { useClientWorkspace } from "@/hooks/useClientWorkspace";
import { Button } from "@/components/ui/button";
import ProjectDetailDialog from "@/components/projects/ProjectDetailDialog";
import { OpsTaskTimer } from "@/components/ops/OpsTaskTimer";
import { ApprovalsPanel } from "@/components/approvals/ApprovalsPanel";

export function ClientWorkspaceSummary({ clientId, userId, section, onProposal }: {
  clientId: string; userId: string | null; section: string; onProposal: (projectName: string) => void;
}) {
  const { data, isLoading, error, refetch } = useClientWorkspace(clientId);
  const [projectId, setProjectId] = useState<string | null>(null);
  if (isLoading) return <p role="status" className="p-6 text-sm text-muted-foreground">Loading client workspace...</p>;
  if (error || !data) return <div role="alert" className="rounded-xl border p-5">Couldn't load this workspace. <Button variant="outline" onClick={() => void refetch()}>Try again</Button></div>;
  const proposal = data.proposals[0] ?? null;
  const milestones = clientJourney(proposal, userId, data.session?.completed_at ?? null, data.clientCredit);
  const next = data.actions[0];
  const panel = "rounded-2xl border border-border/70 bg-card p-4 sm:p-6 min-w-0";
  if (section === "projects") return <div className="space-y-4">
    {data.projects.length === 0 && <p className={panel}>No projects yet. <Link className="text-primary" to="/admin/projects">Create a project</Link></p>}
    {data.projects.map(project => <article key={project.id} className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="font-semibold break-words">{project.name}</h2><p className="text-sm text-muted-foreground capitalize">{project.status.replace(/_/g, " ")} · {project.progress}% complete</p></div><Button variant="ghost" onClick={() => setProjectId(project.id)}>Open project <ArrowUpRight className="ml-2 h-4 w-4" /></Button></div>
      <div className="mt-4 flex flex-wrap gap-2"><OpsTaskTimer defaultClientId={clientId} defaultProjectId={project.id} /><Button variant="outline" onClick={() => onProposal(project.name)}>Create proposal</Button></div>
      <details className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Client approvals</summary><div className="mt-3"><ApprovalsPanel projectId={project.id} clientId={clientId} /></div></details>
    </article>)}
    <ProjectDetailDialog projectId={projectId} onClose={() => setProjectId(null)} />
  </div>;
  if (section === "conversations") return <section className={panel}><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Recent messages</h2><Link className="text-sm text-primary" to={`/admin/messages?client=${clientId}`}>Open conversation</Link></div>{data.messages.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No messages yet.</p> : data.messages.map(message => <div key={message.id} className="border-b py-4 last:border-0"><p className="whitespace-pre-wrap break-words text-sm">{message.content}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(message.created_at).toLocaleString()}</p></div>)}</section>;
  if (section !== "overview") return null;
  return <div className="space-y-4">
    <section className={`${panel} bg-gradient-to-br from-primary/5 to-card`}><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Next step</p><h2 className="mt-2 text-xl font-semibold">{next?.title || milestones.find(m => !m.complete)?.label && `Review ${milestones.find(m => !m.complete)?.label.toLowerCase()}` || "Client is ready for delivery"}</h2><p className="mt-2 text-sm text-muted-foreground">{next ? `${next.status === "awaiting_review" ? "Submitted for staff review" : "Waiting on client"}${next.due_at ? ` · Due ${new Date(next.due_at).toLocaleString()}` : ""}` : "Verified milestones below show what has been completed."}</p><div className="mt-4 flex flex-wrap gap-2"><OpsTaskTimer defaultClientId={clientId} /><Button variant="outline" onClick={() => onProposal("")}>Create proposal</Button><Button asChild variant="ghost"><Link to={clientWorkspaceLink(clientId, "documents")}>Review agreements</Link></Button></div></section>
    <section className={panel}><h2 className="font-semibold">Client journey</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{milestones.map(item => <div key={item.label} className="flex gap-3">{item.complete ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}<div><p className="text-sm font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{/^\d{4}-/.test(item.detail) ? new Date(item.detail).toLocaleDateString() : item.detail}</p></div></div>)}</div>{proposal?.billing_start_date && <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">Billing starts {proposal.billing_start_date} · Previously paid setup: ${Number(proposal.setup_paid).toFixed(2)}</p>}</section>
    <div className="grid gap-4 md:grid-cols-2">
      <section className={panel}>
        <h2 className="font-semibold">Upcoming calls</h2>
        {data.calls.length ? data.calls.map(call => <p key={call.id} className="mt-3 text-sm break-words">
          {call.title}<span className="block text-xs text-muted-foreground">{call.displayTime}</span>
        </p>) : <p className="mt-3 text-sm text-muted-foreground">No upcoming calls.</p>}
      </section>
      <section className={panel}>
        <h2 className="font-semibold">Tracked time</h2>
        <p className="mt-3 text-2xl font-semibold">{data.time.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">hours in latest {data.time.length} entries</span></p>
        {data.time.slice(0, 3).map(entry => <p key={entry.id} className="mt-2 text-sm break-words">{entry.description || "Time entry"}<span className="block text-xs text-muted-foreground">{entry.entry_date} · {entry.hours} hrs</span></p>)}
      </section>
    </div>
  </div>;
}
