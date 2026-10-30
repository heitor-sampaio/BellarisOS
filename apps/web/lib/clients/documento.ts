import { cpfValido, documentoEstrangeiro } from '@estetica-os/utils'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

type Admin = ReturnType<typeof createAdminClient>

export const CPF_INVALIDO = 'CPF inválido: confira os números.'
export const DOCUMENTO_INVALIDO = 'Documento inválido: use letras e números (5 a 20), como está no passaporte ou no RNE.'

/** As colunas do documento da ficha: o CPF em `document`, OU o passaporte/RNE nas suas (D-11). */
export type ColunasDoDocumento = {
  document: string | null
  documento_tipo: 'PASSAPORTE' | 'RNE' | null
  documento_numero: string | null
}

/**
 * O "Documento" digitado, com o tipo (D-11, decisão do Heitor de 2026-10-29):
 * CPF pelos verificadores (`cpfValido`), passaporte e RNE como texto livre
 * razoável (`documentoEstrangeiro`). A ficha guarda um OU outro — escolher
 * passaporte apaga o CPF, e vice-versa. Vazio é "sem documento". Sem tipo, é
 * CPF (o cadastro antigo, o Copilot).
 */
export function documentoDaFicha(tipo: string | null | undefined, numero: string | null | undefined):
  { colunas: ColunasDoDocumento } | { error: string } {
  const n = (numero ?? '').trim()
  if (!tipo || tipo === 'CPF') {
    const cpf = n.replace(/\D/g, '') || null
    if (cpf && !cpfValido(cpf)) return { error: CPF_INVALIDO }
    return { colunas: { document: cpf, documento_tipo: null, documento_numero: null } }
  }
  if (tipo !== 'PASSAPORTE' && tipo !== 'RNE') return { error: 'Tipo de documento inválido.' }
  if (!n) return { colunas: { document: null, documento_tipo: null, documento_numero: null } }
  const doc = documentoEstrangeiro(n)
  if (!doc) return { error: DOCUMENTO_INVALIDO }
  return { colunas: { document: null, documento_tipo: tipo, documento_numero: doc } }
}

/** O passaporte (ou RNE) já é de outra cliente da rede: a frase da recusa, ou nulo. Um por rede, como o CPF. */
export async function documentoEstrangeiroRepetido(
  admin: Admin, tenantId: string, colunas: Partial<ColunasDoDocumento>, outraQue?: string,
): Promise<string | null> {
  if (!colunas.documento_tipo || !colunas.documento_numero) return null
  let q = admin.from('clients').select('id').eq('tenant_id', tenantId)
    .eq('documento_tipo', colunas.documento_tipo).eq('documento_numero', colunas.documento_numero)
  if (outraQue) q = q.neq('id', outraQue)
  const dup = await ler(q.limit(1).maybeSingle(), 'conferir se o documento já está cadastrado')
  if (!dup) return null
  return `Já existe uma cliente com este ${colunas.documento_tipo === 'RNE' ? 'RNE' : 'passaporte'} nesta rede.`
}
