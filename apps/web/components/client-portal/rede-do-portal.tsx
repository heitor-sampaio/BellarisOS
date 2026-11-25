'use client'

import { createContext, useContext } from 'react'
import { falaDaRede, type FalaDaRede } from '@/lib/clientes/fala-da-rede'

/**
 * O nome da rede para os componentes do portal que rodam no navegador (CA1:
 * o NOME da rede no lugar de "clínica"). O layout do portal o põe; a página
 * no servidor usa `falaDaRedeDoPortal` (`lib/clientes/nome-da-rede.ts`).
 */
const Contexto = createContext<string | null>(null)

export function RedeDoPortal({ nome, children }: { nome: string | null; children: React.ReactNode }) {
  return <Contexto.Provider value={nome}>{children}</Contexto.Provider>
}

export function useFalaDaRede(): FalaDaRede {
  return falaDaRede(useContext(Contexto))
}

/** O nome da rede, para a frase que o põe no meio ("Conte a Estética Bella o porquê"); nulo sem ele. */
export function useNomeDaRede(): string | null {
  return useContext(Contexto)?.trim() || null
}
