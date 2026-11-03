'use client'

import { useCallback, useMemo, useRef } from 'react'

/**
 * A chave do envio de um formulário (D10 da 5ª simulação; o servidor é
 * `lib/envio-unico.ts`). Nasce no PRIMEIRO envio e vale para os reenvios dele
 * — o duplo clique, o Enter junto do clique, a resposta que se perdeu na
 * rede —, até `renovar()`, que a tela chama quando o envio GRAVOU: o próximo
 * cadastro do mesmo formulário aberto é outro envio.
 *
 * Gerada no envio, e não no render: no render a do servidor e a do navegador
 * seriam diferentes (erro de hidratação).
 */
export function useEnvioUnico() {
  const atual = useRef<string | null>(null)
  const chave = useCallback(() => (atual.current ??= novaChave()), [])
  const renovar = useCallback(() => { atual.current = null }, [])
  // O mesmo objeto a cada render: entra em lista de dependências sem reexecutar o efeito.
  return useMemo(() => ({ chave, renovar }), [chave, renovar])
}

function novaChave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
