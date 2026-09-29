import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/auth/AuthShell";
import { BriefcaseBusiness, FileSignature, ShieldCheck } from "lucide-react";

export default function Signup() {
  return (
    <AuthShell kicker="VEKTISS / CLIENT ACCESS">
      <Card className="w-full max-w-md border-border/60 bg-card/70 backdrop-blur-xl shadow-glow relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px edge-line" aria-hidden />
        <CardHeader className="text-center space-y-4">
          <img src="/vektiss-logo.png" alt="Vektiss" className="h-20 mx-auto object-contain" />
          <div className="space-y-1">
            <p className="kicker text-[10px] text-muted-foreground">SECURE / INVITATION REQUIRED</p>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              Your workspace starts with your project
            </CardTitle>
          </div>
          <CardDescription className="text-muted-foreground">
            Client accounts are created from an approved proposal or a project invitation from the Vektiss team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3 rounded-lg border border-border/70 p-3">
              <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p><strong>New clients:</strong> use the proposal and payment link sent by Vektiss. Your account invitation follows after the agreement is completed.</p>
            </div>
            <div className="flex gap-3 rounded-lg border border-border/70 p-3">
              <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p><strong>Current clients:</strong> Vektiss will connect your existing project and email you a private activation link.</p>
            </div>
            <div className="flex gap-3 rounded-lg border border-border/70 p-3 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>This keeps every workspace tied to the correct client and project.</p>
            </div>
          </div>
          <Button asChild className="mt-5 w-full">
            <Link to="/login">I already have an account</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
