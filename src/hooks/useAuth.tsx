import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "ops" | "client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoleWithRetry = useCallback(async (userId: string, attempt = 0): Promise<AppRole | null> => {
    try {
      // Safari sometimes throws "Load failed" spuriously on the first fetch after
      // page restore. Retry with backoff before giving up.
      const { data, error } = await supabase.rpc("get_user_role", { _user_id: userId });
      if (error) throw error;
      return (data as AppRole) ?? null;
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        return fetchRoleWithRetry(userId, attempt + 1);
      }
      console.error("Role fetch error after retries:", err);
      return null;
    }
  }, []);

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setRole(null);
      return;
    }

    const nextRole = await fetchRoleWithRetry(nextSession.user.id);
    setRole(nextRole);
  }, [fetchRoleWithRetry]);

  useEffect(() => {
    let mounted = true;

    // Safety net: never let the spinner hang forever on Safari if a fetch
    // silently stalls. Force loading=false after 8s no matter what.
    const safetyTimer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 8000);

    const bootstrapAuth = async () => {
      try {
        const {
          data: { session: restoredSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        await applySession(restoredSession);
      } catch (error) {
        console.error("Auth bootstrap failed:", error);
        if (mounted) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Let bootstrapAuth handle initial session restore — avoids race condition
      if (event === "INITIAL_SESSION") return;

      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        return;
      }

      void (async () => {
        await applySession(nextSession);
        if (mounted) setLoading(false);
      })();
    });

    void bootstrapAuth();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
