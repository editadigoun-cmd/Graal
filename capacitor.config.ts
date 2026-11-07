import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.provisit.provisit',
  appName: 'Provisit',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      appId: 'com.provisit.provisit',
      autoUpdate: 'atBackground',
      version: '1.1.0'
    }
  },
  android: {
    allowMixedContent: false
  },
  server: {
    androidScheme: 'https'
  }
}

export default config
