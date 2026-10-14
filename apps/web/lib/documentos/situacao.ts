/**
 * O vocabulário da tela de Documentos (2026-10-14), sem nada de servidor: a
 * situação de um documento emitido, os envios e os passos da trilha.
 *
 * A situação é calculada no banco (`documentos_emitidos`, migration
 * `20261014000002`): o status do documento mais a trilha de envios.
 */

export const SITUACOES = ['FALTAM_DADOS', 'A_ENVIAR', 'ENVIADO', 'ASSINADO', 'DISPENSADO', 'CANCELADO', 'SUBSTITUIDO'] as const
export type SituacaoDoDocumento = typeof SITUACOES[number]

export const ROTULO_DA_SITUACAO: Record<SituacaoDoDocumento, string> = {
  FALTAM_DADOS: 'Faltam dados',
  A_ENVIAR:     'A enviar',
  ENVIADO:      'Enviado',
  ASSINADO:     'Assinado',
  DISPENSADO:   'Dispensado',
  CANCELADO:    'Cancelado',
  SUBSTITUIDO:  'Substituído',
}

export const ehSituacao = (v: unknown): v is SituacaoDoDocumento =>
  typeof v === 'string' && (SITUACOES as readonly string[]).includes(v)

export const TIPOS_DE_DOCUMENTO = ['TERMO', 'CONTRATO', 'CONTRATO_PLANO'] as const
export type TipoDeDocumento = typeof TIPOS_DE_DOCUMENTO[number]
export const ROTULO_DO_TIPO_DE_DOCUMENTO: Record<TipoDeDocumento, string> = {
  TERMO: 'Termo', CONTRATO: 'Contrato', CONTRATO_PLANO: 'Contrato de plano',
}
export const ehTipoDeDocumento = (v: unknown): v is TipoDeDocumento =>
  typeof v === 'string' && (TIPOS_DE_DOCUMENTO as readonly string[]).includes(v)

/** Por onde o documento foi mandado ao cliente (o envio mais recente). */
export const ROTULO_DO_ENVIO: Record<string, string> = {
  LINK_GERADO:           'Link',
  LINK_ENVIADO_CONVERSA: 'WhatsApp',
  NOTIFICADO_PORTAL:     'Portal',
}

/** Onde foi assinado. */
export const ROTULO_DO_CANAL: Record<string, string> = {
  CLINICA: 'na clínica', PORTAL: 'pelo portal', LINK: 'por link', PAPEL: 'no papel',
}

/** Cada passo da trilha (`issued_document_events.kind`) — a tela e o PDF. */
export const ROTULO_DO_EVENTO: Record<string, string> = {
  EMITIDO: 'Emitido', GERADO: 'Texto montado', INCOMPLETO: 'Aguardando dados do cadastro', VISUALIZADO: 'Aberto pelo cliente',
  LINK_GERADO: 'Link de assinatura gerado', LINK_REVOGADO: 'Link de assinatura revogado',
  LINK_ENVIADO_CONVERSA: 'Link enviado pela conversa do WhatsApp', NOTIFICADO_PORTAL: 'Pedido de assinatura no portal',
  IDENTIDADE_OK: 'Identidade conferida', IDENTIDADE_FALHOU: 'Identidade recusada',
  ASSINADO: 'Assinado', DISPENSADO: 'Dispensado', CANCELADO: 'Cancelado', SUBSTITUIDO: 'Substituído', PDF_GERADO: 'PDF gerado',
}
