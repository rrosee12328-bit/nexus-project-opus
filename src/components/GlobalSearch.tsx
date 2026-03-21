import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Search, Users, FolderKanban, CheckSquare, MessageSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  type: "client" | "project" | "task" | "message";
  route: string;
}

const typeConfig = {
  client: { icon: Users, label: "Client", color: "text-blue-400" },
  project: { icon: FolderKanban, label: "Project", color: "text-emerald-400" },
  task: { icon: CheckSquare, label: "Task", color: "text-amber-400" },
  message: { icon: MessageSquare, label: "Message", color: "text-purple-400" },
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const pattern = `%${term}%`;

      const [clientsRes, projectsRes, tasksRes, messagesRes] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, email, status")
          .or(`name.ilike.${pattern},email.ilike.${pattern}`)
          .limit(5),
        supabase
          .from("projects")
          .select("id, name, description, status, client_id, clients(name)")
          .ilike("name", pattern)
          .limit(5),
        supabase
          .from("tasks")
          .select("id, title, status, priority, clients(name)")
          .ilike("title", pattern)
          .limit(5),
        supabase
          .from("messages")
          .select("id, content, client_id, created_at, clients(name)")
          .ilike("content", pattern)
          .limit(5),
      ]);

      const mapped: SearchResult[] = [];

      clientsRes.data?.forEach((c) =>
        mapped.push({
          id: c.id,
          title: c.name,
          subtitle: `${c.status}${c.email ? ` · ${c.email}` : ""}`,
          type: "client",
          route: `/admin/clients/${c.id}`,
        })
      );

      projectsRes.data?.forEach((p) =>
        mapped.push({
          id: p.id,
          title: p.name,
          subtitle: `${(p as any).clients?.name ?? "Unknown client"} · ${p.status?.replace("_", " ")}`,
          type: "project",
          route: `/admin/clients/${p.client_id}`,
        })
      );

      tasksRes.data?.forEach((t) =>
        mapped.push({
          id: t.id,
          title: t.title,
          subtitle: `${t.priority} priority · ${t.status?.replace("_", " ")}`,
          type: "task",
          route: t.client_id ? `/admin/clients/${t.client_id}` : `/admin/projects`,
        })
      );

      messagesRes.data?.forEach((m) =>
        mapped.push({
          id: m.id,
          title: m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content,
          subtitle: (m as any).clients?.name ?? "Unknown client",
          type: "message",
          route: `/admin/messages?client=${m.client_id}`,
        })
      );

      setResults(mapped);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(result.route);
  };

  const grouped = {
    client: results.filter((r) => r.type === "client"),
    project: results.filter((r) => r.type === "project"),
    task: results.filter((r) => r.type === "task"),
    message: results.filter((r) => r.type === "message"),
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-muted-foreground hover:text-foreground h-8 px-3 w-full max-w-[240px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="text-sm hidden sm:inline">Search…</span>
        <kbd className="hidden md:inline-flex pointer-events-none h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-auto">
          ⌘K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search clients, projects, tasks, messages…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>No results found for "{query}"</CommandEmpty>
          )}

          {!loading && query.length < 2 && (
            <CommandEmpty>Type at least 2 characters to search…</CommandEmpty>
          )}

          {(Object.entries(grouped) as [keyof typeof typeConfig, SearchResult[]][]).map(
            ([type, items]) => {
              if (items.length === 0) return null;
              const config = typeConfig[type];
              const Icon = config.icon;
              return (
                <CommandGroup key={type} heading={`${config.label}s`}>
                  {items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.type}-${item.id}-${item.title}`}
                      onSelect={() => handleSelect(item)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                        {config.label}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            }
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
