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
    // A19 da 11ª simulação (2026-11-10): não havia modelo de reativação, e a
    // Marta montou uma campanha de "Reativação 60 dias" que só sairia no
    // aniversário de quem sumiu (D8). Pelo relógio, uma vez por mês — a busca
    // "sem retorno" acha quem continua sumida, então ela recebe de novo no
    // mês seguinte, e a descrição diz isso. Nasce RASCUNHO, como todo modelo
    // (princípio 6).
    chave: 'reativacao',
    nome: 'Reativação de quem sumiu',
    descricao: 'Todo mês, no dia 1 às 9h, busca as clientes sem atendimento há mais de 60 dias e manda um convite para voltar. Quem continuar sem voltar recebe de novo no mês seguinte.',
    revisar: 'Os dias sem visita, o dia do mês, o horário e o texto.',
    grafo: () => ({
      nos: [
        { id: 'n_reat_relogio', tipo: NODES.GATILHO_AGENDA, nome: 'Todo mês, dia 1, às 9h', pos: { x: 80, y: 120 },
          config: { frequencia: 'mensal', diaDoMes: 1, hora: '09:00' } },
        { id: 'n_reat_busca', tipo: NODES.BUSCAR_CLIENTES, nome: 'Sem visita há mais de 60 dias', pos: { x: 360, y: 120 },
          config: { semRetornoHaDias: 60, limite: 200 } },
        { id: 'n_reat_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Convite para voltar', pos: { x: 640, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Sentimos sua falta por aqui. Que tal agendar um horário? É só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_reat_1', de: 'n_reat_relogio', para: 'n_reat_busca' },
        { id: 'l_reat_2', de: 'n_reat_busca', para: 'n_reat_msg' },
      ],
    }),
  },
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
          // Outro procedimento: o fluxo termina aqui, de propósito (A18 da 11ª).
          config: { outroLadoTerminaDeProposito: true, grupo: { juncao: 'e', regras: [
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
          // Cancelado ou já feito: nada a lembrar — termina aqui, de propósito (A18 da 11ª).
          config: { outroLadoTerminaDeProposito: true, grupo: { juncao: 'e', regras: [
            { campo: 'agendamento.status', operador: 'nao_em', valor: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          ] } } },
        { id: 'n_lem_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Lembrete', pos: { x: 920, y: 120 },
          config: {
            canal: 'whatsapp',
            // C57b (F69): "amanhã" mentia no agendamento marcado para daqui a
            // menos de um dia (a espera já passou, a mensagem sai na hora). A data.
            texto: 'Oi, {{cliente.nome}}! Passando para lembrar do seu horário de {{agendamento.procedimento}} em {{agendamento.data}}. Se precisar remarcar, é só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_lem_1', de: 'n_lem_criado', para: 'n_lem_espera' },
        { id: 'l_lem_2', de: 'n_lem_espera', para: 'n_lem_se' },
        { id: 'l_lem_3', de: 'n_lem_se', para: 'n_lem_msg', saida: 'sim' },
      ],
    }),
  },
  // AU1 (a revisão do Heitor, 2026-11-13: "concordo"): os gatilhos da
  // campanha "automática" que saiu (MK1) que ainda não tinham modelo. Cada um
  // usa só fatos e passos do catálogo e nasce RASCUNHO (princípio 6).
  {
    // O pacote cancelado não vence (F2b): a busca só acha o que está de pé —
    // a regra da campanha de antes. Pelo relógio, como o aniversário: o
    // vencimento é uma data, não um fato que acontece.
    chave: 'vencimento-de-pacote',
    nome: 'Vencimento de pacote',
    descricao: 'Todo dia às 9h, busca as clientes com pacote vencendo daqui a 7 dias e avisa para agendar as sessões que faltam.',
    revisar: 'Quantos dias antes, o horário e o texto.',
    grafo: () => ({
      nos: [
        { id: 'n_venc_relogio', tipo: NODES.GATILHO_AGENDA, nome: 'Todo dia às 9h', pos: { x: 80, y: 120 },
          config: { frequencia: 'diaria', hora: '09:00' } },
        { id: 'n_venc_busca', tipo: NODES.BUSCAR_CLIENTES, nome: 'Pacote vencendo', pos: { x: 360, y: 120 },
          config: { pacoteVenceEmDias: 7, limite: 200 } },
        { id: 'n_venc_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Aviso do vencimento', pos: { x: 640, y: 120 },
          config: {
            canal: 'whatsapp',
            // Sem o número de dias no texto: a rede muda a busca, e a
            // mensagem não pode passar a mentir (princípio 3).
            texto: 'Oi, {{cliente.nome}}! Seu pacote está perto de vencer. Que tal agendar as sessões que faltam? É só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_venc_1', de: 'n_venc_relogio', para: 'n_venc_busca' },
        { id: 'l_venc_2', de: 'n_venc_busca', para: 'n_venc_msg' },
      ],
    }),
  },
  {
    chave: 'confirmacao-do-agendamento',
    nome: 'Confirmação do agendamento',
    descricao: 'Quando um agendamento é confirmado, manda à cliente a confirmação com o procedimento e o horário.',
    revisar: 'O texto.',
    grafo: () => ({
      nos: [
        { id: 'n_conf_fato', tipo: NODES.GATILHO_EVENTO, nome: 'Agendamento confirmado', pos: { x: 80, y: 120 },
          config: { evento: 'agendamento.confirmado' } },
        { id: 'n_conf_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Confirmação', pos: { x: 360, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Seu horário de {{agendamento.procedimento}} em {{agendamento.data}} está confirmado. Até lá!',
          } },
      ],
      ligacoes: [
        { id: 'l_conf_1', de: 'n_conf_fato', para: 'n_conf_msg' },
      ],
    }),
  },
  {
    chave: 'cancelamento-do-agendamento',
    nome: 'Cancelamento do agendamento',
    descricao: 'Quando um agendamento é cancelado, avisa a cliente e convida para remarcar.',
    revisar: 'O texto.',
    grafo: () => ({
      nos: [
        { id: 'n_canc_fato', tipo: NODES.GATILHO_EVENTO, nome: 'Agendamento cancelado', pos: { x: 80, y: 120 },
          config: { evento: 'agendamento.cancelado' } },
        { id: 'n_canc_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Aviso do cancelamento', pos: { x: 360, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Seu horário de {{agendamento.procedimento}} em {{agendamento.data}} foi cancelado. Quer remarcar? É só responder esta mensagem.',
          } },
      ],
      ligacoes: [
        { id: 'l_canc_1', de: 'n_canc_fato', para: 'n_canc_msg' },
      ],
    }),
  },
  {
    chave: 'pontos-de-fidelidade',
    nome: 'Pontos de fidelidade',
    descricao: 'Quando a cliente ganha pontos num pagamento, avisa quantos ganhou e o saldo dela.',
    revisar: 'O texto.',
    grafo: () => ({
      nos: [
        { id: 'n_pts_fato', tipo: NODES.GATILHO_EVENTO, nome: 'Cliente ganhou pontos', pos: { x: 80, y: 120 },
          config: { evento: 'fidelidade.pontos_ganhos' } },
        { id: 'n_pts_msg', tipo: NODES.ACAO_MENSAGEM, nome: 'Aviso dos pontos', pos: { x: 360, y: 120 },
          config: {
            canal: 'whatsapp',
            texto: 'Oi, {{cliente.nome}}! Você ganhou {{evento.dados.pontos}} pontos. Seu saldo agora é de {{evento.dados.saldo}} pontos.',
          } },
      ],
      ligacoes: [
        { id: 'l_pts_1', de: 'n_pts_fato', para: 'n_pts_msg' },
      ],
    }),
  },
  {
    // crm-05 (revisão do Heitor de 2026-11-02): "não existe movimento
    // automático padrão nos funis; caso queiram, podem fazer isso através do
    // módulo de automações". Até ali o card ia sozinho para a etapa "Agendado";
    // este modelo é o mesmo movimento, ligado por quem quer, para a etapa do
    // funil DELA (a etapa vazia não deixa ligar).
    chave: 'agendou-move-o-card',
    nome: 'Agendou: o card muda de etapa',
    descricao: 'Quando uma cliente com oportunidade aberta é agendada, o card dela vai para a etapa que você escolher no funil.',
    revisar: 'A etapa de destino.',
    grafo: () => ({
      nos: [
        { id: 'n_agd_criado', tipo: NODES.GATILHO_EVENTO, nome: 'Agendamento criado', pos: { x: 80, y: 120 },
          config: { evento: 'agendamento.criado' } },
        { id: 'n_agd_mover', tipo: NODES.ACAO_MOVER_ETAPA, nome: 'Mover o card', pos: { x: 360, y: 120 },
          config: {} },
      ],
      ligacoes: [
        { id: 'l_agd_1', de: 'n_agd_criado', para: 'n_agd_mover' },
      ],
    }),
  },
  {
    // O lembrete "Marque o ganho" (A45 da 9ª) era do cron `crm-lembretes`,
    // ligado em todas as redes. Saiu dali e virou modelo (auditoria das
    // regras, 2026-11-18): r2-cfg-04, "toda e qualquer automação deve ser
    // feita através dos módulos de automações"; princípio 6. Nasce RASCUNHO.
    // O card não anda: quem marca o ganho é a pessoa (crm-05).
    chave: 'marque-o-ganho',
    nome: 'Marque o ganho',
    descricao: 'Quando a cliente de uma oportunidade aberta compra (pacote, pré-pago ou plano aceito), avisa no sino quem cuida da oportunidade para levar o card a Ganho. O card não muda sozinho.',
    revisar: 'O texto do aviso.',
    grafo: () => ({
      nos: [
        { id: 'n_ganho_fato', tipo: NODES.GATILHO_EVENTO, nome: 'Cliente da oportunidade comprou', pos: { x: 80, y: 120 },
          config: { evento: 'lead.cliente_comprou' } },
        { id: 'n_ganho_aviso', tipo: NODES.ACAO_NOTIFICAR_EQUIPE, nome: 'Avisar quem cuida', pos: { x: 360, y: 120 },
          config: {
            alvo: 'responsavel',
            titulo: 'Marque o ganho: {{evento.dados.nome}}',
            corpo: '{{evento.dados.nome}} comprou {{evento.dados.compra}}, e a oportunidade dela segue aberta. Se fechou, leve o card a Ganho no quadro — ele não muda sozinho.',
          } },
      ],
      ligacoes: [
        { id: 'l_ganho_1', de: 'n_ganho_fato', para: 'n_ganho_aviso' },
      ],
    }),
  },
]

export function modeloDeAutomacao(chave: string): ModeloDeAutomacao | null {
  return MODELOS_DE_AUTOMACAO.find(m => m.chave === chave) ?? null
}

/**
 * O modelo para a rede SEM WhatsApp conectado (A14): as mensagens nascem como
 * aviso no celular da cliente (push), que chega sem conversa nenhuma. Nascer
 * em WhatsApp numa rede sem número era um fluxo que ligava e nunca mandava.
 */
export function semWhatsapp(grafo: GrafoDeAutomacao): GrafoDeAutomacao {
  return {
    ...grafo,
    nos: grafo.nos.map(n => {
      if (n.tipo !== NODES.ACAO_MENSAGEM || (n.config as { canal?: string }).canal !== 'whatsapp') return n
      const texto = (n.config as { texto?: unknown }).texto
      return { ...n, config: { ...n.config, canal: 'push', ...(typeof texto === 'string' ? { texto: semPedirResposta(texto) } : {}) } }
    }),
  }
}

/**
 * O texto sem o pedido de resposta (A10 da 17ª simulação; princípio 3): o
 * aviso no celular não se responde — a resposta não chega a conversa nenhuma
 * —, e os modelos terminavam em "É só responder esta mensagem". Tira só a
 * frase dos modelos; o resto do texto, escrito pela rede, fica.
 */
export function semPedirResposta(texto: string): string {
  return texto.replace(/\s*(?:Se precisar remarcar, é|É) só responder esta mensagem\./g, '').trim()
}
