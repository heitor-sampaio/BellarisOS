import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { redeTemRecurso } from '@estetica-os/nucleo/lib/planos/da-rede'
import { rotuloDoQueFalta } from '@/lib/documentos/leitura'
import { valoresDoDocumento, type DadosDoDocumento } from '@/lib/documentos/valores'
import { variavelObrigatoria } from '@/lib/documentos/variaveis'
import { oQueFalta } from '@/lib/documentos/o-que-falta'

/**
 * O que falta no CADASTRO da cliente para um modelo de documento se montar —
 * a mesma régua da montagem (`variavelObrigatoria`, `valoresDoDocumento`): as
 * variáveis da cliente e do responsável, obrigatórias, que a ficha não tem.
 * Saiu do "Agendar" (A17 da 12ª, `faltaNoCadastroAoAgendar`) para o PDV dizer o
 * mesmo antes de vender o pacote (A6 da 18ª). Como a pessoa lê: "Endereço
 * (rua, número e bairro)", sem "Cliente · ".
 */

/** As colunas da ficha que os documentos leem. */
export const COLUNAS_DA_CLIENTE_NOS_DOCUMENTOS =
  'name, document, documento_tipo, documento_numero, birth_date, phone, email, zip_code, address, address_number, address_complement, neighborhood, city, state, gender, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone'

export function faltandoDoCadastro(variaveis: readonly string[], cliente: Record<string, unknown>): string[] {
  const valores = valoresDoDocumento({
    agora: new Date(), cliente: cliente as DadosDoDocumento['cliente'],
    rede: { name: null, document: null, phone: null, email: null }, unidade: null, procedimento: null, agendamento: null, pagamento: null,
  } as DadosDoDocumento)
  // O responsável da menor não entra: sem ele o documento segue (decisão 2 da 7ª, "avisar, não barrar").
  const faltam = variaveis.filter(v => /^(cliente|responsavel)\./.test(v) && variavelObrigatoria(v) && !valores[v])
  return oQueFalta(faltam.map(rotuloDoQueFalta))
}

/**
 * A6 da 18ª (princípios 3 e 7): o contrato de pacote ATIVO da rede (DC1) e o
 * que ele pede do cadastro desta cliente — o balcão só descobria depois de
 * vender ("Falta no cadastro: Endereço"). Nulo: sem o recurso de documentos,
 * sem contrato de pacote ativo, ou nada faltando. Acessório: falhou, sem aviso.
 */
export async function faltaParaOContratoDoPacote(tenantId: string, clienteId: string): Promise<{ titulo: string; faltando: string[] } | null> {
  try {
    if (!(await redeTemRecurso(tenantId, 'documentos'))) return null
    const admin = createAdminClient()
    const [modelo, cliente] = await Promise.all([
      ler(admin.from('document_templates').select('id, name, current_version')
        .eq('tenant_id', tenantId).eq('kind', 'CONTRATO_PACOTE').eq('is_active', true)
        .order('name').limit(1).maybeSingle(), 'buscar o contrato de pacote ativo') as Promise<{ id: string; name: string; current_version: number } | null>,
      ler(admin.from('clients').select(COLUNAS_DA_CLIENTE_NOS_DOCUMENTOS)
        .eq('id', clienteId).eq('tenant_id', tenantId).maybeSingle(), 'buscar o cadastro da cliente') as Promise<Record<string, unknown> | null>,
    ])
    if (!modelo || !cliente) return null
    const versao = await ler(admin.from('document_template_versions').select('variables')
      .eq('template_id', modelo.id).eq('tenant_id', tenantId).eq('version', modelo.current_version).maybeSingle(),
    'buscar a versão do contrato de pacote') as { variables: string[] | null } | null
    const faltando = faltandoDoCadastro(versao?.variables ?? [], cliente)
    return faltando.length ? { titulo: modelo.name, faltando } : null
  } catch (e) {
    console.error('[pdv] o que o contrato do pacote pede do cadastro:', e instanceof Error ? e.message : e)
    return null
  }
}
