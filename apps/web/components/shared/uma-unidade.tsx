'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { vocabulario } from '@/lib/unidades/vocabulario'

/**
 * A rede de UMA unidade (D-19), para os componentes do navegador: os layouts
 * dos dois portais leem `redeTemUmaUnidade` no servidor e a põem aqui, com o
 * NOME da rede, e a tela usa `useUmaUnidade()` (esconder o que só faz sentido
 * com duas) ou `useFala()` (o rótulo que é só a rede vira o nome dela, PO2 —
 * lib/unidades/vocabulario.ts).
 *
 * Fora dos portais (sem o provedor), vale `false`: o texto como está.
 */
const UmaUnidade = createContext<{ valor: boolean; nome: string | null }>({ valor: false, nome: null })

export function UmaUnidadeProvider({ valor, nome = null, children }: { valor: boolean; nome?: string | null; children: ReactNode }) {
  return <UmaUnidade.Provider value={{ valor, nome }}>{children}</UmaUnidade.Provider>
}

export function useUmaUnidade(): boolean {
  return useContext(UmaUnidade).valor
}

export function useFala(): (texto: string) => string {
  const { valor, nome } = useContext(UmaUnidade)
  return vocabulario(valor, nome)
}

/** O texto com a fala da rede de uma unidade, direto no JSX: `<Fala>{MODULE_HINTS[m]}</Fala>`. */
export function Fala({ children }: { children: string }) {
  return <>{useFala()(children)}</>
}
