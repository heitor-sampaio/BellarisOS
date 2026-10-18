/**
 * As telas REAIS do sistema que o site mostra (2026-10-17), fotografadas de
 * uma rede de demonstração com dados fictícios pelo spec de captura
 * (`apps/web/e2e/capturas/telas-do-site.spec.ts`). Mudou a tela na clínica,
 * roda a captura de novo: os arquivos e os tamanhos são os daqui.
 */
export interface Tela { arquivo: string; largura: number; altura: number; descricao: string }

const computador = (arquivo: string, descricao: string): Tela => ({ arquivo: `/telas/${arquivo}.png`, largura: 1440, altura: 900, descricao })
/** Sem o menu lateral (244 px): nos destaques, o que importa é a tela. */
const semMenu = (arquivo: string, descricao: string): Tela => ({ arquivo: `/telas/${arquivo}.png`, largura: 1196, altura: 900, descricao })
const celular = (arquivo: string, descricao: string): Tela => ({ arquivo: `/telas/${arquivo}.png`, largura: 390, altura: 844, descricao })

export const TELAS = {
  agenda:       computador('agenda', 'A agenda do dia no BellarisOS, com os horários de cada profissional'),
  inbox:        semMenu('inbox', 'O inbox do BellarisOS com uma conversa de WhatsApp aberta e os dados da cliente ao lado'),
  inboxCelular: celular('inbox-celular', 'Uma conversa de WhatsApp no BellarisOS, pelo celular'),
  ficha:        semMenu('ficha', 'A ficha da cliente no BellarisOS: histórico, pacotes e próximos horários'),
  injetaveis:   semMenu('injetaveis', 'O planejador de injetáveis do BellarisOS: o mapa do rosto com os pontos, o produto e a dose'),
  financeiro:   semMenu('financeiro', 'O financeiro do BellarisOS: o resultado do mês, receitas e despesas'),
  automacao:    semMenu('automacao', 'O editor de automações do BellarisOS: o gatilho, a condição e o aviso à equipe'),
  copilot:      semMenu('copilot', 'O Copilot do BellarisOS respondendo a um pedido sobre a agenda'),
  documento:    semMenu('documento', 'A tela de Documentos do BellarisOS: os termos de cada cliente, assinados e a enviar'),
  portal:       celular('portal-celular', 'O início do app da cliente: o que confirmar, o próximo horário e os tratamentos em curso'),
  portalAgendar: celular('portal-agendar', 'O app da cliente: escolhendo a data e um horário livre para agendar sozinha'),
  portalPontos: celular('portal-pontos', 'O app da cliente: o saldo de pontos e as recompensas da clínica'),
} as const satisfies Record<string, Tela>
