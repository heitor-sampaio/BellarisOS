'use client'

import { useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { logoutAction } from '@/actions/auth'
import { removeWebPushSubscription } from '@/actions/push-subscriptions'

/**
 * Sair do portal do cliente — e parar as notificações deste navegador.
 *
 * Sem isto a inscrição de push ficava viva depois do logout: quem saía de um
 * computador emprestado continuava recebendo as notificações da clínica nele.
 * `removeWebPushSubscription` existia e nada a chamava (2026-09-28).
 *
 * A ordem importa: tirar do servidor ENQUANTO a sessão existe, depois cancelar
 * no navegador, depois sair. Push é acessório — falhar aqui não impede sair.
 */
export function BotaoSairDoPortal() {
  const [saindo, startSair] = useTransition()

  function sair() {
    startSair(async () => {
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
        const sub = await reg?.pushManager.getSubscription()
        if (sub) {
          await removeWebPushSubscription(sub.endpoint)
          await sub.unsubscribe()
        }
      } catch { /* notificação é acessória: sair não depende dela */ }
      await logoutAction()
    })
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      style={{
        width:          '100%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            8,
        padding:        '13px 16px',
        borderRadius:   12,
        border:         '1px solid var(--border)',
        background:     'var(--surface)',
        color:          'var(--danger)',
        fontWeight:     700,
        fontSize: 'var(--text-base-sz)',
        cursor:         'pointer',
      }}
    >
      <LogOut size={15} />
      {saindo ? 'Saindo…' : 'Sair da conta'}
    </button>
  )
}
