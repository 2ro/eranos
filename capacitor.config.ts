import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'spot.agora.app',
  appName: 'Agora',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  android: {
    // Enable safe area handling for notches and navigation bars
    allowMixedContent: false,
    backgroundColor: '#14161f'
  },
  ios: {
    backgroundColor: '#14161f',
    contentInset: 'never',
    scheme: 'Agora'
  },
};

export default config;
