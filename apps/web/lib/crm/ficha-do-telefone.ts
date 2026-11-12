import 'server-only'
import { telefoneDoCadastro } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * As fichas ATIVAS da clínica com o telefone de um lead novo (D11 da 9ª
 * simulação, 2026-11-07: a "Camila D. (repetida)" nascia em Novo, sem "✓
 * Cliente", com o telefone da Camila Duarte, que já era cliente). É o inverso
 * do "É a mesma pessoa do lead X?" do cadastro (`pessoaDoCrmDoTelefone`): o
 * "Novo lead" pergunta "É a mesma pessoa?" e, com o "Sim", a oportunidade
 * nasce ligada à ficha (`leads.client_id`). A busca é a do cadastro
 * (`fichas_do_telefone`, pelos dígitos, as duas formas do celular).
 */
export interface FichaDoTelefone { id: string; nome: string }

export async function fichasDoTelefoneDoLead(tenantId: string, telefone: string | null | undefined): Promise<FichaDoTelefone[]> {
  const fone = telefoneDoCadastro(telefone)
  if (!fone || fone.digitos.length < 10) return []
  const linhas = (await ler(createAdminClient().rpc('fichas_do_telefone', { p_tenant: tenantId, p_digitos: fone.digitos }),
    'conferir se o telefone do lead é de uma cliente')) as { id: string; nome: string; ativa: boolean }[] | null
  return (linhas ?? []).filter(f => f.ativa).map(f => ({ id: f.id, nome: f.nome }))
}

/**
 * A ficha da oportunidade que a IMPORTAÇÃO cria (C5 do levantamento das
 * regras, F70; D11): sem ninguém a quem perguntar "É a mesma pessoa?", uma
 * ficha ativa com o telefone liga o card a ela; mais de uma, não escolhe
 * (princípio 4: nada de chutar) e o relatório da linha diz.
 */
export function fichaDaOportunidadeImportada(fichas: FichaDoTelefone[]): { clientId: string | null; aviso: string | null } {
  if (fichas.length === 1) return { clientId: fichas[0]!.id, aviso: null }
  if (fichas.length > 1) {
    return { clientId: null, aviso: `O telefone é de mais de uma ficha (${fichas.map(f => f.nome).join(', ')}): a oportunidade nasceu sem ficha.` }
  }
  return { clientId: null, aviso: null }
}

/** A resposta do "É a mesma pessoa?": `mesma:<id da ficha>` ou `outra`. */
export function respostaDaFichaDoTelefone(valor: string | null | undefined): { mesma: string } | { outra: true } | null {
  const v = (valor ?? '').trim()
  if (v === 'outra') return { outra: true }
  const m = /^mesma:([0-9a-f-]{36})$/i.exec(v)
  return m ? { mesma: m[1]!.toLowerCase() } : null
}
