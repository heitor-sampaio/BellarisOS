import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pagamentoNormalizado } from '@/lib/checkout/pagamento'
import { mudaOCombinadoDoContrato } from '@/lib/pdv/contrato-combinado'

/**
 * D1 da 33ª simulação (a mais séria da rodada): o contrato do procedimento foi
 * assinado para "crédito 3x", e o PDV recebeu Pix com 5% de desconto sem
 * perguntar nada — o contrato seguiu assinado com o crédito 3x, sem substituir.
 *
 * DG-03 (catálogo de Documentos): "Mudar o pagamento (ou o desconto) de um
 * contrato já assinado substitui o contrato, e a tela pergunta antes …, com
 * 'Substituir o contrato' ou 'Manter o pagamento combinado'. Só confirmado, o
 * assinado vira substituído e nasce um novo para a cliente assinar." VD-10: "trocar
 * o desconto depois de assinado substitui o contrato, como trocar a forma." O
 * plano (A45 da 5ª) e o pacote já perguntam; o receber da comanda do
 * atendimento só escrevia "Combinado no contrato: …".
 */

const WEB = join(__dirname, '..')
const RAIZ = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8').replace(/\r/g, '')

const credito3x = pagamentoNormalizado({ forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 })

describe('a regra pura: o que se recebe muda o combinado do contrato assinado?', () => {
  it('o mesmo pagamento (a maquininha e a bandeira não são do combinado, MQ-15) não muda', () => {
    expect(mudaOCombinadoDoContrato(credito3x, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3, bandeira: 'VISA', maquininha: 'm1' }, 0)).toBe(false)
  })

  it('outra forma muda (o caso da B03: crédito 3x × Pix)', () => {
    expect(mudaOCombinadoDoContrato(credito3x, { forma: 'AVISTA', metodo: 'PIX' }, 0)).toBe(true)
  })

  it('outras vezes no cartão mudam', () => {
    expect(mudaOCombinadoDoContrato(credito3x, { forma: 'AVISTA', metodo: 'CREDIT_CARD' }, 0)).toBe(true)
  })

  it('o desconto faz parte do combinado (VD-10): dar desconto, tirar o combinado ou mudar o valor muda', () => {
    expect(mudaOCombinadoDoContrato(credito3x, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }, 57)).toBe(true)
    const comDesconto = pagamentoNormalizado({ forma: 'AVISTA', metodo: 'PIX' }, 57)
    expect(mudaOCombinadoDoContrato(comDesconto, { forma: 'AVISTA', metodo: 'PIX' }, 57)).toBe(false)
    expect(mudaOCombinadoDoContrato(comDesconto, { forma: 'AVISTA', metodo: 'PIX' }, 0)).toBe(true)
    expect(mudaOCombinadoDoContrato(comDesconto, { forma: 'AVISTA', metodo: 'PIX' }, 60)).toBe(true)
  })

  it('o combinado "no atendimento" não diz a forma: qualquer forma o cumpre; só o desconto muda', () => {
    const noAtendimento = pagamentoNormalizado(null)
    expect(mudaOCombinadoDoContrato(noAtendimento, { forma: 'AVISTA', metodo: 'PIX' }, 0)).toBe(false)
    expect(mudaOCombinadoDoContrato(noAtendimento, { forma: 'PARCELADO', metodo: null, entrada: 0, parcelas: 3, primeiroVencimento: '2026-12-10T15:00:00.000Z' }, 0)).toBe(false)
    expect(mudaOCombinadoDoContrato(noAtendimento, { forma: 'AVISTA', metodo: 'PIX' }, 10)).toBe(true)
  })

  it('o crediário combinado: as mesmas parcelas no mesmo dia não mudam; outro vencimento muda', () => {
    const crediario = pagamentoNormalizado({ forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3, primeiroVencimento: '2026-12-10T15:00:00.000Z' })
    expect(mudaOCombinadoDoContrato(crediario, { forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3, primeiroVencimento: '2026-12-10T12:00:00.000Z' }, 0)).toBe(false)
    expect(mudaOCombinadoDoContrato(crediario, { forma: 'PARCELADO', metodo: 'PIX', entrada: 100, parcelas: 3, primeiroVencimento: '2026-12-11T12:00:00.000Z' }, 0)).toBe(true)
  })

  it('sem retrato (o contrato não cita o pagamento), nada a perguntar', () => {
    expect(mudaOCombinadoDoContrato(null, { forma: 'AVISTA', metodo: 'PIX' }, 0)).toBe(false)
  })
})

describe('o receber da comanda pergunta antes, como o plano e o pacote', () => {
  const action = ler('actions/appointments.ts')
  const inicio = action.indexOf('async function confirmarOPagamento(')
  const corpo = action.slice(inicio, action.indexOf('\nexport async function previaDoPagamento'))

  it('a action devolve a pergunta (sem gravar nada) quando o pagamento muda o contrato assinado', () => {
    expect(corpo).toMatch(/contratoQueMudaNoReceber\(/)
    expect(corpo).toMatch(/substituiContrato/)
    // A pergunta vem ANTES da gravação: sem a resposta, o banco não é chamado.
    expect(corpo.indexOf('contratoQueMudaNoReceber(')).toBeLessThan(corpo.indexOf("rpc('confirmar_pagamento_do_atendimento'"))
    expect(corpo).toMatch(/formData\.get\('substituir_contrato'\)/)
  })

  it('a pergunta não fica guardada como envio feito: o "Substituir o contrato" é o mesmo envio e grava', () => {
    const topo = action.slice(action.indexOf('export async function confirmPayment('), inicio)
    expect(topo).toMatch(/gravou:/)
  })

  it('substituir é NA MESMA transação do dinheiro: o banco substitui (documento_substituir) e guarda o combinado novo', () => {
    expect(corpo).toMatch(/substituir_contrato:/)
    expect(corpo).toMatch(/retrato_do_contrato:/)
    const migracoes = readdirSync(join(RAIZ, 'supabase', 'migrations')).filter(f => f.startsWith('202612124'))
    const sql = migracoes.map(f => readFileSync(join(RAIZ, 'supabase', 'migrations', f), 'utf8')).join('\n')
    expect(sql).toMatch(/confirmar_pagamento_do_atendimento/)
    expect(sql).toMatch(/public\.documento_substituir\(/)
    expect(sql).toMatch(/retrato_do_contrato/)
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*$/)
  })

  it('a tela mostra a pergunta com as duas respostas, e o combinado vem inteiro (as vezes, o crediário)', () => {
    const tela = ler('components/shared/receber-atendimento.tsx')
    expect(tela).toMatch(/data-substitui-contrato/)
    expect(tela).toMatch(/Manter o pagamento combinado/)
    expect(tela).toMatch(/Substituir o contrato/)
    expect(tela).toMatch(/name="substituir_contrato"/)
    expect(tela).toMatch(/estadoDoPagamento\(pagamentoCombinado\?\.pagamento/)
  })
})
