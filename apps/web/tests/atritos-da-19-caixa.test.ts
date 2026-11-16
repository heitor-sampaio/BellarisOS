import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  formasDaComandaEmTexto, estornoDaVendaEmTexto, recebidaAgoraEmTexto, voucherDoProdutoEstornadoEmTexto,
  type ComandaDoPdv, type ProdutoNaComanda,
} from '@/lib/pdv/situacoes'
import { diferencaAoDigitar } from '@/lib/financeiro/conferencia-do-fechamento'
import { textoDaReaberturaDoPacote } from '@/lib/financeiro/reabertura-do-estorno'
import { vinculosDoExtrato } from '@/lib/comissoes/extrato-texto'
import type { LancamentoDoExtrato } from '@/lib/comissoes/leitura'

/**
 * Os defeitos e atritos do PDV, do caixa e das comissões na 19ª simulação
 * (2026-11-16). O de tela e banco (D1) está em `e2e/pdv-atritos-da-19.spec.ts`.
 */

const WEB = join(__dirname, '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const sp = (s: string | null | undefined) => s?.replace(/\s/g, ' ') ?? null
const hora = (iso: string | null) => (iso ? iso.slice(11, 16) : '')

const comanda = (mais: Partial<ComandaDoPdv>): ComandaDoPdv => ({
  id: 'c', numero: 1, origem: 'ATENDIMENTO', abertaEm: '2026-11-16T09:00:00Z', canceladaEm: null, canceladaMotivo: null,
  clienteId: 'cl', cliente: 'Larissa', agendamentoId: 'ag', procedimento: 'Limpeza', profissional: 'Sofia', agendadoPara: null,
  atendimento: 'COMPLETED', valor: 340, paga: true, pagaEm: '2026-11-16T09:10:00Z', recebido: 340, forma: 'PIX', estornada: false,
  planoId: null, emAberto: 0, parcelasEmAberto: 0, proximaParcela: null, produtos: 0, jaPago: 0,
  formas: [], desconto: 0, fidelidade: 0, voucher: null, estornoAnterior: null,
  ...mais,
})

// ─── D1: a comanda da venda estornada e recebida de novo vale o vendido uma vez ──
describe('D1: a migration tira do valor o lançamento estornado que foi reaberto', () => {
  const nome = readdirSync(join(WEB, '../../supabase/migrations')).find(f => /^20261119\d+_pdv_comanda_venda_estornada/.test(f))
  it('existe, e o lateral da venda pula o estornado que ganhou o reaberto', () => {
    expect(nome, 'a migration 20261119…_pdv_comanda_venda_estornada…').toBeTruthy()
    const sql = ler(`../../supabase/migrations/${nome}`)
    expect(sql).toMatch(/substituida/)
    expect(sql).toMatch(/'bandeira'/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })
})

describe('D1: a comanda da venda cita o estorno anterior', () => {
  const estorno = { quando: '2026-11-16T09:27:00Z', valor: 1000, forma: 'DEBIT_CARD', vezes: 1, desconto: 0, fidelidade: 0, voucher: null }
  it('a receber de novo: o estorno e o valor que voltou a receber', () => {
    expect(sp(estornoDaVendaEmTexto(comanda({ origem: 'VENDA', emAberto: 1000, estornoAnterior: estorno }), hora)))
      .toBe('Estornada às 09:27 — R$ 1.000,00, Débito: o valor voltou a receber.')
  })
  it('recebida de novo: diz que é de novo, depois do estorno', () => {
    expect(sp(estornoDaVendaEmTexto(comanda({ origem: 'VENDA', estornoAnterior: estorno }), hora)))
      .toBe('Recebida de novo depois do estorno das 09:27 (R$ 1.000,00, Débito).')
  })
  it('sem estorno, ou na comanda do atendimento (a regra da 17ª), nulo', () => {
    expect(estornoDaVendaEmTexto(comanda({ origem: 'VENDA' }), hora)).toBeNull()
    expect(estornoDaVendaEmTexto(comanda({ origem: 'ATENDIMENTO', estornoAnterior: estorno }), hora)).toBeNull()
  })
  it('a tela mostra a frase na comanda da venda', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/data-estorno-da-venda/)
  })
})

// ─── A1: a bandeira na forma da comanda paga ────────────────────────────────
describe('A1: a comanda paga diz a bandeira', () => {
  it('"Crédito Mastercard 10x"', () => {
    expect(formasDaComandaEmTexto(comanda({ forma: 'CREDIT_CARD', formas: [{ forma: 'CREDIT_CARD', vezes: 10, valor: 2060, bandeira: 'MASTERCARD' }] })))
      .toBe('Crédito Mastercard 10x')
  })
  it('duas formas, cada uma com a sua bandeira', () => {
    expect(sp(formasDaComandaEmTexto(comanda({
      formas: [{ forma: 'PIX', vezes: 1, valor: 220 }, { forma: 'DEBIT_CARD', vezes: 1, valor: 120, bandeira: 'VISA' }],
    })))).toBe('Pix R$ 220,00 + Débito Visa R$ 120,00')
  })
  it('a lista de pagamentos da comanda também leva a bandeira', () => {
    expect(ler('lib/pdv/lancamentos-da-comanda.ts')).toMatch(/cartao_bandeira/)
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/bandeira: l\.bandeira/)
  })
})

// ─── A2: depois de "Receber", a tela diz o que recebeu ───────────────────────
describe('A2: o recebido aparece depois de receber', () => {
  it('"Recebido R$ 2.060,00 (Crédito Mastercard 10x)…"', () => {
    expect(sp(recebidaAgoraEmTexto(comanda({ recebido: 2060, formas: [{ forma: 'CREDIT_CARD', vezes: 10, valor: 2060, bandeira: 'MASTERCARD' }] }))))
      .toBe('Recebido R$ 2.060,00 (Crédito Mastercard 10x). A comanda saiu das abertas e está em “Pagas hoje”.')
  })
  it('só da comanda paga', () => {
    expect(recebidaAgoraEmTexto(comanda({ paga: false }))).toBeNull()
  })
  it('a tela leva a comanda recebida na URL e mostra a frase', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).toMatch(/recebida:/)
    expect(tela).toMatch(/data-recebida-agora/)
    expect(ler('app/_shared/pdv.tsx')).toMatch(/recebida/)
  })
})

// ─── A3: a diferença do "Fechar de novo" muda enquanto se digita ─────────────
describe('A3: diferencaAoDigitar', () => {
  it('conferido − registrado, em centavos', () => {
    expect(diferencaAoDigitar('180,00', 180)).toBe(0)
    expect(diferencaAoDigitar('175', 180)).toBe(-5)
    expect(diferencaAoDigitar('−210,00', -200)).toBe(-10)
    expect(diferencaAoDigitar('0,1', 0.2)).toBe(-0.1)
  })
  it('vazio ou ilegível: nulo (a tela segue com o que tinha)', () => {
    expect(diferencaAoDigitar('', 10)).toBeNull()
    expect(diferencaAoDigitar('abc', 10)).toBeNull()
  })
  it('a tela usa enquanto confere', () => {
    expect(ler('components/shared/fechamento-do-dia-tela.tsx')).toMatch(/diferencaAoDigitar\(/)
  })
})

// ─── A4: o PDV no celular não diz "à esquerda" ──────────────────────────────
describe('A4: o texto da comanda não escolhida', () => {
  it('fala da lista, não do lado', () => {
    const tela = ler('components/shared/pdv/pdv-tela.tsx')
    expect(tela).not.toMatch(/Escolha uma comanda à esquerda/)
    expect(tela).toMatch(/Escolha uma comanda na lista/)
  })
})

// ─── A5: o telefone com máscara na Nova venda ───────────────────────────────
describe('A5: o telefone da cliente com máscara', () => {
  it('a Nova venda passa o telefone por maskPhone', () => {
    const tela = ler('components/shared/pdv/nova-venda.tsx')
    expect(tela).not.toMatch(/\{venda\.cliente\.phone\}/)
    expect(tela).not.toMatch(/\{c\.phone\}/)
    expect(tela).toMatch(/maskPhone\(/)
  })
})

// ─── A6: o estorno do pacote com sessão feita diz a sessão ───────────────────
describe('A6: textoDaReaberturaDoPacote', () => {
  it('sem sessão feita, a frase de antes', () => {
    expect(sp(textoDaReaberturaDoPacote(1000, 0, 5)))
      .toBe('O dinheiro volta à cliente, e o pacote volta a ter R$ 1.000,00 a receber. Para desfazer a venda, use “Cancelar pacote” na ficha.')
  })
  it('"1 das 5 sessões já foi feita"', () => {
    expect(sp(textoDaReaberturaDoPacote(1000, 1, 5)))
      .toBe('O dinheiro volta à cliente, e o pacote volta a ter R$ 1.000,00 a receber. 1 das 5 sessões já foi feita, e o pacote segue com as 4 que restam. Para desfazer a venda, use “Cancelar pacote” na ficha.')
  })
  it('no plural, e todas feitas', () => {
    expect(sp(textoDaReaberturaDoPacote(500, 2, 5))).toContain('2 das 5 sessões já foram feitas, e o pacote segue com as 3 que restam.')
    expect(sp(textoDaReaberturaDoPacote(500, 4, 5))).toContain('4 das 5 sessões já foram feitas, e o pacote segue com a 1 que resta.')
    expect(sp(textoDaReaberturaDoPacote(500, 5, 5))).toContain('As 5 sessões já foram feitas.')
  })
  it('a action usa a frase', () => {
    expect(ler('actions/financial.ts')).toMatch(/textoDaReaberturaDoPacote\(/)
  })
})

// ─── A7: o voucher depois do estorno só do produto ──────────────────────────
describe('A7: voucherDoProdutoEstornadoEmTexto', () => {
  const estornado: ProdutoNaComanda = { nome: 'Protetor', quantidade: 1, vendido: true, estornadoEm: '2026-11-16T10:00:00Z', voltouAoEstoque: true }
  const vendido: ProdutoNaComanda = { ...estornado, estornadoEm: null, voltouAoEstoque: null }
  it('a comanda paga com voucher e produto estornado diz que o voucher segue usado', () => {
    expect(sp(voucherDoProdutoEstornadoEmTexto(comanda({ fidelidade: 28.71, voucher: 'Voucher R$ 30' }), [estornado])))
      .toBe('O voucher “Voucher R$ 30” segue usado na parte do atendimento (R$ 28,71). A parte dele no produto estornado saiu com o estorno.')
  })
  it('sem voucher, sem produto estornado, ou a receber: nulo', () => {
    expect(voucherDoProdutoEstornadoEmTexto(comanda({}), [estornado])).toBeNull()
    expect(voucherDoProdutoEstornadoEmTexto(comanda({ fidelidade: 30, voucher: 'V' }), [vendido])).toBeNull()
    expect(voucherDoProdutoEstornadoEmTexto(comanda({ paga: false, fidelidade: 30, voucher: 'V' }), [estornado])).toBeNull()
  })
  it('a tela mostra a frase', () => {
    expect(ler('components/shared/pdv/pdv-tela.tsx')).toMatch(/data-voucher-do-produto-estornado/)
  })
})

// ─── A8: o extrato da comissão diz o vínculo do estorno ──────────────────────
describe('A8: vinculosDoExtrato', () => {
  const linha = (mais: Partial<LancamentoDoExtrato>): LancamentoDoExtrato => ({
    id: 'x', professionalId: 'p', branchId: 'b', releasedAt: '2026-11-16T06:42:00Z', kind: 'LIBERACAO', motivo: null, amount: 500,
    status: 'OPEN', payoutId: null, appointmentId: 'ag', scheduledAt: null, cliente: 'Isabela', procedimento: 'Bioestimulador',
    origem: 'AVULSO', preco: 2000, regraTipo: 'PERCENTAGE', regraValor: 25, pacote: null, descontaTaxa: false, descontaInsumos: false,
    previsto: null, baseComPontos: null, plano: null, base: 2000, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1,
    pagoEm: null, regraDe: null, transacaoId: 't1', ...mais,
  })
  // O extrato vem do mais novo ao mais velho.
  const linhas = [
    linha({ id: 'l2', releasedAt: '2026-11-16T06:50:00Z', transacaoId: 't2' }),
    linha({ id: 'e1', releasedAt: '2026-11-16T06:45:00Z', kind: 'ESTORNO', amount: -500, motivo: 'Estorno do pagamento' }),
    linha({ id: 'l1' }),
  ]
  it('o estorno diz qual liberação desfaz, e a liberação seguinte diz que é de novo', () => {
    const v = vinculosDoExtrato(linhas, hora)
    expect(v.get('e1')).toBe('desfaz a liberação das 06:42')
    expect(v.get('l2')).toBe('de novo, depois do estorno das 06:45')
    expect(v.has('l1')).toBe(false)
  })
  it('sem estorno, nenhum vínculo', () => {
    expect(vinculosDoExtrato([linha({})], hora).size).toBe(0)
  })
  it('a leitura traz a transação de cada linha, e a tela mostra o vínculo', () => {
    expect(ler('lib/comissoes/leitura.ts')).toMatch(/transacaoId/)
    expect(ler('components/shared/financeiro-comissoes.tsx')).toMatch(/vinculosDoExtrato\(/)
  })
})
