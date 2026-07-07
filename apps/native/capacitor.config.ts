import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.archlabs.bellarisos',
  appName: 'EstéticaOS',
  webDir: 'dist',
  server: {
    // Dev:  http://SEU_IP:3000  +  cleartext: true
    // Prod: https://app.esteticaos.com.br  +  cleartext: false
    url: 'http://192.168.0.188:3000',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
