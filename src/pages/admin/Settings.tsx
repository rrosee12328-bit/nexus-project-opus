import { Settings, Bell, Users, Palette } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

export default function AdminSettings() {
  const sections = [
    { icon: Settings, label: "Profile Settings", desc: "Manage your account details and preferences" },
    { icon: Bell, label: "Notifications", desc: "Configure email and in-app notification preferences" },
    { icon: Users, label: "Team Management", desc: "Invite team members and manage permissions" },
    { icon: Palette, label: "Portal Customization", desc: "Brand your client portal with custom colors and logo" },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account, preferences, and portal configuration.</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="hover:border-primary/20 transition-colors cursor-pointer group">
              <CardContent className="pt-6 pb-6 flex items-start gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{s.label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{s.desc}</p>
                  <p className="text-xs text-primary mt-2">Coming soon</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
