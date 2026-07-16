import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function Index() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!role) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-semibold text-foreground">Your account is signed in, but no portal role was found.</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Refresh the page after the admin role is added, or sign out and try again.
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign Out
        </Button>
      </div>
    );
  }
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "ops") return <Navigate to="/ops" replace />;
  return <Navigate to="/portal" replace />;
}
