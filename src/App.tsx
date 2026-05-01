import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import AssetDownload from "./pages/AssetDownload";
import ProposalPage from "./pages/Proposal";

import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminClients from "./pages/admin/Clients";
import AdminProjects from "./pages/admin/Projects";
import AdminMessages from "./pages/admin/Messages";
import AdminFinancials from "./pages/admin/Financials";
import AdminSettings from "./pages/admin/Settings";
import AdminAssets from "./pages/admin/Assets";
import AdminReports from "./pages/admin/Reports";
import AdminEmails from "./pages/admin/Emails";
import AdminAgent from "./pages/admin/Agent";
import AdminClientDetail from "./pages/admin/ClientDetail";
import AdminCalendar from "./pages/admin/Calendar";
import AdminLeads from "./pages/admin/Leads";
import AdminProposals from "./pages/admin/Proposals";
import AdminSummaries from "./pages/admin/Summaries";
import AdminClientTracker from "./pages/admin/ClientTracker";
import AdminCalls from "./pages/admin/Calls";
import AdminKnowledgeBase from "./pages/admin/KnowledgeBase";
import AdminInvoices from "./pages/admin/Invoices";
import AdminPdfLogs from "./pages/admin/PdfLogs";
import AdminBusinessMedia from "./pages/admin/BusinessMedia";

import OpsLayout from "./layouts/OpsLayout";
import OpsDashboard from "./pages/ops/Dashboard";
import OpsTasks from "./pages/ops/Tasks";
import OpsSops from "./pages/ops/SOPs";
import OpsTimesheets from "./pages/ops/Timesheets";
import OpsSettings from "./pages/ops/Settings";
import OpsAgent from "./pages/ops/Agent";

import ClientLayout from "./layouts/ClientLayout";
import ClientDashboard from "./pages/client/Dashboard";
import ClientProjects from "./pages/client/Projects";
import ClientAssets from "./pages/client/Assets";
import ClientMessages from "./pages/client/Messages";
import ClientBilling from "./pages/client/Billing";
import ClientSettings from "./pages/client/Settings";
import ClientAgent from "./pages/client/Agent";
import ClientApprovals from "./pages/client/Approvals";
import ClientContracts from "./pages/client/Contracts";
import ClientCalls from "./pages/client/Calls";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/proposal/:token" element={<ProposalPage />} />
            <Route
              path="/download/:assetId"
              element={
                <ProtectedRoute allowedRoles={["admin", "ops", "client"]}>
                  <AssetDownload />
                </ProtectedRoute>
              }
            />

            {/* Admin Portal */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="clients" element={<AdminClients />} />
              <Route path="clients/:clientId" element={<AdminClientDetail />} />
              <Route path="projects" element={<AdminProjects />} />
              <Route path="messages" element={<AdminMessages />} />
              <Route path="assets" element={<AdminAssets />} />
              <Route path="financials" element={<AdminFinancials />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="emails" element={<AdminEmails />} />
              <Route path="agent" element={<AdminAgent />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="calendar" element={<AdminCalendar />} />
              <Route path="leads" element={<AdminLeads />} />
              <Route path="proposals" element={<AdminProposals />} />
              <Route path="summaries" element={<AdminSummaries />} />
              <Route path="tracker" element={<AdminClientTracker />} />
              <Route path="calls" element={<AdminCalls />} />
              <Route path="knowledge-base" element={<AdminKnowledgeBase />} />
              <Route path="invoices" element={<AdminInvoices />} />
              <Route path="pdf-logs" element={<AdminPdfLogs />} />
              <Route path="business-media" element={<AdminBusinessMedia />} />
            </Route>

            {/* Ops Portal */}
            <Route
              path="/ops"
              element={
                <ProtectedRoute allowedRoles={["admin", "ops"]}>
                  <OpsLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<OpsDashboard />} />
              <Route path="tasks" element={<OpsTasks />} />
              <Route path="timesheets" element={<OpsTimesheets />} />
              <Route path="sops" element={<OpsSops />} />
              <Route path="agent" element={<OpsAgent />} />
              <Route path="settings" element={<OpsSettings />} />
            </Route>

            {/* Client Portal */}
            <Route path="/portal" element={
              <ProtectedRoute allowedRoles={["admin", "client"]}>
                <ClientLayout />
              </ProtectedRoute>
            }>
              <Route index element={<ClientDashboard />} />
              <Route path="projects" element={<ClientProjects />} />
              <Route path="assets" element={<ClientAssets />} />
              <Route path="messages" element={<ClientMessages />} />
              <Route path="billing" element={<ClientBilling />} />
              <Route path="payments" element={<Navigate to="/portal/billing" replace />} />
              <Route path="approvals" element={<ClientApprovals />} />
              <Route path="contracts" element={<ClientContracts />} />
              <Route path="agent" element={<ClientAgent />} />
              <Route path="calls" element={<ClientCalls />} />
              <Route path="settings" element={<ClientSettings />} />
            </Route>

            {/* Home - redirects based on role */}
            <Route path="/" element={<Index />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
