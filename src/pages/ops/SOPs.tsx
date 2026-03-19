import { Card, CardContent } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { motion } from "framer-motion";

export default function OpsSops() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Standard Operating Procedures</h1>
        <p className="text-muted-foreground">Reference guides and workflows for team operations.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <Card className="border-dashed border-2 border-border">
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">SOP library coming soon</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Search, categories, and step-by-step guides will be available here.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
