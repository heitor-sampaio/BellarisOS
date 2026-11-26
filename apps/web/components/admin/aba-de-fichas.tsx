'use client'

import { useState, type ComponentProps } from 'react'
import { SettingsPreAtendimento } from '@/components/admin/settings-pre-atendimento'
import { SettingsFichas } from '@/components/admin/settings-fichas'
import { blocosDaAbaDeFichas, type EditorDaAbaDeFichas } from '@/lib/configuracoes/fichas-na-tela'

/**
 * Configurações → Fichas: a ficha de saúde e as fichas de atendimento, com um
 * editor aberto por vez (A2 da 34ª simulação): abrir um tira o outro bloco da
 * tela, e fechar o traz de volta.
 */
export function AbaDeFichas({ preAtendimento, fichas }: {
  /** Nulo: a rede sem a ficha de saúde nesta aba. */
  preAtendimento: Omit<ComponentProps<typeof SettingsPreAtendimento>, 'aoEditar'> | null
  fichas: Omit<ComponentProps<typeof SettingsFichas>, 'aoEditar'>
}) {
  const [aberto, setAberto] = useState<EditorDaAbaDeFichas>(null)
  const blocos = blocosDaAbaDeFichas(aberto)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {preAtendimento && blocos.saude && (
        <SettingsPreAtendimento {...preAtendimento} aoEditar={a => setAberto(a ? 'saude' : null)} />
      )}
      {blocos.atendimento && (
        <SettingsFichas {...fichas} aoEditar={a => setAberto(a ? 'atendimento' : null)} />
      )}
    </div>
  )
}
