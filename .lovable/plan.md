# Generate Executive Summary — Admin Client Detail

Add a primary-styled action button to the top-right of the Admin Client Detail page that calls the n8n webhook and renders the returned HTML summary in a modal.

## Scope

Single file change: `src/pages/admin/ClientDetail.tsx`

## UI changes

Header action row (currently `Send Proposal` + `Add Entry` at line ~262) gets a new primary button placed first:

```text
[ Sparkles  Generate Executive Summary ]  [ Send Proposal ]  [ Add Entry ]
```

- Variant: `default` (primary) — matches existing style guide
- Icon: `Sparkles` from lucide-react
- While loading: button shows `<Loader2 className="animate-spin" /> Generating summary...` and is disabled

## Behavior

1. On click → set `isGenerating = true`, open modal immediately showing centered spinner + "Generating summary..." text.
2. `fetch("https://vektiss.app.n8n.cloud/webhook/admin-client-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) })`
3. On success (`{ success: true, summary, generated_at }`): store result in state, modal swaps spinner for rendered HTML.
4. On failure (network error, non-2xx, or `success !== true`): close modal, show `toast.error("Summary generation failed. Please try again.")`.

## Modal

Uses existing `Dialog` from `@/components/ui/dialog`.

- `DialogContent` with `max-w-3xl max-h-[85vh] overflow-y-auto`
- `DialogTitle`: `Executive Summary — {format(new Date(generated_at), "MMMM d, yyyy")}`
- Body: `<div className="prose prose-sm dark:prose-invert max-w-none summary-doc" dangerouslySetInnerHTML={{ __html: summary }} />`
- Loading state: centered `<Loader2 className="h-8 w-8 animate-spin text-primary" />` + "Generating summary..."
- Footer: Close button + Download button (saves the HTML as `<client-name>_executive_summary_<date>.html`)

## State (added to ClientDetail component)

```ts
const [summaryOpen, setSummaryOpen] = useState(false);
const [isGenerating, setIsGenerating] = useState(false);
const [summaryHtml, setSummaryHtml] = useState<string | null>(null);
const [summaryDate, setSummaryDate] = useState<string | null>(null);
```

## Security note

The webhook returns trusted HTML from your own n8n workflow, so `dangerouslySetInnerHTML` is acceptable here (same approach used by `ClientSummariesPanel` / SOPs). No user-submitted content is rendered.

## Out of scope

- Persisting the generated summary to `company_summaries` table (can be added later if you want one-click "Save to Summaries").
- Changes to any other page or to the n8n workflow itself.
