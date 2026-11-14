-- Bloco Prontuário, PR3 (a revisão do Heitor, 2026-11-13): "Ficha de saúde"
-- em todo texto que se lê. O NOME da ficha da rede (forms.name, tipo
-- PRE_ATENDIMENTO) é texto que se lê — vai à tela, ao app e ao pacote LGPD —
-- e nascia "Pré-atendimento". O tipo (PRE_ATENDIMENTO), as tabelas e as
-- funções mantêm o nome de código.
--
-- 1. As fichas que ainda têm o nome de fábrica passam a "Ficha de saúde" (a
--    rede que deu outro nome fica com o dela).
-- 2. A rede nova nasce com "Ficha de saúde" (trg_rede_nasce_com_pre_atendimento).
-- 3. O retrato do legado (anamnese_do_legado) e o erro do link
--    (pre_atendimento_link_criar) dizem "ficha de saúde".
--
-- As funções são recriadas a partir do corpo de PRODUÇÃO (pg_get_functiondef),
-- trocando só o texto.

update public.forms
   set name = 'Ficha de saúde'
 where tipo = 'PRE_ATENDIMENTO' and name = 'Pré-atendimento';

do $$
declare
  v_def text;
  v_nova text;
  r record;
begin
  for r in
    select p.oid, p.proname, x.de, x.para
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join (values
        ('trg_rede_nasce_com_pre_atendimento', 'private', '''Pré-atendimento''', '''Ficha de saúde'''),
        ('anamnese_do_legado',                 'public',  '''Pré-atendimento''', '''Ficha de saúde'''),
        ('pre_atendimento_link_criar',         'public',  '''Pré-atendimento não encontrado.''', '''Ficha de saúde não encontrada.''')
      ) as x(nome, esquema, de, para) on x.nome = p.proname and x.esquema = n.nspname
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nova := replace(v_def, r.de, r.para);
    if v_nova = v_def then
      raise exception 'PR3: o texto de % não foi encontrado', r.proname;
    end if;
    execute v_nova;
  end loop;
end $$;

notify pgrst, 'reload schema';
