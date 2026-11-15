-- Bloco Vocabulário (V1, V2) e Bloco Cargos do plano de adaptação — a revisão
-- do Heitor, 2026-11-13 (CLAUDE.md §1): "Clinica é a mesma coisa que rede e
-- não deve existir no sistema." · "Filial sai de vez." · nenhum cargo como se
-- fosse fixo ("a recepção").
--
-- O texto que as FUNÇÕES do banco devolvem à tela (o erro de `raise`, a
-- descrição do lançamento e do histórico, o rótulo da linha do relatório, o
-- motivo de perda que a rede nova ganha) passa a dizer "rede", "unidade",
-- "crédito interno" (o nome da forma de pagamento, "Crédito interno") e "PDV".
-- Só o texto muda: nenhuma regra, nenhuma coluna, nenhuma chave ('CLINICA',
-- 'aguardando_clinica' e o `clinica` do JSON ficam).
--
-- Como: cada função é reescrita a partir da definição ATUAL
-- (`pg_get_functiondef`), com a troca exata de cada frase — copiar à mão as
-- funções grandes (o `metrics_vendas`, as vendas com equipe) arriscava
-- desfazer outra mudança. Uma frase que não for achada aborta a migration. O
-- `create or replace` mantém o dono, os grants e o `security definer`.
--
-- Sem backfill (o banco é zerado antes do lançamento): o que já está gravado
-- (descrições de lançamento, motivos de perda que a rede tem) fica como está.

do $migra$
declare
  v_troca record;
  v_def   text;
  v_nova  text;
  v_achou boolean;
  v_fn    record;
begin
  for v_troca in
    select * from (values
      ('private', 'indicada_por_confere',      $a$A ficha de quem indicou é de outra clínica.$a$, $a$A ficha de quem indicou é de outra rede.$a$),
      ('private', 'limite_do_plano',           $a$case when v_unidades = 1 then 'clínica' else 'rede' end$a$, $a$'rede'$a$),
      ('private', 'maquininha_do_lancamento',  $a$Esta maquininha não é desta clínica.$a$, $a$Esta maquininha não é desta rede.$a$),
      ('private', 'motivos_perda_semear',      $a$Fechou com outra clínica$a$, $a$Fechou com a concorrência$a$),
      ('public',  'credito_vender',            $a$Bônus da compra do crédito na clínica (sem dinheiro)$a$, $a$Bônus da compra do crédito interno (sem dinheiro)$a$),
      ('public',  'credito_vender',            $a$Crédito na clínica comprado$a$, $a$Crédito interno comprado$a$),
      ('public',  'credito_vender',            $a$crédito na clínica não se paga com crédito.$a$, $a$crédito interno não se paga com crédito.$a$),
      ('public',  'credito_vender',            $a$'Crédito na clínica'$a$, $a$'Crédito interno'$a$),
      ('public',  'documento_assinar',         $a$Peça um novo à clínica.$a$, $a$Peça um novo à equipe.$a$),
      ('public',  'documentos_assinar',        $a$Peça um novo à clínica.$a$, $a$Peça um novo à equipe.$a$),
      ('public',  'estoque_transferir',        $a$Origem e destino devem ser filiais diferentes.$a$, $a$Origem e destino devem ser unidades diferentes.$a$),
      ('public',  'estornar_transacao',        $a$venda de crédito na clínica: estorne$a$, $a$venda de crédito interno: estorne$a$),
      ('public',  'gerar_plano_da_avaliacao',  $a$enviado para recepção$a$, $a$enviado ao PDV$a$),
      ('public',  'metrics_vendas',            $a$'Crédito na clínica', 1,$a$, $a$'Crédito interno', 1,$a$),
      ('public',  'pacote_cancelar_devolvendo',               $a$estorno ou crédito na clínica.$a$, $a$estorno ou crédito interno.$a$),
      ('public',  'plano_cancelar_devolvendo',                $a$estorno ou crédito na clínica.$a$, $a$estorno ou crédito interno.$a$),
      ('public',  'procedimento_cancelar_unidade_devolvendo', $a$estorno ou crédito na clínica.$a$, $a$estorno ou crédito interno.$a$),
      ('public',  'produto_devolver_itens',                   $a$estorno ou crédito na clínica.$a$, $a$estorno ou crédito interno.$a$),
      ('public',  'pacote_trazer',                 $a$não é da equipe desta clínica.$a$, $a$não é da equipe desta rede.$a$),
      ('public',  'pacote_vender_com_equipe',      $a$não é da equipe desta clínica.$a$, $a$não é da equipe desta rede.$a$),
      ('public',  'plano_comissao_de_venda',       $a$não é da equipe desta clínica.$a$, $a$não é da equipe desta rede.$a$),
      ('public',  'procedimento_vender_com_equipe', $a$não é da equipe desta clínica.$a$, $a$não é da equipe desta rede.$a$),
      ('public',  'produto_vender_itens',          $a$não é da equipe desta clínica.$a$, $a$não é da equipe desta rede.$a$),
      ('public',  'suporte_sessao_abrir',          $a$Sem autorização vigente da clínica para acessar esta conta.$a$, $a$Sem autorização vigente da rede para acessar esta conta.$a$)
    ) as t(esquema, funcao, velho, novo)
  loop
    v_achou := false;
    for v_fn in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = v_troca.esquema and p.proname = v_troca.funcao
    loop
      v_def := pg_get_functiondef(v_fn.oid);
      if position(v_troca.velho in v_def) > 0 then
        v_nova := replace(v_def, v_troca.velho, v_troca.novo);
        execute v_nova;
        v_achou := true;
      end if;
    end loop;
    if not v_achou then
      raise exception 'vocabulário: "%" não está em %.%', v_troca.velho, v_troca.esquema, v_troca.funcao;
    end if;
  end loop;
end
$migra$;

notify pgrst, 'reload schema';
