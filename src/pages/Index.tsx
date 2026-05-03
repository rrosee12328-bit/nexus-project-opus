import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Landing from "./Landing";

export default function Index() {
  const { user, role, loading } = useAuth();

  if (loading || (user && !role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Landing />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "ops") return <Navigate to="/ops" replace />;
  return <Navigate to="/portal" replace />;
}
