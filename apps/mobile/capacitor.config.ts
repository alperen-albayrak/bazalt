import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.bazalt.app',
  appName: 'Bazalt',
  webDir: '../app/dist',
  server: { androidScheme: 'https' },
}

export default config
