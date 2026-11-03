'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { vocabulario } from '@/lib/unidades/vocabulario'

/**
 * A clínica de UMA unidade (D-19), para os componentes do navegador: os
 * layouts dos dois portais leem `redeTemUmaUnidade` no servidor e a põem
 * aqui, e a tela usa `useUmaUnidade()` (esconder o que só faz sentido com
 * duas) ou `useFala()` ("rede" vira "clínica", lib/unidades/vocabulario.ts).
 *
 * Fora dos portais (sem o provedor), vale `false`: o texto como está.
 */
const UmaUnidade = createContext(false)

export function UmaUnidadeProvider({ valor, children }: { valor: boolean; children: ReactNode }) {
  return <UmaUnidade.Provider value={valor}>{children}</UmaUnidade.Provider>
}

export function useUmaUnidade(): boolean {
  return useContext(UmaUnidade)
}

export function useFala(): (texto: string) => string {
  return vocabulario(useContext(UmaUnidade))
}

/** O texto com a fala da clínica, direto no JSX: `<Fala>{MODULE_HINTS[m]}</Fala>`. */
export function Fala({ children }: { children: string }) {
  return <>{useFala()(children)}</>
}
