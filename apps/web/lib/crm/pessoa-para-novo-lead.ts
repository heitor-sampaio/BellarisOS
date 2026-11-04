import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A pessoa do CRM que o "Novo lead" do quadro recebe da busca universal (A15
 * da 6ª simulação: a importada sem oportunidade não aparecia em lugar
 * nenhum). Os dados vêm do SERVIDOR, da rede da sessão — a URL só traz o id
 * (`?contato=`). A pessoa que já tem oportunidade não entra: o card dela é o
 * caminho, e a busca já a acha por ele.
 */
export interface PessoaParaNovoLead { id: string; nome: string; telefone: string | null; email: string | null }

export async function pessoaParaNovoLead(tenantId: string, contatoId: string): Promise<PessoaParaNovoLead | null> {
  const admin = createAdminClient()
  const pessoa = await ler(admin.from('contacts').select('id, name, phone, email')
    .eq('id', contatoId).eq('tenant_id', tenantId).maybeSingle(), 'buscar a pessoa do CRM') as
    { id: string; name: string | null; phone: string | null; email: string | null } | null
  if (!pessoa) return null
  const { count, error } = await admin.from('leads').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('contato_id', contatoId)
  if (error) throw new Error(`Conferir as oportunidades da pessoa: ${error.message}`)
  if ((count ?? 0) > 0) return null
  return { id: pessoa.id, nome: pessoa.name?.trim() ?? '', telefone: pessoa.phone, email: pessoa.email }
}

/** A pessoa que `createLead` recebe do formulário (`_contatoId`) é desta rede e ainda não tem oportunidade? */
export async function pessoaDoNovoLeadValida(tenantId: string, contatoId: string): Promise<boolean> {
  return !!(await pessoaParaNovoLead(tenantId, contatoId))
}
