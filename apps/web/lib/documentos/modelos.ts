import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { getSignedUrls, MODELOS_DE_DOCUMENTO_BUCKET } from '@/lib/storage'
import { TIPOS_DE_OUTROS_DOCUMENTOS, type TipoDeModelo } from './variaveis'

/**
 * Leitura dos modelos de documento da rede.
 *
 * Quem chama já conferiu a permissão (Configurações pede `forms`, o cadastro
 * do procedimento pede `procedures`): aqui é só a consulta, sempre recortada
 * pela rede.
 *
 * Sem "quando nasce" (DC4, Bloco Documentos, 2026-11-14): todo documento do
 * atendimento nasce ao agendar. O que cada modelo ainda decide é se BLOQUEIA o
 * início sem assinatura ou só avisa.
 */

export type Exigencia = 'BLOQUEIA' | 'AVISA'

export interface ModeloDeDocumento {
  id:            string
  nome:          string
  tipo:          TipoDeModelo
  origem:        'EDITOR' | 'ARQUIVO'
  exigencia:     Exigencia
  ativo:         boolean
  versao:        number
  versaoId:      string | null
  /** A marcação leve (versões de antes do editor rico). */
  texto:         string | null
  /** O JSON do editor rico ({ corpo, cabecalho?, rodape? }). */
  documento:     unknown | null
  arquivo:       { nome: string | null; tamanho: number | null; paginas: number | null } | null
  procedimentos: number
  atualizadoEm:  string
}

type LinhaDoModelo = {
  id: string; name: string; kind: TipoDeModelo; source: 'EDITOR' | 'ARQUIVO'
  enforcement: Exigencia; is_active: boolean
  current_version: number; updated_at: string
}
type LinhaDaVersao = {
  id: string; template_id: string; version: number; body_markup: string | null; body_doc: unknown
  file_name: string | null; file_size: number | null; file_pages: number | null
}

/** Os caminhos das imagens citadas num JSON do editor. */
export function imagensDoJsonDoEditor(no: unknown, saida = new Set<string>()): Set<string> {
  if (Array.isArray(no)) for (const n of no) imagensDoJsonDoEditor(n, saida)
  else if (no && typeof no === 'object') {
    const o = no as { type?: unknown; attrs?: { caminho?: unknown } }
    if (o.type === 'imagemDoDocumento' && typeof o.attrs?.caminho === 'string') saida.add(o.attrs.caminho)
    for (const v of Object.values(o)) if (v && typeof v === 'object') imagensDoJsonDoEditor(v, saida)
  }
  return saida
}

/** URLs temporárias das imagens dos modelos — o editor precisa mostrá-las. */
export async function urlsDasImagensDosModelos(modelos: ModeloDeDocumento[]): Promise<Record<string, string>> {
  const caminhos = new Set<string>()
  for (const m of modelos) imagensDoJsonDoEditor(m.documento, caminhos)
  return caminhos.size ? getSignedUrls(MODELOS_DE_DOCUMENTO_BUCKET, [...caminhos], 60 * 60) : {}
}

type LigacaoDoProcedimento = { consent_template_id: string | null; contract_template_id: string | null; outros_documentos: string[] | null }

/** Todos os modelos da rede, com o conteúdo da versão atual — a aba de Configurações. */
export async function modelosDaRede(tenantId: string): Promise<ModeloDeDocumento[]> {
  const admin = createAdminClient()
  const [modelos, versoes, procs] = await Promise.all([
    ler(admin.from('document_templates')
      .select('id, name, kind, source, enforcement, is_active, current_version, updated_at')
      .eq('tenant_id', tenantId)
      .order('kind').order('name'), 'carregar os modelos de documento'),
    ler(admin.from('document_template_versions')
      .select('id, template_id, version, body_markup, body_doc, file_name, file_size, file_pages')
      .eq('tenant_id', tenantId), 'carregar as versões dos modelos'),
    // Quantos procedimentos usam cada modelo — a tela avisa antes de desativar.
    ler(admin.from('procedures')
      .select('consent_template_id, contract_template_id, outros_documentos')
      .eq('tenant_id', tenantId)
      .or('consent_template_id.not.is.null,contract_template_id.not.is.null,outros_documentos.neq.{}'), 'contar os procedimentos de cada modelo'),
  ])

  const usos = new Map<string, number>()
  for (const p of (procs ?? []) as LigacaoDoProcedimento[]) {
    const ids = new Set([p.consent_template_id, p.contract_template_id, ...(p.outros_documentos ?? [])])
    for (const id of ids) {
      if (id) usos.set(id, (usos.get(id) ?? 0) + 1)
    }
  }
  const versaoAtual = new Map<string, LinhaDaVersao>()
  const porModelo = new Map((modelos ?? []).map(m => [m.id as string, m as LinhaDoModelo]))
  for (const v of (versoes ?? []) as LinhaDaVersao[]) {
    if (porModelo.get(v.template_id)?.current_version === v.version) versaoAtual.set(v.template_id, v)
  }

  return ((modelos ?? []) as LinhaDoModelo[]).map(m => {
    const v = versaoAtual.get(m.id)
    return {
      id:            m.id,
      nome:          m.name,
      tipo:          m.kind,
      origem:        m.source,
      exigencia:     m.enforcement,
      ativo:         m.is_active,
      versao:        m.current_version,
      versaoId:      v?.id ?? null,
      texto:         v?.body_markup ?? null,
      documento:     v?.body_doc ?? null,
      arquivo:       m.source === 'ARQUIVO' && v
        ? { nome: v.file_name, tamanho: v.file_size, paginas: v.file_pages }
        : null,
      procedimentos: usos.get(m.id) ?? 0,
      atualizadoEm:  m.updated_at,
    }
  })
}

export interface OpcaoDeModelo {
  id:        string
  nome:      string
  tipo:      'TERMO' | 'CONTRATO' | 'DOCUMENTO'
  exigencia: Exigencia
  ativo:     boolean
}

/**
 * O que o cadastro do procedimento oferece: o termo, o contrato e os "Outros
 * documentos" (DC1b — o documento, mais os termos e contratos já criados, pela
 * regra do PC7: "qualquer documento criado ou anexado no sistema"). Os
 * contratos de plano e de pacote são da rede, não de um procedimento.
 * Ativos, mais os inativos já ligados a algum procedimento — senão editar um
 * procedimento cujo modelo foi desativado apagaria o vínculo em silêncio.
 */
export async function opcoesDeModeloParaProcedimento(
  tenantId: string,
): Promise<{ termos: OpcaoDeModelo[]; contratos: OpcaoDeModelo[]; outros: OpcaoDeModelo[] }> {
  const admin = createAdminClient()
  const linhas = await ler(admin.from('document_templates')
    .select('id, name, kind, enforcement, is_active')
    .eq('tenant_id', tenantId)
    .in('kind', [...TIPOS_DE_OUTROS_DOCUMENTOS])
    .order('name'), 'carregar os modelos de documento do procedimento')
  const opcoes: OpcaoDeModelo[] = (linhas ?? []).map(l => ({
    id: l.id as string, nome: l.name as string, tipo: l.kind as OpcaoDeModelo['tipo'],
    exigencia: l.enforcement as Exigencia, ativo: !!l.is_active,
  }))
  const ordem = (o: OpcaoDeModelo) => TIPOS_DE_OUTROS_DOCUMENTOS.indexOf(o.tipo)
  return {
    termos:    opcoes.filter(o => o.tipo === 'TERMO'),
    contratos: opcoes.filter(o => o.tipo === 'CONTRATO'),
    // O "Documento" primeiro: é o tipo feito para isto.
    outros:    [...opcoes].sort((a, b) => ordem(a) - ordem(b)),
  }
}
