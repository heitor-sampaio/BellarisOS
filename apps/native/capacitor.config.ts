import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.archlabs.bellarisos',
  appName: 'BellarisOS',
  webDir: 'dist',
  server: {
    // Dev:  http://SEU_IP:3000  +  cleartext: true
    // Prod: https://app.esteticaos.com.br  +  cleartext: false
    url: 'https://bellarisos-production.up.railway.app',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
