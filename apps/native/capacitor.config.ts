import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.archlabs.bellarisos',
  appName: 'BellarisOS',
  webDir: 'dist',
  server: {
    // Dev:  http://SEU_IP:3000  +  cleartext: true (e o IP no
    //       network_security_config.xml) — só na cópia local, nunca no commit.
    // Prod: https, sem tráfego em claro.
    url: 'https://bellarisos-production.up.railway.app',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
