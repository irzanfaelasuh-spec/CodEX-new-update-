import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.codexai.terminal',
  appName: 'CodEX AI',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  }
};

export default config;
