import { NODES } from '@estetica-os/types'
import type { GrafoDeAutomacao } from '@estetica-os/types'

/**
 * Os modelos prontos de automação (D-4, decisão do Heitor em 2026-10-29).
 *
 * "Modelos prontos entram como opção. 'Nova automação' continua começando
 * vazia, e o procedimento continua no passo 'Se' (condicional), sem ir para o
 * gatilho." O modelo é só um grafo de partida: usa os gatilhos, condições e
 * ações que já existem, nasce DESLIGADO (rascunho) e com tudo ligado, e deixa
 * à clínica o que é dela — o procedimento do "Se", o texto, o canal.
 *
 * O grafo sai de uma função, nunca de um objeto compartilhado: quem edita a
 * automação criada não pode mexer no modelo.
 */

export interface ModeloDeAutomacao {
  chave:     string
  nome:      string
  descricao: string
  /** O que a clínica precisa revisar antes de ligar. */
  revisar:   string
  grafo:     () => GrafoDeAutomacao
}

export const MODELOS_DE_AUTOMACAO: readonly ModeloDeAutomacao[] = [
  {
    chave: 'aniversario',
    nome: 'Parabéns no aniversário',
    descricao: 'Todo dia às 9h, busca as clientes que fazem aniversário e manda uma mensagem de parabéns.',
    revisar: 'O texto da mensagem e o horário.',
    grafo: () => ({
      nos: [
        { id: 'n_aniv_relogio', tipo: NODES.GATILHO_AGENDA, nome: 'Todo dia às 9h', pos: { x: 80, y: 120 },
          config: { frequencia: 'diaria', hora: '09:00' } },
        { id: 'n_aniv_busca', tipo: NODES.BUSCAR_CLIENTES, nome: 'Aniversariantes de hoje', pos: { x: 360, y: 120 },
          config: { aniversarioHoje: true, limite: 200 } },
        { id: 'n_aniv_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Mensagem de parabéns', pos: { x: 640, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Feliz aniversário, {{cliente.nome}}! Toda a equipe deseja um dia lindo para você.',
          } },
      ],
      ligacoes: [
        { id: 'l_aniv_1', de: 'n_aniv_relogio', para: 'n_aniv_busca' },
        { id: 'l_aniv_2', de: 'n_aniv_busca', para: 'n_aniv_msg' },
      ],
    }),
  },
  {
    chave: 'retorno-depois-do-atendimento',
    nome: 'Retorno depois do atendimento',
    descricao: 'Quando um atendimento do procedimento escolhido é concluído, espera 30 dias e convida a cliente para o retorno.',
    revisar: 'O procedimento no passo "Se", os dias de espera e o texto.',
    grafo: () => ({
      nos: [
        { id: 'n_ret_concluido', tipo: NODES.GATILHO_EVENTO, nome: 'Atendimento concluído', pos: { x: 80, y: 120 },
          config: { evento: 'agendamento.concluido' } },
        // O procedimento fica no "Se", não no gatilho (decisão do Heitor): o
        // valor vazio não deixa ligar até a clínica escolher.
        { id: 'n_ret_se', tipo: NODES.CONDICAO_SE, nome: 'Se o procedimento', pos: { x: 360, y: 120 },
          config: { grupo: { juncao: 'e', regras: [
            { campo: 'evento.dados.procedimentoNome', operador: 'igual', valor: '' },
          ] } } },
        { id: 'n_ret_espera', tipo: NODES.ESPERA_DURACAO, nome: 'Esperar 30 dias', pos: { x: 640, y: 120 },
          config: { quantidade: 30, unidade: 'dias' } },
        { id: 'n_ret_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Convite para o retorno', pos: { x: 920, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Já faz um mês do seu {{evento.dados.procedimentoNome}}. Que tal agendar o retorno? É só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_ret_1', de: 'n_ret_concluido', para: 'n_ret_se' },
        { id: 'l_ret_2', de: 'n_ret_se', para: 'n_ret_espera', saida: 'sim' },
        { id: 'l_ret_3', de: 'n_ret_espera', para: 'n_ret_msg' },
      ],
    }),
  },
  {
    chave: 'lembrete-antes-do-agendamento',
    nome: 'Lembrete antes do agendamento',
    descricao: 'Quando um agendamento é criado, espera até um dia antes do horário e manda um lembrete — se ele não tiver sido cancelado.',
    revisar: 'Quanto tempo antes e o texto.',
    grafo: () => ({
      nos: [
        { id: 'n_lem_criado', tipo: NODES.GATILHO_EVENTO, nome: 'Agendamento criado', pos: { x: 80, y: 120 },
          config: { evento: 'agendamento.criado' } },
        // Pelo dado do FATO (`evento.dados`): ler o agendamento aqui o deixaria
        // guardado no contexto, e o "Se" depois da espera veria a situação de
        // quando ele foi criado, não a de agora.
        { id: 'n_lem_espera', tipo: NODES.ESPERA_ATE, nome: 'Um dia antes', pos: { x: 360, y: 120 },
          config: { campo: 'evento.dados.agendadoPara', minutos: -1440 } },
        { id: 'n_lem_se', tipo: NODES.CONDICAO_SE, nome: 'Se ainda está de pé', pos: { x: 640, y: 120 },
          config: { grupo: { juncao: 'e', regras: [
            { campo: 'agendamento.status', operador: 'nao_em', valor: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          ] } } },
        { id: 'n_lem_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Lembrete', pos: { x: 920, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Passando para lembrar do seu horário de {{agendamento.procedimento}} amanhã. Se precisar remarcar, é só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_lem_1', de: 'n_lem_criado', para: 'n_lem_espera' },
        { id: 'l_lem_2', de: 'n_lem_espera', para: 'n_lem_se' },
        { id: 'l_lem_3', de: 'n_lem_se', para: 'n_lem_msg', saida: 'sim' },
      ],
    }),
  },
]

export function modeloDeAutomacao(chave: string): ModeloDeAutomacao | null {
  return MODELOS_DE_AUTOMACAO.find(m => m.chave === chave) ?? null
}
