

## Dark/Light Mode Toggle

Currently the site is dark-only — all CSS variables are defined under `:root` with no `.dark` class variant. Tailwind is already configured with `darkMode: ["class"]`, so the infrastructure is ready.

### What we'll build

1. **Add light mode CSS variables** — Define a new set of light-themed HSL values under `:root` (default = light) and move the current dark values under `.dark` in `src/index.css`

2. **Create a `ThemeProvider` and `useTheme` hook** — New file `src/hooks/useTheme.tsx` that:
   - Reads theme preference from `localStorage` (key: `theme`)
   - Defaults to `dark` to preserve the current experience
   - Toggles the `dark` class on `<html>`
   - Provides `theme`, `setTheme`, and `toggleTheme` via React context

3. **Create a `ThemeToggle` component** — New file `src/components/ThemeToggle.tsx`:
   - A small button with Sun/Moon icons from lucide-react
   - Calls `toggleTheme()` on click
   - Fits into the existing header style

4. **Add the toggle to all layout headers** — Place `<ThemeToggle />` in:
   - `src/layouts/AdminLayout.tsx` (next to GlobalSearch/NotificationBell)
   - `src/layouts/OpsLayout.tsx` (next to NotificationBell)
   - `src/layouts/ClientLayout.tsx` (in the header area)

### Light mode color values

The light palette will use whites/grays for backgrounds and dark text for foreground, while keeping the same blue primary (`213 100% 58%`):

| Variable | Dark (current) | Light |
|----------|---------------|-------|
| background | 0 0% 5% | 0 0% 100% |
| foreground | 0 0% 100% | 0 0% 9% |
| card | 0 0% 10% | 0 0% 98% |
| popover | 0 0% 10% | 0 0% 100% |
| muted | 0 0% 15% | 0 0% 96% |
| muted-foreground | 0 0% 55% | 0 0% 45% |
| border | 0 0% 18% | 0 0% 90% |
| sidebar-background | 0 0% 7% | 0 0% 97% |

### Files changed
- `src/index.css` — restructure variables (light as `:root`, dark under `.dark`)
- `src/hooks/useTheme.tsx` (new)
- `src/components/ThemeToggle.tsx` (new)
- `src/layouts/AdminLayout.tsx` — add toggle
- `src/layouts/OpsLayout.tsx` — add toggle
- `src/layouts/ClientLayout.tsx` — add toggle
- `src/App.tsx` — wrap with `ThemeProvider`

