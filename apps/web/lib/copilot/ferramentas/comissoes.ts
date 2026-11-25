import 'server-only'
import { z } from 'zod/v4'
import { alcancaUnidade, vistaPessoal } from '@/lib/auth'
import { configDeComissaoDaRede, resumoDasComissoes } from '@/lib/comissoes/leitura'
import { periodosRecentes } from '@/lib/comissoes/periodo'
import { totaisDoResumoDasComissoes } from '@/lib/metrics/comissoes'
import { unidadesParaLer } from '@/lib/unidades/da-tela'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { dinheiro, rota } from '@/lib/copilot/ferramentas/comum'

/**
 * As MINHAS COMISSÕES (a vista pessoal, SM2 — CLAUDE.md §11), no Copilot desde
 * a revisão de 24/11 (docs/catalogo/copilot.md, Q03): quem atende ou tem
 * comissão no nome e não tem o Financeiro pergunta pela comissão DELA. Só lê, e
 * só as dela — o recorte é o id dela (`vistaPessoal`), nunca um nome do pedido.
 * Os mesmos números da tela "Minhas comissões" (`ComissoesDaEquipe`): o resumo
 * do banco (`resumoDasComissoes`) somado em lib/metrics, no período de
 * fechamento da rede, nas unidades de leitura ao alcance dela.
 */
export const minhasComissoes: FerramentaDeLeitura<{ anteriores?: number }> = {
  nome: 'minhas_comissoes',
  tipo: 'leitura',
  recurso: 'comissoes',
  // Só quem tem a vista: sem o Financeiro (com ele, as de todos vêm de `indicadores`).
  pode: ctx => vistaPessoal(ctx, 'financial') !== null,
  descricao: 'As Minhas comissões: só as DESTA pessoa (ela não tem o Financeiro), no período de fechamento das comissões da rede — o atual, ou um anterior (anteriores=1 é o de antes). Devolve o lançado no período (liberado), o a pagar, o pago e o aguardando (o que ela vai receber quando a cliente pagar tudo), e por unidade quando há mais de uma. Só lê: as dos outros não vêm, e fechar e pagar pede o Financeiro em Gerenciar. Na resposta, diga o período ("periodo").',
  parametros: z.object({
    anteriores: z.number().int().min(0).max(11).optional().describe('0 (padrão) = o período atual; 1 = o anterior; até 11.'),
  }),
  async executar(c, args) {
    const eu = vistaPessoal(c.ctx, 'financial')
    if (!eu) return { dados: { erro: 'As Minhas comissões são de quem atende ou tem comissão no nome e não tem o Financeiro.' } }
    const tenantId = c.ctx.tenantId!
    const agora = new Date()
    const [config, fuso, lidas] = await Promise.all([
      configDeComissaoDaRede(tenantId),
      fusoDaRede(tenantId),
      // As de LEITURA (a desativada com o que ficou conta), como a tela; só as ao alcance dela.
      unidadesParaLer(tenantId, { periodo: { de: new Date(agora.getTime() - 400 * 86_400_000), ate: agora } }),
    ])
    const periodos = periodosRecentes(config.periodo, agora, 12, fuso)
    const periodo = periodos[args.anteriores ?? 0] ?? periodos[0]!
    const unidades = lidas.filter(u => alcancaUnidade(c.ctx, u.id))
    if (!unidades.length) return { dados: { periodo: periodo.rotulo, erro: 'Nenhuma unidade ao seu alcance.' } }
    const resumo = await resumoDasComissoes({
      tenantId, branchIds: unidades.map(u => u.id), inicio: periodo.inicio, fim: periodo.fim, profissionalId: eu,
    })
    const totais = totaisDoResumoDasComissoes(resumo)
    const href = rota(c, `/financeiro/comissoes?periodo=${periodo.chave}`)
    return {
      dados: {
        periodo: periodo.rotulo,
        liberado: dinheiro(totais.liberado), aPagar: dinheiro(totais.aPagar), pago: dinheiro(totais.pago), aguardando: dinheiro(totais.aguardando),
        ...(resumo.length > 1 ? {
          porUnidade: resumo.map(r => ({ unidade: r.branchName, liberado: dinheiro(r.liberado), aPagar: dinheiro(r.aPagar), pago: dinheiro(r.pago), aguardando: dinheiro(r.aguardando) })),
        } : {}),
        href,
      },
      cartao: { tipo: 'links', itens: [{ texto: `Minhas comissões · ${periodo.rotulo}`, detalhe: `A pagar ${dinheiro(totais.aPagar)} · pago ${dinheiro(totais.pago)}`, href }] },
    }
  },
}
