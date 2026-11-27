import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessoesPresas, recusaDaSessaoNaoLiberadaNoApp } from '@/lib/pacotes/regras'

/**
 * A2 da 37ª (PP-07, princípio 3): na troca MANUAL do crédito no modal da
 * agenda, a frase "Incluído no pacote X (sessão N de M)" sumia — só aparecia
 * na escolha automática. A frase acompanha o crédito escolhido, qualquer que
 * seja o jeito de escolher; o "Escolhido porque o procedimento é o mesmo." é
 * só da escolha automática.
 *
 * A5 da 37ª (PA-13: "a sessão não se agenda"; princípio 7; CLAUDE.md §14 —
 * o botão que a pessoa não pode usar, a tela esconde): com "Libera as sessões
 * só depois de pago" e o pacote ainda em aberto, o modal repetia o mesmo aviso
 * em três caixas (o verde "Incluído", o do em aberto e a recusa).
 */
const modal = readFileSync(join(__dirname, '..', 'components/branch/appointment-modal.tsx'), 'utf8')

describe('o crédito escolhido no modal da agenda', () => {
  it('a frase "Incluído…" vale para o crédito escolhido à mão também (A2)', () => {
    expect(modal).toMatch(/\{credito && !credito\.recusa && \(\s*<p data-credito-pre-escolhido/)
    expect(modal).toMatch(/\{creditoAutomatico && <Dica rotulo="Por que já veio escolhido">/)
  })
  it('a sessão que não se libera: UM aviso — o do em aberto, ou a recusa a quem não o vê (A5)', () => {
    expect(modal).toMatch(/\{!credito\?\.emAberto && credito\?\.recusa && \(\s*<p data-recusa-da-sessao role="alert"/)
  })
})

const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const NAO_LIBERA = { crediarioLibera: false, vencidoCancela: false }
const LIBERA = { crediarioLibera: true, vencidoCancela: false }

describe('a sessão do pacote que a rede só libera depois de pago (PA-13)', () => {
  it('presa: a rede não libera e há dinheiro em aberto', () => {
    expect(sessoesPresas(NAO_LIBERA, 300)).toBe(true)
    expect(sessoesPresas(NAO_LIBERA, 0)).toBe(false)
    expect(sessoesPresas(LIBERA, 300)).toBe(false)
  })
  it('no app, a recusa fala com a cliente — nada de PDV nem de Financeiro', () => {
    expect(recusaDaSessaoNaoLiberadaNoApp(LIBERA, 300)).toBeNull()
    expect(recusaDaSessaoNaoLiberadaNoApp(NAO_LIBERA, 0)).toBeNull()
    const t = recusaDaSessaoNaoLiberadaNoApp(NAO_LIBERA, 300)!
    expect(t).toBe('As sessões deste pacote se liberam quando ele estiver pago.')
    expect(t).not.toMatch(/PDV|Financeiro|baixa/)
    // O agendar do app passa pelo núcleo, que pede a recusa da cliente.
    expect(fonte('lib/creditos/credito.ts')).toMatch(/opcoes\.paraACliente\s*\?\s*recusaDaSessaoNaoLiberadaNoApp\(regras, emAberto\)/)
    expect(fonte('lib/appointments/core.ts')).toMatch(/conferirCredito\(admin, ctx\.tenantId!, input\.clientId, input\.credito, \{ quando: input\.scheduledAt, paraACliente: ctx\.isClient \}\)/)
  })
  it('a ficha marca o pacote preso a quem vê a ficha, receba ou não', () => {
    for (const pagina of ['app/[slug]/clients/[id]/page.tsx', 'app/admin/clients/[id]/page.tsx']) {
      expect(fonte(pagina)).toMatch(/pacote\.sessoesPresas = sessoesPresas\(regrasDoPacote, emAberto\?\.valor \?\? 0\)/)
    }
  })
  it('a ficha, o cartão e as duas janelas não oferecem "Agendar" na sessão presa', () => {
    expect(fonte('components/branch/client-profile.tsx')).toMatch(/pacote\.sessoesPresas \? 'Abrir para ver as sessões' : 'Abrir para ver e agendar as sessões'/)
    const ficha = fonte('components/branch/treatment-file-modal.tsx')
    expect(ficha).toMatch(/\{livre && !activePackage\.sessoesPresas && \(/)
    expect(ficha).toMatch(/sessoesPresas=\{!!activePackage\.sessoesPresas\}/)
    expect(fonte('components/branch/treatment-sessions-modal.tsx')).toMatch(/\{isAvail && !isScheduling && !sessoesPresas && \(/)
  })
  it('o app não oferece "Agendar" na sessão presa e diz por quê à cliente', () => {
    const home = fonte('app/[slug]/cliente/home/page.tsx')
    expect(home).toMatch(/const presa = presos\.has\(pkg\.id\)/)
    expect(home).toMatch(/presa \? \(\s*<p data-sessoes-presas/)
    expect(fonte('lib/creditos/pago-no-app.ts')).toMatch(/c\.tipo === 'PACOTE' && c\.procedureId && !c\.recusa/)
  })
})
