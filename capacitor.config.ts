import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.graalmedicalsolutions.app',
  appName: 'GRAAL',
  webDir: 'dist',
  android: {
    allowMixedContent: false
  },
  server: {
    androidScheme: 'https'
  }
}

export default config
