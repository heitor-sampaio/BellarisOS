import { cpfValido } from '@estetica-os/utils'
import { documentoDaFicha, type ColunasDoDocumento } from '@/lib/clients/documento'
import type { DocumentoDoAcesso } from '@/lib/clients/documento-do-acesso'

/**
 * O documento que a pessoa disse ao Copilot no "cadastrar_cliente" (sobra da
 * F29, decisão 1 do Heitor na 7ª simulação): o CPF, OU o passaporte, OU o RNE
 * — a mesma regra do cadastro da tela (`documentoDaFicha`). Devolve as
 * colunas da ficha e o documento do acesso ao app (a senha inicial), ou nada.
 */
export function documentoDoCadastroDoCopilot(a: { cpf?: string; passaporte?: string; rne?: string }):
  { colunas: ColunasDoDocumento | null; acesso: DocumentoDoAcesso | null } | { erro: string } {
  const dados = [a.cpf, a.passaporte, a.rne].filter(x => x && x.trim())
  if (dados.length > 1) return { erro: 'Informe um documento só: o CPF, o passaporte ou o RNE.' }
  if (a.cpf?.trim()) {
    const cpf = a.cpf.replace(/\D/g, '')
    if (!cpfValido(cpf)) return { erro: 'CPF inválido.' }
    return { colunas: { document: cpf, documento_tipo: null, documento_numero: null }, acesso: { tipo: 'CPF', numero: cpf } }
  }
  const tipo = a.passaporte?.trim() ? 'PASSAPORTE' : a.rne?.trim() ? 'RNE' : null
  if (!tipo) return { colunas: null, acesso: null }
  const r = documentoDaFicha(tipo, tipo === 'PASSAPORTE' ? a.passaporte : a.rne)
  if ('error' in r) return { erro: r.error }
  return { colunas: r.colunas, acesso: { tipo, numero: r.colunas.documento_numero! } }
}
