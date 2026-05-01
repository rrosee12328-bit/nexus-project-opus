import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Video, Youtube, Instagram, Music2, FileText, Mail,
  Plus, ExternalLink, Sparkles, Target, Calendar, Search, List,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ContentAsset {
  id: string;
  client_id: string | null;
  offer_id: string | null;
  title: string;
  content_type: string;
  platform: string[] | null;
  status: string;
  script: string | null;
  publish_url: string | null;
  publish_date: string | null;
  hook: string | null;
  offer_cta: string | null;
  notes: string | null;
  ai_generated: boolean;
  created_at: string;
  clients?: { name: string; client_number: string | null } | null;
  offers?: { name: string } | null;
}

interface Offer {
  id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  price_point: string | null;
  offer_type: string;
  status: string;
  url: string | null;
  created_at: string;
  clients?: { name: string; client_number: string | null } | null;
}

interface Client {
  id: string;
  name: string;
  client_number: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  idea: "border-gray-600 text-gray-400",
  scripted: "border-yellow-700 text-yellow-400",
  filmed: "border-blue-700 text-blue-400",
  edited: "border-purple-700 text-purple-400",
  published: "border-green-700 text-green-400",
  repurposed: "border-emerald-700 text-emerald-400",
};

const STATUS_ORDER = ["idea", "scripted", "filmed", "edited", "published", "repurposed"];

const TYPE_ICON: Record<string, JSX.Element> = {
  reel: <Instagram className="h-4 w-4 text-muted-foreground" />,
  youtube: <Youtube className="h-4 w-4 text-muted-foreground" />,
  tiktok: <Music2 className="h-4 w-4 text-muted-foreground" />,
  short: <Video className="h-4 w-4 text-muted-foreground" />,
  blog: <FileText className="h-4 w-4 text-muted-foreground" />,
  email: <Mail className="h-4 w-4 text-muted-foreground" />,
  carousel: <Instagram className="h-4 w-4 text-muted-foreground" />,
};

function AddAssetDialog({
  open, onClose, clients, offers,
}: { open: boolean; onClose: () => void; clients: Client[]; offers: Offer[]; }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", content_type: "reel", status: "idea",
    client_id: "", offer_id: "", hook: "", offer_cta: "",
    script: "", notes: "", publish_url: "", publish_date: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("content_assets").insert({
        ...form,
        client_id: form.client_id || null,
        offer_id: form.offer_id || null,
        publish_date: form.publish_date || null,
        publish_url: form.publish_url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content_assets"] });
      toast.success("Content asset added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle>New Content Asset</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Why your content isn't converting" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["reel","youtube","tiktok","short","blog","email","carousel","story","podcast","ad","other"].map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Client</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Offer Attached</Label>
              <Select value={form.offer_id} onValueChange={(v) => setForm((f) => ({ ...f, offer_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select offer" /></SelectTrigger>
                <SelectContent>
                  {offers.map((o) => (<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Hook (opening line)</Label>
            <Input value={form.hook} onChange={(e) => setForm((f) => ({ ...f, hook: e.target.value }))}
              placeholder="The first thing they hear or read..." className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Offer CTA</Label>
            <Input value={form.offer_cta} onChange={(e) => setForm((f) => ({ ...f, offer_cta: e.target.value }))}
              placeholder="e.g. Link in bio to book a call" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Script / Brief</Label>
            <Textarea value={form.script} onChange={(e) => setForm((f) => ({ ...f, script: e.target.value }))}
              placeholder="Full script or content brief..." className="mt-1 h-24" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Publish URL</Label>
              <Input value={form.publish_url} onChange={(e) => setForm((f) => ({ ...f, publish_url: e.target.value }))}
                placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Publish Date</Label>
              <Input type="date" value={form.publish_date}
                onChange={(e) => setForm((f) => ({ ...f, publish_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.title || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Add Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddOfferDialog({ open, onClose, clients }: { open: boolean; onClose: () => void; clients: Client[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", description: "", price_point: "", offer_type: "service",
    status: "active", url: "", client_id: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("offers").insert({
        ...form,
        client_id: form.client_id || null,
        url: form.url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offer added");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle>New Offer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Offer Name *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Vektiss Project Intelligence" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.offer_type} onValueChange={(v) => setForm((f) => ({ ...f, offer_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["service","product","lead_magnet","event","course","other"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Price Point</Label>
              <Input value={form.price_point} onChange={(e) => setForm((f) => ({ ...f, price_point: e.target.value }))}
                placeholder="e.g. $5k/mo" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Client</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this offer delivers..." className="mt-1 h-20" />
          </div>
          <div>
            <Label className="text-xs">Landing Page URL</Label>
            <Input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://..." className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Add Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BusinessMedia() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddOffer, setShowAddOffer] = useState(false);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<ContentAsset[]>({
    queryKey: ["content_assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_assets")
        .select(`id, client_id, offer_id, title, content_type, platform, status,
                 script, publish_url, publish_date, hook, offer_cta, notes,
                 ai_generated, created_at,
                 clients(name, client_number),
                 offers(name)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ContentAsset[];
    },
  });

  const { data: offers = [], isLoading: offersLoading } = useQuery<Offer[]>({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(`id, client_id, name, description, price_point, offer_type, status, url, created_at,
                 clients(name, client_number)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Offer[];
    },
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["clients_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, client_number")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const filteredAssets = assets.filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.clients?.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pipelineCounts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = assets.filter((a) => a.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const offerAssetMap = offers.map((o) => ({
    ...o,
    assets: assets.filter((a) => a.offer_id === o.id),
  }));

  const publishedAssets = assets
    .filter((a) => a.publish_date)
    .sort((a, b) => new Date(a.publish_date!).getTime() - new Date(b.publish_date!).getTime());

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Business Media & Content</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Content as an asset — every piece attached to an offer, every offer building the ecosystem
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAddOffer(true)} className="gap-2">
            <Target className="h-4 w-4" /> New Offer
          </Button>
          <Button onClick={() => setShowAddAsset(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Asset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {STATUS_ORDER.map((s) => (
          <Card key={s} className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-2xl font-bold">{pipelineCounts[s] ?? 0}</p>
              <Badge variant="outline" className={`text-[10px] mt-1 ${STATUS_COLORS[s]}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets" className="gap-2"><Video className="h-4 w-4" /> Asset Library</TabsTrigger>
          <TabsTrigger value="offers" className="gap-2"><Target className="h-4 w-4" /> Offers</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2"><Calendar className="h-4 w-4" /> Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-4 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets..." className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {assetsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : filteredAssets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Video className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No content assets yet.</p>
                <Button className="mt-4 gap-2" onClick={() => setShowAddAsset(true)}>
                  <Plus className="h-4 w-4" /> Add First Asset
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredAssets.map((a) => (
                <Card key={a.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {TYPE_ICON[a.content_type] ?? <Video className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground capitalize">{a.content_type}</span>
                        {a.ai_generated && (
                          <Badge variant="outline" className="text-[10px] border-purple-700 text-purple-400 gap-1">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status]}`}>
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium leading-snug mb-2">{a.title}</p>
                    {a.hook && (
                      <p className="text-xs text-muted-foreground italic mb-2 line-clamp-2">"{a.hook}"</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      {a.clients && (
                        <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-400">
                          {a.clients.client_number ?? a.clients.name}
                        </Badge>
                      )}
                      {a.offers && (
                        <Badge variant="outline" className="text-[10px] border-orange-800 text-orange-400 gap-1">
                          <Target className="h-2.5 w-2.5" /> {a.offers.name}
                        </Badge>
                      )}
                    </div>
                    {a.publish_url && (
                      <a href={a.publish_url} target="_blank" rel="noopener noreferrer"
                        className="mt-3 flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
                        <ExternalLink className="h-3 w-3" /> View Published
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="offers" className="mt-4">
          {offersLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : offerAssetMap.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No offers yet. Add your first offer to start attaching content.</p>
                <Button className="mt-4 gap-2" onClick={() => setShowAddOffer(true)}>
                  <Plus className="h-4 w-4" /> Add First Offer
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {offerAssetMap.map((o) => (
                <Card key={o.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Target className="h-4 w-4 text-orange-400" />
                          {o.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          {o.clients && (
                            <Badge variant="outline" className="text-[10px] border-blue-800 text-blue-400">
                              {o.clients.name}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {o.offer_type.replace("_", " ")}
                          </Badge>
                          {o.price_point && (
                            <span className="text-xs text-green-400 font-mono">{o.price_point}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{o.assets.length}</p>
                        <p className="text-xs text-muted-foreground">assets</p>
                      </div>
                    </div>
                    {o.description && (
                      <p className="text-xs text-muted-foreground mt-2">{o.description}</p>
                    )}
                  </CardHeader>
                  {o.assets.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="flex gap-2 flex-wrap">
                        {STATUS_ORDER.map((s) => {
                          const count = o.assets.filter((a) => a.status === s).length;
                          if (count === 0) return null;
                          return (
                            <Badge key={s} variant="outline" className={`text-[10px] ${STATUS_COLORS[s]}`}>
                              {count} {s}
                            </Badge>
                          );
                        })}
                      </div>
                      <div className="mt-3 space-y-1">
                        {o.assets.slice(0, 5).map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground truncate max-w-xs">{a.title}</span>
                            <Badge variant="outline" className={`text-[10px] ml-2 flex-shrink-0 ${STATUS_COLORS[a.status]}`}>
                              {a.status}
                            </Badge>
                          </div>
                        ))}
                        {o.assets.length > 5 && (
                          <p className="text-xs text-muted-foreground">+{o.assets.length - 5} more</p>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Published & Scheduled Content
              </CardTitle>
            </CardHeader>
            <CardContent>
              {publishedAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No published or scheduled content yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Client</TableHead>
                      <TableHead className="text-xs">Offer</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Link</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {publishedAssets.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(a.publish_date!), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{a.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {TYPE_ICON[a.content_type] ?? <List className="h-3 w-3" />}
                            <span className="text-xs text-muted-foreground capitalize">{a.content_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.clients?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{a.offers?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[a.status]}`}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {a.publish_url ? (
                            <a href={a.publish_url} target="_blank" rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddAssetDialog open={showAddAsset} onClose={() => setShowAddAsset(false)} clients={clients} offers={offers} />
      <AddOfferDialog open={showAddOffer} onClose={() => setShowAddOffer(false)} clients={clients} />
    </div>
  );
}
