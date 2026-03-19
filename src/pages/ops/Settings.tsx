import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, User, Bell } from "lucide-react";
import { motion } from "framer-motion";

export default function OpsSettings() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and notification preferences.</p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { icon: User, title: "Profile", desc: "Update your display name, avatar, and contact details." },
          { icon: Bell, title: "Notifications", desc: "Configure how and when you receive alerts and updates." },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
          >
            <Card className="border-dashed border-2 border-border hover:border-primary/20 transition-colors">
              <CardContent className="py-10 flex flex-col items-center text-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <card.icon className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{card.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">{card.desc}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
