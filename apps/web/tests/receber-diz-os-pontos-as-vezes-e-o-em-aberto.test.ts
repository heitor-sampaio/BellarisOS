import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recebidaAgoraEmTexto, rotuloDoPagamentoDaComanda, TEXTO_PONTOS_SO_A_VISTA, type ComandaDoPdv } from '@/lib/pdv/situacoes'

/**
 * O receber da comanda diz o que faz (princípio 3).
 *
 * D16 (PD-06): no crediário e no "A receber", o "Receber" da comanda escondia
 * os pontos e o voucher sem dizer por quê; a venda dizia "Os pontos e o
 * voucher se usam no pagamento à vista." — a mesma fonte nos dois.
 * A20 (MQ-01, decisão do Claude: o aviso vale em todo campo de vezes): acima
 * de 12x a tela avisa e deixa (princípio 2).
 * A23 (PV-14): o aviso do "A receber" dizia "Recebido R$ 0,00 (A receber)…"
 * sem o valor que ficou em aberto nem quando vence.
 * A30: a parcela do crediário recebida aparecia na comanda como
 * "Atendimento · Pix"; diz "Parcela 1/2 de <o quê>", como o PDV diz a parcela
 * em aberto.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ')
const comanda = (mais: Partial<ComandaDoPdv>): ComandaDoPdv => ({
  id: 'c', numero: 1, origem: 'ATENDIMENTO', abertaEm: '2026-11-16T09:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl', cliente: 'Hilda', agendamentoId: 'ag', procedimento: 'Limpeza', profissional: 'Sofia', agendadoPara: null,
  atendimento: 'COMPLETED', valor: 200, paga: true, pagaEm: '2026-11-26T15:10:00Z', recebido: 200, forma: 'PIX', estornada: false,
  planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...mais,
} as ComandaDoPdv)

describe('D16: no crediário, o receber da comanda diz por que não há pontos nem voucher', () => {
  it('o texto é um só, o da venda', () => {
    expect(TEXTO_PONTOS_SO_A_VISTA).toBe('Os pontos e o voucher se usam no pagamento à vista.')
  })
  it('a comanda o mostra fora do à vista, e a venda o importa (não copia)', () => {
    const receber = ler('components/shared/receber-atendimento.tsx')
    expect(receber).toMatch(/import \{[^}]*TEXTO_PONTOS_SO_A_VISTA[^}]*\} from '@\/lib\/pdv\/situacoes'/)
    expect(receber).toMatch(/!aVista && [^\n]*\n?[^\n]*data-pontos-so-a-vista/)
    const venda = ler('components/shared/pontos-na-venda.tsx')
    expect(venda).toContain('TEXTO_PONTOS_SO_A_VISTA')
    expect(venda).not.toContain('Os pontos e o voucher se usam no pagamento à vista.')
  })
})

describe('A20: acima de 12x, o campo das vezes avisa (e deixa)', () => {
  it('a dica das vezes, usada em todo campo de vezes, traz o aviso', () => {
    const t = ler('components/shared/resumo-das-vezes.tsx')
    expect(t).toContain('avisoDasVezesNoCartao(vezes)')
    expect(t).toContain('data-aviso-das-vezes')
  })
})

describe('A23: o aviso do "A receber" diz o que ficou em aberto e quando', () => {
  it('nada recebido agora: o valor em aberto e o vencimento', () => {
    const c = comanda({ recebido: 0, forma: 'A_RECEBER', emAberto: 200, proximaParcela: '2026-12-06T15:00:00Z' })
    expect(sp(recebidaAgoraEmTexto(c, 'America/Rio_Branco')))
      .toBe('Nada recebido agora (A receber): R$ 200,00 em aberto, vence em 06/12. A comanda saiu das abertas e está em “Fechadas hoje”.')
  })
  it('com entrada: o que entrou e o que ficou', () => {
    const c = comanda({ recebido: 100, forma: 'CREDIARIO', formas: [{ forma: 'PIX', vezes: 1, valor: 100 }] as never,
      emAberto: 200, parcelasEmAberto: 2, proximaParcela: '2026-12-06T15:00:00Z' })
    expect(sp(recebidaAgoraEmTexto(c, 'America/Sao_Paulo')))
      .toBe('Recebido R$ 100,00 (Crediário (Pix)). Ficou R$ 200,00 em aberto (2 parcelas, a 1ª em 06/12). A comanda saiu das abertas e está em “Fechadas hoje”.')
  })
  it('a tela passa o fuso da rede', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/recebidaAgoraEmTexto\(recebidaAgora, fuso\)/)
  })
})

describe('A30: a parcela recebida diz que é parcela, e de quê', () => {
  const base = { valor: 150, metodo: 'PIX', vezes: null, doAtendimento: true, vendaDeProduto: false, vendaDeCredito: false }
  it('"Parcela 1/2 de Peeling"', () => {
    expect(rotuloDoPagamentoDaComanda({ ...base, parcela: { numero: 1, total: 2 } }, 'Peeling')).toBe('Parcela 1/2 de Peeling')
    expect(rotuloDoPagamentoDaComanda({ ...base, parcela: { numero: 2, total: 2 } })).toBe('Parcela 2/2 do atendimento')
  })
  it('o pagamento à vista segue "Atendimento"', () => {
    expect(rotuloDoPagamentoDaComanda(base, 'Peeling')).toBe('Atendimento')
    expect(rotuloDoPagamentoDaComanda({ ...base, parcela: null }, 'Peeling')).toBe('Atendimento')
  })
  it('os pagamentos da comanda trazem o número da parcela, e a tela passa o procedimento', () => {
    expect(ler('lib/pdv/lancamentos-da-comanda.ts')).toMatch(/parcela_numero, parcela_total/)
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toContain('rotuloDoPagamentoDaComanda(l, c.procedimento)')
  })
})
