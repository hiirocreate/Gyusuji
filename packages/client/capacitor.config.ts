import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.gyusuji.beefhunter',
  appName: 'BEEF HUNTER',
  webDir: 'dist',
  android: { allowMixedContent: true },
  server: { androidScheme: 'https' },
};

export default config;
