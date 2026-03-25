import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oweit.app',
  appName: 'Owe It',
  webDir: 'dist',
  ios: {
    // Helps iOS handle safe areas correctly.
    contentInset: 'automatic',
  },
};

export default config;
