import 'server-only'
import { z } from 'zod/v4'
import { ler } from '@/lib/db'
import { getCobrancaDoWhatsapp } from '@/lib/metrics/whatsapp'
import { ROTULO_DA_CATEGORIA, TABELA_DA_META, type CategoriaDeCobranca } from '@/lib/whatsapp/cobranca'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { dinheiro, quandoLegivel, rota } from '@/lib/copilot/ferramentas/comum'

/**
 * O que a META cobra da clínica (2026-10-15): o mês de cada número oficial —
 * o mesmo bloco de Configurações → Integrações (`getCobrancaDoWhatsapp`), com
 * a mesma trava (Configurações em Gerenciar). Só leitura: conectar, trocar e
 * pagar ficam na tela e no Gerenciador do WhatsApp da Meta.
 */
export const cobrancaDoWhatsapp: FerramentaDeLeitura<Record<string, never>> = {
  nome: 'cobranca_do_whatsapp',
  tipo: 'leitura',
  modulo: 'settings', nivel: 'MANAGE',
  descricao: `O que a Meta cobrou da clínica neste mês em cada número do WhatsApp oficial: mensagens entregues e cobradas por categoria (marketing, utilidade, autenticação, respostas), a estimativa em reais, as ${TABELA_DA_META.respostasGratisPorMes} respostas grátis do mês e se a Meta recusou por falta de forma de pagamento. A cobrança é na conta da clínica na Meta, não no BellarisOS.`,
  parametros: z.object({}),
  async executar(c) {
    const numeros = (await ler(c.admin.from('whatsapp_numbers').select('id, label, phone_e164')
      .eq('tenant_id', c.ctx.tenantId!).eq('provider', 'official').eq('is_active', true), 'ler os números oficiais') as
      { id: string; label: string | null; phone_e164: string | null }[] | null) ?? []
    if (!numeros.length) return { dados: { numeros: [], aviso: 'A clínica não tem número do WhatsApp oficial: o WhatsApp Web (não oficial) não é cobrado pela Meta.' } }
    const cobranca = await getCobrancaDoWhatsapp(c.ctx.tenantId!)
    return {
      dados: {
        mes: 'o mês atual (horário de Brasília)',
        numeros: numeros.map(n => {
          const x = cobranca.get(n.id)
          const cat = (k: CategoriaDeCobranca) => x?.porCategoria[k] ?? { entregues: 0, cobradas: 0 }
          return {
            numero: n.label ?? n.phone_e164 ?? 'Sem nome', telefone: n.phone_e164,
            porCategoria: (['marketing', 'utility', 'authentication', 'service'] as const).map(k => ({ categoria: ROTULO_DA_CATEGORIA[k], ...cat(k) })),
            estimativa: dinheiro(x?.estimativa ?? 0),
            respostasGratisUsadas: `${Math.min(cat('service').entregues, TABELA_DA_META.respostasGratisPorMes)} de ${TABELA_DA_META.respostasGratisPorMes}`,
            pagamentoRecusado: !!x?.pagamentoRecusadoEm,
            ...(x?.pagamentoRecusadoEm ? { recusadoEm: quandoLegivel(x.pagamentoRecusadoEm), oQueFazer: 'Cadastrar um cartão na conta do WhatsApp da clínica, no Gerenciador do WhatsApp da Meta (Faturamento), e enviar de novo.' } : {}),
          }
        }),
        nota: `Estimativa pela tabela de preços da Meta no Brasil (vigente desde ${TABELA_DA_META.vigencia.split('-').reverse().join('/')}); a fatura de verdade é a da Meta.`,
        tela: rota(c, '/settings?tab=integrations'),
      },
    }
  },
}
