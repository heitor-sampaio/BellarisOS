import 'server-only'
import type { TenantContext } from '@estetica-os/types'
import { can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { mexeNaConfigDaRede } from '@/lib/configuracao-da-rede'

/**
 * As importações anteriores, na própria aba Importações (A6 da 8ª simulação,
 * 2026-11-06: a aba voltava ao passo 1 sem histórico, e a dona só descobriu a
 * Isabela recusada pela ausência dela). Só da Admin da rede (revisão de 24/11),
 * com o módulo
 * do destino em Gerenciar, sem recorte por unidade (a régua de
 * `importacaoAoAlcance`; a ficha é da REDE — auditoria das regras, 18/11) —, com as contagens e o relatório (as recusadas e as
 * importadas com aviso) enquanto ele vale (7 dias: guarda o valor errado).
 */
export interface ImportacaoAnterior {
  id: string; arquivo: string; destino: 'clientes' | 'contatos'; status: string
  criadaEm: string; concluidaEm: string | null
  novas: number; completadas: number; semMudanca: number; recusadas: number; comAviso: number; oportunidades: number
  /** O CSV ainda se baixa (há linha recusada ou com aviso, e o prazo de 7 dias não venceu). */
  temRelatorio: boolean
  /** Havia relatório, e ele venceu (7 dias). */
  relatorioVenceu: boolean
}

export async function importacoesAnteriores(ctx: TenantContext, limite = 10): Promise<ImportacaoAnterior[]> {
  // Só da Admin da rede: as Importações são configuração da rede toda, o
  // histórico e o relatório inclusive (revisão de 24/11, Q10 do catálogo).
  if (!mexeNaConfigDaRede(ctx)) return []
  const destinos = (['clientes', 'contatos'] as const).filter(d => can(ctx, d === 'clientes' ? 'clients' : 'crm', 'MANAGE'))
  if (!destinos.length) return []
  const linhas = await ler(createAdminClient().from('importacoes')
    .select('id, nome_arquivo, destino, branch_id, status, criada_em, concluida_em, novas, completadas, sem_mudanca, com_erro, com_aviso, oportunidades, erros_expiram_em')
    .eq('tenant_id', ctx.tenantId!).in('destino', destinos)
    .order('criada_em', { ascending: false }).order('id').limit(limite * 3), 'listar as importações anteriores') as {
      id: string; nome_arquivo: string; destino: 'clientes' | 'contatos'; branch_id: string | null; status: string
      criada_em: string; concluida_em: string | null; novas: number; completadas: number; sem_mudanca: number
      com_erro: number; com_aviso: number | null; oportunidades: number; erros_expiram_em: string | null
    }[] | null
  const agora = new Date().toISOString()
  return (linhas ?? [])
    .slice(0, limite)
    .map(i => {
      const algo = i.com_erro + (i.com_aviso ?? 0) > 0
      const venceu = !!i.erros_expiram_em && i.erros_expiram_em < agora
      return {
        id: i.id, arquivo: i.nome_arquivo, destino: i.destino, status: i.status,
        criadaEm: i.criada_em, concluidaEm: i.concluida_em,
        novas: i.novas, completadas: i.completadas, semMudanca: i.sem_mudanca,
        recusadas: i.com_erro, comAviso: i.com_aviso ?? 0, oportunidades: i.oportunidades,
        temRelatorio: algo && !venceu, relatorioVenceu: algo && venceu,
      }
    })
}
