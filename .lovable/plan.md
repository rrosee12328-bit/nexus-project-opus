

## Vektiss Portal — Phase 1: Foundation

### What We're Building
The complete foundation: dark theme design system, authentication (email/password), role-based routing (Admin, Ops, Client), and the application shell with sidebar navigation and placeholder pages for Admin and Ops portals.

### Design System Setup
- **Dark theme** with Deep Obsidian (#0D0D0D) background, Dark Charcoal (#1A1A1A) surfaces, Electric Blue (#386AFF) accent
- **Inter** font for all UI text, **JetBrains Mono** for data/numbers
- Update CSS variables and Tailwind config to match the Command Center aesthetic
- Snappy 150-200ms transitions, `rounded-md` corners, 4px grid spacing

### Authentication
- Enable **Lovable Cloud** (Supabase) for database + auth
- Email/password signup and login pages styled to match the dark theme
- Create `profiles` table (display_name, avatar_url) with auto-creation trigger
- Create `user_roles` table with `app_role` enum (admin, ops, client)
- New signups default to **client** role
- Seed Ricky as admin directly in the database
- `has_role()` security definer function for RLS policies

### Role-Based Routing & Navigation
- **Admin Portal** (`/admin/*`): Fixed narrow left sidebar with navigation to:
  - Dashboard, Client Management, Project Management, Messages, Financial Tracking, Settings
  - Each page has a basic layout with title and placeholder content
- **Ops Portal** (`/ops/*`): Fixed narrow left sidebar with navigation to:
  - Dashboard (Kanban placeholder), Tasks, SOPs, Settings
  - Each page has a basic layout with title and placeholder content
- **Client Portal** (`/`): Top navigation bar (built in next phase, just a simple landing for now)
- Route guards redirect users based on role — admins to `/admin`, ops to `/ops`, clients to `/`
- Login redirects to the appropriate portal based on role

### Database Tables
| Table | Purpose |
|-------|---------|
| `profiles` | User display name, avatar, linked to auth.users |
| `user_roles` | Role assignments (admin, ops, client) with RLS |

### Pages Created
**Admin Portal (6 pages):**
Dashboard, Client Management, Project Management, Messages, Financial Tracking, Settings

**Ops Portal (4 pages):**
Dashboard, Tasks, SOPs, Settings

**Auth (2 pages):**
Login, Signup

All pages will have the dark theme applied, proper headings, and structured placeholder content indicating what will be built there next.

