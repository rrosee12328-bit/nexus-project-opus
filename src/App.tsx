import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ResetPassword from "./pages/ResetPassword";
import AssetDownload from "./pages/AssetDownload";

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

import OpsLayout from "./layouts/OpsLayout";
import OpsDashboard from "./pages/ops/Dashboard";
import OpsTasks from "./pages/ops/Tasks";
import OpsSops from "./pages/ops/SOPs";
import OpsSettings from "./pages/ops/Settings";

import ClientLayout from "./layouts/ClientLayout";
import ClientDashboard from "./pages/client/Dashboard";
import ClientProjects from "./pages/client/Projects";
import ClientAssets from "./pages/client/Assets";
import ClientMessages from "./pages/client/Messages";
import ClientPayments from "./pages/client/Payments";
import ClientSettings from "./pages/client/Settings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
              <Route path="projects" element={<AdminProjects />} />
              <Route path="messages" element={<AdminMessages />} />
              <Route path="assets" element={<AdminAssets />} />
              <Route path="financials" element={<AdminFinancials />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="emails" element={<AdminEmails />} />
              <Route path="settings" element={<AdminSettings />} />
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
              <Route path="sops" element={<OpsSops />} />
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
              <Route path="payments" element={<ClientPayments />} />
              <Route path="settings" element={<ClientSettings />} />
            </Route>

            {/* Home - redirects based on role */}
            <Route path="/" element={<Index />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
