import { CapacitorConfig } from '@capacitorjs/cli';

const config: CapacitorConfig = {
  appId: 'com.somatrack.app',
  appName: 'SomaTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
