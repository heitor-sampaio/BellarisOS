import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { ehChaveSecreta } from './sem-segredo'

/**
 * O cofre das credenciais de integração (2026-10-23, decisão do Heitor).
 *
 * O token da Meta, o da uazapi, o do Google… moravam em texto no `config` de
 * `integration_configs` e `whatsapp_numbers`. A RLS tira essas tabelas da
 * sessão (§4), mas quem tivesse o BANCO — um dump, um backup, a senha do
 * Postgres — levava todos. Agora cada segredo da lista fechada
 * (`ehChaveSecreta`, a mesma que esconde o segredo da tela) é cifrado com
 * AES-256-GCM por uma chave que mora FORA do banco: `CREDENCIAIS_CHAVE`, no
 * Railway (32 bytes em base64). O GCM confere a integridade: chave errada ou
 * texto adulterado PARAM, em vez de mandar um token lixo para a Meta.
 *
 * - Grava-se sempre por `cifrarSegredos`; sem a chave, recusa (nunca grava em
 *   texto puro). Lê-se por `decifrarSegredos`.
 * - O texto puro antigo é lido como está: as linhas de antes da migração e o
 *   que os testes semeiam direto no banco.
 * - O formato leva versão (`cifrado:v1:`): a troca de chave vira um v2 lido
 *   ao lado do v1.
 * - ⚠️ Perder a chave é perder os tokens: cada integração teria de ser
 *   conectada de novo. Ela tem cópia fora do Railway (com o Heitor).
 */
export const PREFIXO_CIFRADO = 'cifrado:v1:'

const ALGORITMO = 'aes-256-gcm'
const TAM_IV = 12
const TAM_TAG = 16

/** A chave do ambiente; nula se não houver. Inválida PARA. */
export function chaveDoAmbiente(): Buffer | null {
  const bruta = process.env.CREDENCIAIS_CHAVE?.trim()
  if (!bruta) return null
  const chave = Buffer.from(bruta, 'base64')
  if (chave.length !== 32) throw new Error('CREDENCIAIS_CHAVE inválida: são 32 bytes em base64.')
  return chave
}

/** `undefined` = a do ambiente, lida só quando houver segredo a mexer. */
type Chave = Buffer | null | undefined

function exigir(chave: Chave): Buffer {
  const efetiva = chave === undefined ? chaveDoAmbiente() : chave
  if (!efetiva) throw new Error('CREDENCIAIS_CHAVE ausente: sem ela a credencial não é gravada nem lida.')
  return efetiva
}

function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(TAM_IV)
  const cifra = createCipheriv(ALGORITMO, chave, iv)
  const corpo = Buffer.concat([cifra.update(texto, 'utf8'), cifra.final()])
  return PREFIXO_CIFRADO + Buffer.concat([iv, cifra.getAuthTag(), corpo]).toString('base64')
}

function decifrar(valor: string, chave: Buffer): string {
  const bruto = Buffer.from(valor.slice(PREFIXO_CIFRADO.length), 'base64')
  const decifra = createDecipheriv(ALGORITMO, chave, bruto.subarray(0, TAM_IV))
  decifra.setAuthTag(bruto.subarray(TAM_IV, TAM_IV + TAM_TAG))
  return Buffer.concat([decifra.update(bruto.subarray(TAM_IV + TAM_TAG)), decifra.final()]).toString('utf8')
}

/** Aplica `noSegredo` a cada segredo preenchido — também dentro de listas e objetos. */
function percorrer(valor: unknown, noSegredo: (s: string) => string): unknown {
  if (Array.isArray(valor)) return valor.map(v => percorrer(v, noSegredo))
  if (!valor || typeof valor !== 'object') return valor
  const saida: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[k] = ehChaveSecreta(k) && typeof v === 'string' && v.trim() !== '' ? noSegredo(v) : percorrer(v, noSegredo)
  }
  return saida
}

/** O `config` como vai ao banco: cada segredo cifrado (o que já está, fica). */
export function cifrarSegredos<T>(config: T, chave?: Buffer | null): T {
  let k: Buffer | null = null
  return percorrer(config, s => s.startsWith(PREFIXO_CIFRADO) ? s : cifrar(s, (k ??= exigir(chave)))) as T
}

/** O `config` como o servidor usa: cada segredo cifrado volta ao texto. */
export function decifrarSegredos<T extends Record<string, unknown>>(config: T | null | undefined, chave?: Buffer | null): T {
  let k: Buffer | null = null
  return percorrer(config ?? {}, s => s.startsWith(PREFIXO_CIFRADO) ? decifrar(s, (k ??= exigir(chave))) : s) as T
}

/** Algum segredo ainda em texto puro? (a migração e a prova do banco) */
export function temSegredoEmTextoPuro(config: unknown): boolean {
  let achou = false
  percorrer(config, s => { if (!s.startsWith(PREFIXO_CIFRADO)) achou = true; return s })
  return achou
}
