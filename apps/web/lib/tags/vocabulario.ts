import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { opcoesDoFiltroDeTags, type UsoDaTag } from './escolha'

/**
 * O vocabulário de tags da rede (\`tags\`, 2026-10-13) — o que a ficha, o
 * cadastro, o inbox, o card, as automações e as campanhas oferecem. Cresce
 * sozinho (gatilho em clients, contacts e leads) e se gerencia em
 * Configurações → Tags. Só as ATIVAS: a arquivada fica em quem já tem.
 */
export async function tagsAtivasDaRede(tenantId: string): Promise<string[]> {
  const linhas = await ler(createAdminClient().from('tags').select('nome')
    .eq('tenant_id', tenantId).is('arquivada_em', null), 'ler as tags da rede') as { nome: string }[] | null
  return (linhas ?? []).map(l => l.nome).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
}

/**
 * As opções do FILTRO de tags, de toda tela que filtra (a Agenda, o Quadro, o
 * Financeiro, as Comissões, os Documentos, os Relatórios): as ativas
 * (`tagsAtivasDaRede`, que a tela passa) mais as ARQUIVADAS que alguém ainda
 * tem — A6 e Decisão D da 33ª simulação: arquivar tira das opções de marcar
 * (TG-08), não do filtro. O uso só se lê quando a rede tem tag arquivada.
 */
export async function comAsArquivadasEmUso(tenantId: string, ativas: Promise<string[]> | string[]): Promise<string[]> {
  const admin = createAdminClient()
  const [lista, arquivadas] = await Promise.all([
    ativas,
    ler(admin.from('tags').select('nome').eq('tenant_id', tenantId).not('arquivada_em', 'is', null).limit(1),
      'conferir se a rede tem tag arquivada') as Promise<{ nome: string }[] | null>,
  ])
  if (!arquivadas?.length) return lista
  const uso = await ler(admin.rpc('tags_da_rede', { p_tenant: tenantId }), 'ler o uso das tags da rede') as UsoDaTag[] | null
  return opcoesDoFiltroDeTags(lista, uso ?? [])
}
