import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.f96d938f3f304423b02062b615b2995b',
  appName: 'Vektiss Portal',
  webDir: 'dist',
  server: {
    url: 'https://f96d938f-3f30-4423-b020-62b615b2995b.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;