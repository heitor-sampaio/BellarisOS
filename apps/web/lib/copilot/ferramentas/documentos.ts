import 'server-only'
import { z } from 'zod/v4'
import { resolvePeriod } from '@/lib/metrics/period'
import { getDocumentosDoPainel, getResumoDosDocumentos } from '@/lib/metrics/documentos'
import {
  ROTULO_DA_SITUACAO, ROTULO_DO_CANAL, ROTULO_DO_ENVIO, ROTULO_DO_TIPO_DE_DOCUMENTO, type SituacaoDoDocumento, type TipoDeDocumento,
} from '@/lib/documentos/situacao'
import type { FerramentaDeLeitura } from '@/lib/copilot/ferramentas/tipos'
import { profissionalDoRecorte } from '@/lib/clientes/atendida-por'
import { DATA, quandoLegivel, resolverUnidade, rota } from '@/lib/copilot/ferramentas/comum'

/**
 * A tela de DOCUMENTOS (2026-10-14) como leitura: os termos e contratos
 * emitidos no período, com a situação de cada um — as mesmas funções da tela
 * (`lib/metrics/documentos`).
 *
 * Só a situação: o TEXTO do documento não vai ao modelo, nem o motivo livre de
 * uma dispensa (pode ter saúde no meio). Colher, gerar link e pedir no portal
 * continuam na ficha do cliente.
 */

const SITUACAO_DO_PEDIDO: Record<string, SituacaoDoDocumento> = {
  faltam_dados: 'FALTAM_DADOS', a_enviar: 'A_ENVIAR', enviado: 'ENVIADO', assinado: 'ASSINADO',
  dispensado: 'DISPENSADO', cancelado: 'CANCELADO',
}
const TIPO_DO_PEDIDO: Record<string, TipoDeDocumento> = { termo: 'TERMO', contrato: 'CONTRATO', contrato_de_plano: 'CONTRATO_PLANO' }
const PERIODOS = ['today', 'week', '7d', '15d', '30d', 'month', 'last_month', 'quarter', 'custom'] as const

export const documentos: FerramentaDeLeitura<{
  situacao?: keyof typeof SITUACAO_DO_PEDIDO; tipo?: keyof typeof TIPO_DO_PEDIDO; busca?: string
  periodo?: (typeof PERIODOS)[number]; de?: string; ate?: string; unidade?: string
}> = {
  nome: 'documentos',
  tipo: 'leitura',
  modulo: 'documents', nivel: 'VIEW',
  recurso: 'documentos',
  descricao: 'Os termos e contratos emitidos no período (padrão: o mês) e a situação de cada um: faltam_dados (o cadastro não tem o que o texto pede), a_enviar, enviado (por link, portal ou WhatsApp), assinado, dispensado, cancelado. Filtros: situacao, tipo (termo, contrato, contrato_de_plano), busca (cliente ou título), unidade. Traz o resumo por situação e até 30 documentos.',
  parametros: z.object({
    situacao: z.enum(Object.keys(SITUACAO_DO_PEDIDO) as [string, ...string[]]).optional(),
    tipo: z.enum(Object.keys(TIPO_DO_PEDIDO) as [string, ...string[]]).optional(),
    busca: z.string().max(80).optional(),
    periodo: z.enum(PERIODOS).optional(),
    de: DATA.optional(), ate: DATA.optional(),
    unidade: z.string().max(80).optional(),
  }),
  async executar(c, args) {
    const u = await resolverUnidade(c, args.unidade)
    if ('erro' in u) return { dados: { erro: u.erro } }
    // Como a tela: quem tem unidade fixa vê a dela; a rede, todas (null) ou a escolhida.
    const branchIds = c.ctx.branchId ? [c.ctx.branchId] : u.unidade ? [u.unidade.id] : null
    const periodo = args.periodo === 'custom' || (args.de && args.ate)
      ? resolvePeriod('custom', args.de, args.ate)
      : resolvePeriod(args.periodo ?? 'month')
    // Como a tela: com o prontuário "só os meus", só as clientes que ela atende.
    const recorte = {
      tenantId: c.ctx.tenantId!, branchIds, from: periodo.from, to: periodo.fullTo,
      professionalId: profissionalDoRecorte(c.ctx, 'medical_records'),
    }
    const [lista, resumo] = await Promise.all([
      getDocumentosDoPainel({
        ...recorte,
        situacao: args.situacao ? SITUACAO_DO_PEDIDO[args.situacao] : null,
        tipo: args.tipo ? TIPO_DO_PEDIDO[args.tipo] : null,
        busca: args.busca ?? null,
      }),
      getResumoDosDocumentos(recorte),
    ])
    const itens = lista.linhas.slice(0, 30).map(d => ({
      titulo: d.titulo, tipo: ROTULO_DO_TIPO_DE_DOCUMENTO[d.tipo], situacao: ROTULO_DA_SITUACAO[d.situacao],
      cliente: d.cliente, procedimento: d.procedimento,
      atendimento: d.agendamentoEm ? quandoLegivel(d.agendamentoEm) : null,
      emitidoEm: d.criadoEm.slice(0, 10),
      ...(d.faltando.length ? { faltaNoCadastro: d.faltando } : {}),
      ...(d.envio ? { enviadoPor: ROTULO_DO_ENVIO[d.envio] ?? d.envio } : {}),
      ...(d.assinadoEm ? { assinadoEm: d.assinadoEm.slice(0, 10), assinado: d.canal ? ROTULO_DO_CANAL[d.canal] ?? null : null } : {}),
      bloqueiaOAtendimento: d.exigencia === 'BLOQUEIA',
      href: rota(c, `/clients/${d.clienteId}`),
    }))
    return {
      dados: {
        periodo: periodo.label, unidade: u.unidade?.name ?? 'todas as unidades',
        resumo: {
          total: resumo.total, faltamDados: resumo.faltamDados, aEnviar: resumo.aEnviar, enviados: resumo.enviados,
          assinados: resumo.assinados, dispensados: resumo.dispensados, cancelados: resumo.cancelados,
        },
        quantidade: lista.total, documentos: itens,
        ...(lista.total > itens.length ? { aviso: `Mostrando ${itens.length} de ${lista.total}; a lista completa está na tela de Documentos.` } : {}),
        telaDeDocumentos: rota(c, '/documentos'),
      },
      cartao: itens.length
        ? { tipo: 'links', titulo: 'Documentos', itens: itens.slice(0, 8).map(i => ({ texto: i.cliente ?? i.titulo, detalhe: `${i.titulo} · ${i.situacao}`, href: i.href })) }
        : undefined,
    }
  },
}
