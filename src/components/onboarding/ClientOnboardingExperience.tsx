/* eslint-disable @typescript-eslint/no-explicit-any -- New Supabase tables are typed after the migration is deployed. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Loader2, Mic, RotateCcw, Sparkles, Square, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type Question = { key: string; prompt: string; required?: boolean; max_duration_seconds?: number };
type Session = {
  id: string;
  method: "on_demand" | "scheduled_call" | null;
  status: "welcome" | "choose_method" | "in_progress" | "review" | "scheduled" | "completed";
  intro_video_completed_at: string | null;
  current_question_index: number;
  pending_follow_up: string | null;
  pending_follow_up_for_key: string | null;
  approved_summary: string | null;
  scheduled_at: string | null;
};
type Context = {
  client: { id: string; name: string; type: string | null };
  session: Session;
  settings: { welcome_video_url: string | null; calendly_url: string | null };
  questions: Question[];
};
type ResponseRow = { id: string; question_key: string; answer_text: string | null; transcript_text: string | null };

export function ClientOnboardingExperience({ onComplete }: { onComplete: () => void }) {
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState("");
  const [summary, setSummary] = useState("");
  const [consent, setConsent] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const contextQuery = useQuery({
    queryKey: ["my-onboarding-context"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_onboarding_context");
      if (error) throw error;
      return data as Context;
    },
  });
  const context = contextQuery.data;
  const session = context?.session;

  const responsesQuery = useQuery({
    queryKey: ["my-onboarding-responses", session?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("onboarding_responses")
        .select("id, question_key, answer_text, transcript_text").eq("session_id", session!.id).order("created_at");
      if (error) throw error;
      return (data || []) as ResponseRow[];
    },
    enabled: !!session?.id,
  });
  const responses = responsesQuery.data || [];

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-onboarding-context"] }),
      queryClient.invalidateQueries({ queryKey: ["my-onboarding-responses", session?.id] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding-steps"] }),
    ]);
  };

  const updateSession = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await (supabase as any).rpc("update_my_onboarding_session", {
        _session_id: session!.id,
        _updates: updates,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorderRef.current = recorder;
      streamRef.current = stream;
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results as ArrayLike<any>)
            .map((result: any) => result[0]?.transcript || "")
            .join(" ")
            .trim();
          if (transcript) setAnswer(transcript);
        };
        recognitionRef.current = recognition;
        recognition.start();
      }
      setRecordingSeconds(0);
      setRecording(true);
      recorder.start(1000);
    } catch {
      toast.error("Microphone access was not allowed. You can type your answer instead.");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  };

  useEffect(() => {
    if (recording && recordingSeconds >= 180) stopRecording();
  }, [recording, recordingSeconds]);

  const currentQuestion = context?.questions[session?.current_question_index || 0];
  const prompt = session?.pending_follow_up || currentQuestion?.prompt;
  const baseKey = session?.pending_follow_up_for_key || currentQuestion?.key;
  const answeredCount = Math.min(session?.current_question_index || 0, context?.questions.length || 0);

  const submitAnswer = useMutation({
    mutationFn: async () => {
      if (!session || !context || !baseKey || !prompt) return;
      if (!answer.trim() && !audioBlob) throw new Error("Record or type an answer before continuing.");
      const followUpCount = responses.filter((item) => item.question_key.startsWith(`${baseKey}__followup_`)).length;
      const questionKey = session.pending_follow_up ? `${baseKey}__followup_${followUpCount + 1}` : baseKey;
      const existing = responses.find((item) => item.question_key === questionKey);
      const responseId = existing?.id || crypto.randomUUID();
      let recordingPath: string | null = null;

      if (audioBlob) {
        const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
        recordingPath = `${context.client.id}/${session.id}/${responseId}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("onboarding-recordings").upload(recordingPath, audioBlob, {
          contentType: audioBlob.type,
          upsert: true,
        });
        if (uploadError) throw uploadError;
      }

      const payload = {
        id: responseId,
        session_id: session.id,
        client_id: context.client.id,
        question_key: questionKey,
        question_prompt: prompt,
        response_type: audioBlob ? "voice" : "text",
        answer_text: answer.trim() || null,
        transcript_text: audioBlob && answer.trim() ? answer.trim() : null,
        recording_path: recordingPath,
        recording_duration_seconds: audioBlob ? recordingSeconds : null,
        transcription_status: audioBlob ? (answer.trim() ? "completed" : "pending") : "not_needed",
      };
      const { error: responseError } = await (supabase as any).from("onboarding_responses").upsert(payload, { onConflict: "session_id,question_key" });
      if (responseError) throw responseError;

      if (audioBlob && !answer.trim()) {
        const { error: transcriptionError } = await supabase.functions.invoke("transcribe-onboarding-response", { body: { response_id: responseId } });
        if (transcriptionError) throw transcriptionError;
      }
      const { error: interviewError } = await supabase.functions.invoke("onboarding-interview", {
        body: { action: "evaluate", session_id: session.id, response_id: responseId, base_question_key: baseKey },
      });
      if (interviewError) throw interviewError;
    },
    onSuccess: async () => {
      setAnswer("");
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecordingSeconds(0);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generateSummary = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("onboarding-interview", { body: { action: "summarize", session_id: session!.id } });
      if (error) throw error;
      return data.summary as string;
    },
    onSuccess: async (value) => { setSummary(value); await refresh(); },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    if (session?.status === "review" && session.approved_summary && !summary) setSummary(session.approved_summary);
  }, [session?.status, session?.approved_summary, summary]);

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("complete_my_on_demand_onboarding", {
        _session_id: session!.id,
        _approved_summary: summary,
        _consent: consent,
      });
      if (error) throw error;
    },
    onSuccess: async () => { await refresh(); toast.success("Your workspace is ready."); onComplete(); },
    onError: (error: Error) => toast.error(error.message),
  });

  if (contextQuery.isLoading || !context || !session) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  const shell = (children: React.ReactNode) => <div className="relative min-h-[calc(100dvh-3.5rem)] overflow-y-auto bg-grid px-3 py-6 sm:px-6 md:py-10">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-hero-glow" />
    <div className="relative mx-auto max-w-2xl">{children}</div>
  </div>;

  if (session.status === "welcome") return shell(<Card className="overflow-hidden border-primary/20 bg-card/95 p-5 shadow-xl sm:p-8">
    <div className="mb-5 text-center"><p className="kicker">Welcome to Vektiss</p><h1 className="mt-2 text-2xl font-semibold">Let&apos;s get your project ready, {context.client.name}.</h1><p className="mt-2 text-sm text-muted-foreground">Watch this short orientation before choosing how you want to complete onboarding.</p></div>
    {context.settings.welcome_video_url ? <video controls playsInline className="aspect-video w-full rounded-2xl bg-black" src={context.settings.welcome_video_url} onTimeUpdate={(event) => { const video = event.currentTarget; if (video.duration) setVideoProgress(video.currentTime / video.duration); }} onEnded={() => setVideoProgress(1)} /> : <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-primary/25 bg-primary/5 text-center"><div><Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" /><p className="font-medium">Welcome to your Vektiss workspace</p><p className="mt-1 text-xs text-muted-foreground">Your orientation video will appear here.</p></div></div>}
    <Button className="mt-5 w-full gap-2" disabled={!!context.settings.welcome_video_url && videoProgress < 0.9} onClick={() => updateSession.mutate({ intro_video_completed_at: new Date().toISOString(), status: "choose_method" })}>Choose onboarding method <ArrowRight className="h-4 w-4" /></Button>
    {!!context.settings.welcome_video_url && videoProgress < 0.9 && <p className="mt-2 text-center text-xs text-muted-foreground">Watch at least 90% of the orientation to continue.</p>}
  </Card>);

  if (session.status === "choose_method" || (session.method === "scheduled_call" && session.status !== "completed")) return shell(<div className="space-y-5">
    <div className="text-center"><p className="kicker">Choose what works for you</p><h1 className="mt-2 text-2xl font-semibold">Start now or meet with us live.</h1><p className="mt-2 text-sm text-muted-foreground">Both options give your team the information needed to begin.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col border-primary/25 p-5"><Volume2 className="mb-4 h-7 w-7 text-primary" /><h2 className="font-semibold">On-demand onboarding</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">Answer by voice or text now. Review the final brief before anything becomes official.</p><Button className="mt-5" onClick={() => updateSession.mutate({ method: "on_demand", status: "in_progress" })}>Start now</Button></Card>
      <Card className="flex flex-col p-5"><CalendarDays className="mb-4 h-7 w-7 text-primary" /><h2 className="font-semibold">Schedule a live call</h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">Choose a time in Calendly. Your workspace opens after the completed call syncs.</p><Button className="mt-5" variant="outline" disabled={!context.settings.calendly_url} onClick={() => { updateSession.mutate({ method: "scheduled_call" }); window.open(context.settings.calendly_url!, "_blank", "noopener,noreferrer"); }}>{session.method === "scheduled_call" ? "Open Calendly again" : "Choose a time"}</Button>{!context.settings.calendly_url && <p className="mt-2 text-xs text-amber-500">Scheduling link is being configured.</p>}</Card>
    </div>
    {session.method === "scheduled_call" && <Card className="border-sky-500/20 bg-sky-500/5 p-4 text-sm"><p className="font-medium">Waiting for your onboarding call</p><p className="mt-1 text-muted-foreground">After the meeting is completed and synced, the rest of your workspace will open automatically.</p></Card>}
  </div>);

  if (session.status === "review") return shell(<Card className="border-primary/20 p-5 sm:p-7">
    <p className="kicker">Final review</p><h1 className="mt-2 text-2xl font-semibold">Confirm your onboarding brief</h1><p className="mt-2 text-sm text-muted-foreground">Edit anything that does not accurately reflect what you shared.</p>
    <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-5 min-h-[340px] leading-6" />
    <label className="mt-5 flex items-start gap-3 rounded-xl border border-border p-4 text-sm"><Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" /><span>I confirm this brief is accurate and consent to Vektiss securely retaining my original voice recordings with my client record unless deletion is requested.</span></label>
    <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button variant="ghost" onClick={() => updateSession.mutate({ status: "in_progress" })}><ArrowLeft className="mr-2 h-4 w-4" />Back to answers</Button><Button disabled={!consent || !summary.trim() || complete.isPending} onClick={() => complete.mutate()}>{complete.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Approve and open workspace</Button></div>
  </Card>);

  const allQuestionsAnswered = session.current_question_index >= context.questions.length;
  return shell(<Card className="overflow-hidden border-primary/20 bg-card/95 shadow-xl">
    <div className="border-b border-border p-4 sm:p-5"><div className="flex items-center justify-between gap-4"><div><p className="kicker">On-demand onboarding</p><p className="mt-1 text-sm font-medium">Question {Math.min(answeredCount + 1, context.questions.length)} of {context.questions.length}</p></div><span className="text-xs text-muted-foreground">Saved automatically</span></div><Progress value={(answeredCount / Math.max(context.questions.length, 1)) * 100} className="mt-3 h-1.5" /></div>
    <div className="p-4 sm:p-7">
      {allQuestionsAnswered ? <div className="py-8 text-center"><Check className="mx-auto h-10 w-10 text-emerald-500" /><h2 className="mt-4 text-xl font-semibold">Your answers are complete</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">We&apos;ll organize what you shared into a brief for your review. Nothing becomes official until you approve it.</p><Button className="mt-6" disabled={generateSummary.isPending} onClick={() => generateSummary.mutate()}>{generateSummary.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Prepare my brief</Button></div> : <>
        {session.pending_follow_up && <p className="mb-2 text-xs font-medium text-primary">One quick follow-up</p>}
        <h2 className="text-xl font-semibold leading-8">{prompt}</h2>
        <div className="mt-6 rounded-2xl border border-border bg-background/60 p-4">
          {!audioUrl && !recording && <Button variant="outline" className="w-full gap-2 py-6" onClick={startRecording}><Mic className="h-5 w-5" />Answer with your voice</Button>}
          {recording && <div className="text-center"><div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-red-500/15"><Mic className="h-7 w-7 text-red-500" /></div><p className="mt-3 font-mono text-sm">{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")} / 3:00</p><Button variant="destructive" className="mt-3 gap-2" onClick={stopRecording}><Square className="h-4 w-4" />Stop recording</Button></div>}
          {audioUrl && <div><audio controls src={audioUrl} className="w-full" /><Button variant="ghost" size="sm" className="mt-2 gap-2" onClick={() => { URL.revokeObjectURL(audioUrl); setAudioUrl(null); setAudioBlob(null); setRecordingSeconds(0); }}><RotateCcw className="h-3.5 w-3.5" />Record again</Button></div>}
        </div>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or type your answer<span className="h-px flex-1 bg-border" /></div>
        <Textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type here..." className="min-h-28 text-base" />
        <div className="mt-5 flex justify-end"><Button className="gap-2" disabled={submitAnswer.isPending || (!answer.trim() && !audioBlob)} onClick={() => submitAnswer.mutate()}>{submitAnswer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save and continue <ArrowRight className="h-4 w-4" /></>}</Button></div>
      </>}
    </div>
  </Card>);
}
