import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { overviewDb, type PublicOverview } from "@/lib/businessOverviews";
import { BusinessOverviewDocument } from "@/components/BusinessOverviewDocument";

export default function BusinessOverview() {
  const { token } = useParams();
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let active = true;
    setState("loading"); setOverview(null);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { setState("missing"); return; }
    overviewDb.rpc("read_business_overview", { p_token: token }).then(({ data, error }) => {
      if (!active) return;
      setOverview(data); setState(error ? "error" : data ? "ready" : "missing");
    });
    return () => { active = false; };
  }, [token]);
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots"; meta.content = "noindex,nofollow,noarchive";
    const referrer = document.createElement("meta");
    referrer.name = "referrer"; referrer.content = "no-referrer";
    document.head.append(meta, referrer);
    return () => { meta.remove(); referrer.remove(); };
  }, []);
  return <main className="min-h-screen bg-[#090c11] px-4 py-8 text-slate-100 sm:py-14">
    {state === "ready" && overview ? <BusinessOverviewDocument key={token} overview={overview} token={token} /> :
      <div className="mx-auto max-w-lg rounded-xl border border-white/10 p-8" role="status">
        <h1 className="text-xl font-semibold">{state === "loading" ? "Loading your overview..." : state === "error" ? "Unable to load overview" : "This overview is unavailable"}</h1>
        {state !== "loading" && <p className="mt-3 text-slate-400">{state === "error" ? "Please refresh and try again." : "The link may have expired or been withdrawn. Ask your Vektiss contact for a new link."}</p>}
      </div>}
  </main>;
}
