import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AnamnesisRow } from '@/lib/anamnesis'
import type { AnamneseGeral } from '@/lib/anamnese-geral'

/**
 * D7, A16 e A17 da 35ª simulação (FI-07: "contam as perguntas da ficha ATUAL";
 * PT-12: a ficha volta a pedir resposta "vencida ou de outra versão", já
 * preenchida com as de antes; FI-09: sem ficha válida, o app oferece a ficha).
 * A rede pôs na ficha de saúde a obrigatória "Usa anticoagulante?" depois de a
 * Ivanilde responder. O Finalizar a barrava (a conta da ficha atual), mas o app
 * dizia "Nada para responder agora" (a oferta só olhava a validade) e a aba
 * Prontuário da ficha não mostrava a pergunta pendente. E a página "Responda a
 * sua ficha", aberta pelo endereço, dizia "Nada para responder agora" quando o
 * cartão do Início a oferecia.
 */
const raiz = join(__dirname, '..')
const fonte = (arq: string) => readFileSync(join(raiz, arq), 'utf8')

const campo = (id: string, label: string, required = true) => ({ id, type: 'text' as const, label, required })
const velha: AnamnesisRow[] = [{ id: 'r1', fields: [campo('alergia', 'Tem alguma alergia?')] }]
const atual: AnamnesisRow[] = [{ id: 'r1', fields: [campo('alergia', 'Tem alguma alergia?'), campo('anticoagulante', 'Usa anticoagulante?')] }]
const respondida = (respostas: Record<string, string>, origem: AnamneseGeral['origem'] = 'CLIENTE_APP'): AnamneseGeral => ({
  versao: 2, ficha: { formId: 'f', nome: 'Ficha de saúde', rows: velha }, respostas,
  respondidoEm: '2026-11-20T12:00:00.000Z', origem, respondidoPor: null,
})

describe('a ficha respondida numa versão sem a obrigatória nova está pendente (a conta do Finalizar)', () => {
  it('diz as obrigatórias da ficha atual que as respostas gravadas não cobrem', async () => {
    const { obrigatoriasNovasQueFaltam } = await import('@/lib/atendimento/obrigatorias')
    expect(obrigatoriasNovasQueFaltam(atual, respondida({ alergia: 'Não' }))).toEqual(['Usa anticoagulante?'])
    expect(obrigatoriasNovasQueFaltam(atual, respondida({ alergia: 'Não', anticoagulante: 'Não' }))).toEqual([])
    // A nunca respondida (ou vazia) não é "de outra versão": é a não respondida.
    expect(obrigatoriasNovasQueFaltam(atual, null)).toEqual([])
    expect(obrigatoriasNovasQueFaltam(atual, respondida({}))).toEqual([])
  })
})

describe('D7: o app oferece a ficha dentro da validade quando falta a obrigatória nova', () => {
  const agora = new Date('2026-11-27T12:00:00.000Z')
  const base = { pendente: false, proximoAgendamentoId: 'ag1', temFichaAtiva: true, ultimaResposta: '2026-11-20T12:00:00.000Z', validadeMeses: 6, agora }
  it('oferece com a obrigatória nova em branco, e não sem ela', async () => {
    const { ofereceAFichaNoApp } = await import('@/lib/pre-atendimento/oferta-no-app')
    expect(ofereceAFichaNoApp({ ...base, faltaObrigatoria: true })).toBe('ag1')
    expect(ofereceAFichaNoApp({ ...base, faltaObrigatoria: false })).toBeNull()
    expect(ofereceAFichaNoApp({ ...base, faltaObrigatoria: true, pendente: true })).toBeNull()
  })
  it('a oferta lê a falta pela ficha atual da rede, com a conta do Finalizar', () => {
    const f = fonte('lib/pre-atendimento/ficha.ts')
    expect(f).toMatch(/faltaObrigatoria: obrigatoriasNovasQueFaltam\(/)
  })
  it('aberta, a ficha pede a resposta inteira, já preenchida com as de antes (não "Nada mudou")', async () => {
    const { modoDaFichaPeloLink, modoDoPendentePelaFichaAtual } = await import('@/lib/pre-atendimento/modo-da-ficha')
    const semANova = respondida({ alergia: 'Não' })
    expect(modoDoPendentePelaFichaAtual('CONFIRMAR', atual, semANova)).toBe('COMPLETO')
    expect(modoDaFichaPeloLink({ conferir: false, modoDoPendente: modoDoPendentePelaFichaAtual('CONFIRMAR', atual, semANova), atual: semANova })).toBe('COMPLETO')
    // Com todas as obrigatórias cobertas, o modo de sempre.
    const completa = respondida({ alergia: 'Não', anticoagulante: 'Não' })
    expect(modoDoPendentePelaFichaAtual('CONFIRMAR', atual, completa)).toBe('CONFIRMAR')
    expect(modoDoPendentePelaFichaAtual('COMPLETO', atual, completa)).toBe('COMPLETO')
    // O app e o link corrigem o modo do pendente pela ficha atual antes de decidir a tela.
    expect(fonte('app/[slug]/cliente/pre-atendimento/page.tsx')).toMatch(/modo: modoDoPendentePelaFichaAtual\(gravado\.modo, gravado\.ficha\.rows, atual\)/)
    expect(fonte('lib/pre-atendimento/link-publico.ts')).toMatch(/modo: modoDoPendentePelaFichaAtual\(pendente\.modo, pendente\.ficha\.rows, atual\)/)
  })
})

describe('A17: a aba Prontuário da ficha mostra a pergunta nova pendente', () => {
  it('o cartão da ficha de saúde diz o que falta da ficha atual, pela mesma conta', () => {
    const c = fonte('components/branch/anamnese-geral.tsx')
    expect(c).toMatch(/obrigatoriasNovasQueFaltam\(fichaAtual\.rows, anamnese\)/)
    expect(c).toContain('data-ficha-de-saude-pendente')
  })
  it('o texto da pendência', async () => {
    const { textoDaPendenciaDaFicha } = await import('@/lib/atendimento/obrigatorias')
    expect(textoDaPendenciaDaFicha(['Usa anticoagulante?'])).toBe('Falta responder: "Usa anticoagulante?"')
    expect(textoDaPendenciaDaFicha(['A', 'B'])).toBe('Falta responder: "A", "B"')
  })
})

describe('A16: a página da ficha, aberta pelo endereço, oferece a ficha como o cartão do Início', () => {
  it('sem pendente e com a oferta valendo, a página mostra o cartão que abre a ficha', () => {
    const p = fonte('app/[slug]/cliente/pre-atendimento/page.tsx')
    expect(p).toMatch(/ofertaDaFichaDaCliente\(admin, ctx\.clientId!\)/)
    expect(p).toMatch(/<OfertaDaFichaDeSaude appointmentId=\{oferta\}/)
    expect(fonte('lib/pre-atendimento/ficha.ts')).toMatch(/export async function ofertaDaFichaDaCliente\(/)
  })
  it('o cartão, na própria página, recarrega em vez de navegar para ela mesma', () => {
    const c = fonte('components/client-portal/oferta-da-ficha-de-saude.tsx')
    expect(c).toMatch(/usePathname\(\)/)
    expect(c).toMatch(/router\.refresh\(\)/)
  })
})
