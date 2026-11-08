import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.provisit.provisit',
  appName: 'Provisit',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      appId: 'com.provisit.provisit',
      autoUpdate: 'always',
      autoSplashscreen: true,
      keepUrlPathAfterReload: true,
      version: '1.1.0'
    },
    SplashScreen: {
      launchAutoHide: false
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
