import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kortex.app',
  appName: 'Kortex',
  webDir: '.output/public',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#020618',
      showSpinner: false
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#020618'
    }
  },
  ios: {
    contentInset: 'never'
  },
  android: {
    backgroundColor: '#020618'
  }
}

export default config
