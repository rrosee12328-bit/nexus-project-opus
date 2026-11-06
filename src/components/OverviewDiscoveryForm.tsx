import { useState } from "react";
import { discoveryGroups, discoveryQuestions } from "@/lib/discoveryQuestions";
import { overviewDb } from "@/lib/businessOverviews";

export function OverviewDiscoveryForm({ token, preview }: { token?: string; preview: boolean }) {
  const [answers, setAnswers] = useState(() => discoveryQuestions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const completed = answers.filter(answer => answer.trim()).length;
  let offset = 0;
  return <form id="discovery-questionnaire" className="bo-questionnaire" onSubmit={async event => {
    event.preventDefault(); setError("");
    if (preview) { setResult("Preview complete. Nothing was submitted or saved."); return; }
    if (!token) { setError("Open the published overview link to submit answers."); return; }
    setBusy(true);
    try {
      const { data, error } = await overviewDb.rpc("submit_overview_discovery", { p_token: token, p_answers: answers.map(answer => answer.trim()) });
      if (error) throw error;
      if (data !== "submitted" && data !== "already_submitted") throw new Error("Unexpected response");
      setResult(data === "already_submitted" ? "Answers have already been received for this overview. Contact Vektiss if you need to make a correction." : "Thank you. Your answers have been submitted to Vektiss for review.");
    } catch { setError("We could not submit your answers. They are still here. Check your connection and retry, or ask Vektiss whether your link is still active."); }
    finally { setBusy(false); }
  }}>
    <div className="bo-eyebrow">Your next step</div><h2>Help us understand your business.</h2>
    <p>Answer these 18 questions so we can recommend the right scope and priorities. If you are unsure, write “Not sure” or “Not applicable.”</p>
    <p className="bo-form-notice">Business information only. Describe systems and processes, not individual patients. Do not include patient names, medical records, passwords, or other sensitive information.</p>
    {preview && <p className="bo-form-notice">Interactive preview: you can try the form, but nothing will be saved or sent.</p>}
    <p className="bo-form-progress" aria-live="polite">{completed} of 18 answered</p>
    <progress max={18} value={completed} aria-label="Questions answered" />
    {result ? <div role="status" className="bo-form-success">{result}</div> : <>
      {discoveryGroups.map((group, groupIndex) => {
        const start = offset; offset += group.questions.length;
        return <fieldset key={group.title} disabled={busy} className={`bo-form-group bo-tone-${groupIndex % 3}`}>
          <legend><span>{String(groupIndex + 1).padStart(2, "0")}</span> {group.title}</legend>
          {group.questions.map((question, index) => <label key={question} className="bo-form-question" htmlFor={`discovery-${start + index}`}>
            <span>{question}</span>
            <textarea id={`discovery-${start + index}`} required maxLength={3000} rows={3} value={answers[start + index]} placeholder="Not answered" onChange={event => {
              const value = event.target.value; setAnswers(previous => previous.map((answer, i) => i === start + index ? value : answer));
            }} />
          </label>)}
        </fieldset>;
      })}
      {error && <p role="alert" className="bo-form-error">{error}</p>}
      <p className="bo-form-hint">Answers are sent only when you submit. Keep this page open until you finish; unfinished answers are not saved.</p>
      <button className="bo-cta" type="submit" disabled={busy || completed !== 18}>{busy ? "Submitting..." : preview ? "Try submission (preview only)" : "Submit answers to Vektiss"}</button>
    </>}
  </form>;
}
