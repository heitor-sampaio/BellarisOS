import { maskCPF } from '@estetica-os/utils'
import { responsavelDaFicha } from '@/lib/clients/menor'

/**
 * O responsável legal no pacote da LGPD (sobra da F29; decisão 2 do Heitor,
 * 7ª simulação, 2026-11-05). É dado do CADASTRO da titular — vai na parte
 * geral, ao lado dos dados cadastrais, no JSON e no PDF. Puro: o pacote e o
 * teste dizem o mesmo.
 */
export function responsavelNoPacote(c: {
  responsavel_nome?: string | null; responsavel_cpf?: string | null
  responsavel_parentesco?: string | null; responsavel_telefone?: string | null
}): {
  json:  { nome: string; cpf: string | null; parentesco: string | null; telefone: string | null } | null
  linha: string | null
} {
  const r = responsavelDaFicha(c)
  if (!r) return { json: null, linha: null }
  const cpf = r.cpf ? maskCPF(r.cpf) : null
  return {
    json: { nome: r.nome, cpf, parentesco: r.parentesco, telefone: r.telefone },
    linha: [`${r.nome}${r.parentesco ? ` (${r.parentesco})` : ''}`, cpf ? `CPF ${cpf}` : null, r.telefone].filter(Boolean).join(' · '),
  }
}

/** O documento da titular sem CPF (decisão 1 do Heitor): "Passaporte 19FR54321", "RNE V123456-7". */
export function documentoNoPacote(c: { documento_tipo?: string | null; documento_numero?: string | null }): string | null {
  const numero = (c.documento_numero ?? '').trim()
  if (!numero) return null
  return `${c.documento_tipo === 'RNE' ? 'RNE' : 'Passaporte'} ${numero}`
}
