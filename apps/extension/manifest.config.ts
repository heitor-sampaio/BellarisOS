import { defineManifest } from '@crxjs/vite-plugin'

// Manifest V3 — painel lateral (Side Panel) que fica ao lado de qualquer aba.
// Sem host_permissions: as chamadas ao Bellaris passam por CORS (configurado em
// /api/ext) e ao Supabase por CORS aberto — não é preciso permissão de host.
export default defineManifest({
  manifest_version: 3,
  name:    'Bellaris — Agenda',
  version: '0.1.0',
  description: 'Agende no Bellaris a partir de qualquer site, sem trocar de aba.',
  action: {
    default_title: 'Abrir agenda Bellaris',
  },
  permissions: ['storage', 'sidePanel'],
  side_panel: {
    default_path: 'index.html',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  // Chave fixa → id de extensão estável entre builds (útil se um dia restringir CORS).
  // Substitua por uma chave própria antes de publicar.
  // key: '<sua-chave-base64>',
})
