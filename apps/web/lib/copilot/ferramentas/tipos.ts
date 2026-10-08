import 'server-only'
import type { z } from 'zod/v4'
import type { AppModule, TenantContext } from '@estetica-os/types'
import type { ChaveDeFuncionalidade } from '@estetica-os/nucleo/lib/planos/recursos'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { Cartao, ResumoDaAcao, ResultadoDaAcao } from '@/lib/copilot/tipos'

/**
 * O contrato de uma ferramenta do Copilot.
 *
 * A ferramenta DECLARA o que exige (módulo e nível, funcionalidade do plano,
 * uma trava a mais em `pode`) e o executor (`lib/copilot/executor.ts`) é quem
 * confere — antes de oferecê-la ao modelo e de novo antes de rodar. Dentro de
 * `executar`/`preparar`/`efetivar` vale tudo o que vale numa action: a rede e
 * a unidade vêm do `ctx`, nunca dos argumentos; registro que chega por id é
 * conferido (rede, `alcancaUnidade`, `ownerFilter`, `leadAoAlcance`).
 *
 * NENHUMA ferramenta lê dado clínico (decisão do Heitor, 2026-10-08): nada de
 * prontuário, evolução, anamnese, foto clínica ou anotação do plano vai à
 * OpenAI.
 */

export type Admin = ReturnType<typeof createAdminClient>

export interface ContextoDaFerramenta {
  /** O contexto da pessoa, com o nome já marcado "(via Copilot)". */
  ctx: TenantContext
  admin: Admin
  /** O caminho da tela em que a pessoa está — decide o portal dos links. */
  pagina: string
  /** O slug da unidade do portal (null no portal da rede). */
  slugDoPortal: string | null
}

export interface ResultadoDeLeitura {
  /** O que vai ao modelo — enxuto: o modelo paga por token. */
  dados: unknown
  /** O que a tela mostra além do texto (links para as fichas, por exemplo). */
  cartao?: Cartao
}

export type Preparo<P> =
  | { resumo: ResumoDaAcao; payload: P }
  | { erro: string }

export type Efetivado = ResultadoDaAcao | { erro: string }

interface Base<A> {
  nome: string
  /** Para o MODELO: quando usar, o que devolve. Em português, como o resto. */
  descricao: string
  parametros: z.ZodType<A>
  modulo?: AppModule
  nivel?: 'VIEW' | 'MANAGE'
  recurso?: ChaveDeFuncionalidade
  /** Trava a mais, além do módulo (ex.: `podeReceber`, aba de relatório). */
  pode?: (ctx: TenantContext) => boolean
}

export interface FerramentaDeLeitura<A = unknown> extends Base<A> {
  tipo: 'leitura'
  executar(c: ContextoDaFerramenta, args: A): Promise<ResultadoDeLeitura>
}

export interface FerramentaDeEscrita<A = unknown, P = unknown> extends Base<A> {
  tipo: 'escrita'
  /** Resolve nomes em ids, confere alcance e conflito, e monta o resumo. Não grava nada. */
  preparar(c: ContextoDaFerramenta, args: A): Promise<Preparo<P>>
  /** Grava — só depois do "Confirmar". Confere tudo DE NOVO (o mundo mudou desde o preparo). */
  efetivar(c: ContextoDaFerramenta, payload: P): Promise<Efetivado>
}

export type Ferramenta = FerramentaDeLeitura<any> | FerramentaDeEscrita<any, any> // eslint-disable-line @typescript-eslint/no-explicit-any
