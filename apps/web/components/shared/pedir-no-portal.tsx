'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Smartphone } from 'lucide-react'
import { pedirAssinaturaNoPortal } from '@/actions/documentos'

/**
 * "Pedir no portal" onde a assinatura é pedida (A10 da 37ª simulação; DQ-06:
 * colher inclui "pelo app"). O MESMO pedido da ficha → Documentos
 * (`pedirAssinaturaNoPortal`: o documento fica no app da cliente, com o aviso,
 * e a linha guarda quando foi pedido), com os mesmos textos. Quem chama só o
 * mostra a quem tem o app, com o portal no plano da rede (A26 da 7ª, C57a).
 */
export function PedirNoPortal({ documentoId, pedidoEm = null }: {
  documentoId: string
  /** D21 da 31ª: já pedido — o botão diz "Pedir de novo no portal". */
  pedidoEm?: string | null
}) {
  const router = useRouter()
  const [pedido, setPedido] = useState(!!pedidoEm)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()

  function pedir() {
    setErro(null); setAviso(null)
    iniciar(async () => {
      const r = await pedirAssinaturaNoPortal(documentoId)
      if (r.error) { setErro(r.error); return }
      setPedido(true)
      setAviso('Pedido enviado: o documento está no portal do cliente, com o aviso no app.')
      router.refresh()
    })
  }

  return (
    <div data-pedir-no-portal style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" className="btn-secondary" disabled={ocupado} onClick={pedir}
        style={{ padding: '6px 12px', fontSize: 'var(--text-xs-sz)', display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
        <Smartphone size={13} aria-hidden="true" /> {pedido ? 'Pedir de novo no portal' : 'Pedir no portal'}
      </button>
      {aviso && <span role="status" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>{aviso}</span>}
      {erro && <span role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)' }}>{erro}</span>}
    </div>
  )
}
