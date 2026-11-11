'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { BUSINESS_TZ } from '@/lib/datetime'
import { FUSO_PADRAO, nomeDoFuso } from '@/lib/unidades/fuso'

/**
 * O fuso da tela (F62), para os componentes do navegador: o layout do portal
 * da unidade põe o fuso DELA (o da equipe e o app da cliente), o da rede o
 * fuso comum das unidades (`fusoDaRede`). As datas e horas da tela saem nele
 * — e a hora que a pessoa escolhe vira o instante nele (`instanteNoFuso`).
 *
 * Fora dos portais (sem o provedor), o de Brasília: como era.
 */
const Fuso = createContext<string>(BUSINESS_TZ)

export function FusoProvider({ fuso, children }: { fuso: string; children: ReactNode }) {
  return <Fuso.Provider value={fuso}>{children}</Fuso.Provider>
}

export function useFuso(): string {
  return useContext(Fuso)
}

/**
 * "Horário de Manaus" ao lado da hora, quando o fuso não é o de Brasília
 * (princípio 3: a tela diz em que relógio está). No de Brasília, nada.
 */
export function NotaDoFuso({ fuso: dado, prefixo = '' }: { fuso?: string; prefixo?: string }) {
  const doContexto = useFuso()
  const fuso = dado ?? doContexto
  if (fuso === FUSO_PADRAO) return null
  const nome = nomeDoFuso(fuso)
  return (
    <span data-nota-do-fuso style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', fontWeight: 'var(--weight-semibold)' }}>
      {prefixo}{nome.charAt(0).toUpperCase() + nome.slice(1)}
    </span>
  )
}
