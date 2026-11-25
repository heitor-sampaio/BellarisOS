-- Os tetos que recusavam o valor que a rede escolheu viram AVISO (princípio 2,
-- o Heitor, 2026-11-04: "Não recusar o valor que a rede escolheu (taxa,
-- percentual, preço, prazo): no máximo, avisar. Só o que é impossível
-- (negativo, a rede errada, sem permissão) é recusado.").
--
-- O banco guardava os mesmos tetos da tela: a fidelidade (bônus até 1.000.000,
-- validade até 120 meses, aviso até 90 dias, pontos da indicação até
-- 1.000.000), a validade do voucher (até 365 dias), o prazo da operadora (até
-- 120 dias, na maquininha e no da rede) e o limite do crediário (até 48
-- parcelas). Fica só o impossível: o negativo e o zero onde não cabe. O limite
-- do que se guarda é o tipo da coluna; acima do comum, a tela avisa.

alter table public.loyalty_configs
  drop constraint if exists loyalty_configs_birthday_bonus_check,
  add constraint loyalty_configs_birthday_bonus_check check (birthday_bonus >= 0),
  drop constraint if exists loyalty_configs_first_access_bonus_check,
  add constraint loyalty_configs_first_access_bonus_check check (first_access_bonus >= 0),
  drop constraint if exists loyalty_configs_indicacao_pontos_check,
  add constraint loyalty_configs_indicacao_pontos_check check (indicacao_pontos >= 0),
  drop constraint if exists loyalty_configs_expiry_months_check,
  add constraint loyalty_configs_expiry_months_check check (expiry_months is null or expiry_months >= 1),
  drop constraint if exists loyalty_configs_expiry_notice_days_check,
  add constraint loyalty_configs_expiry_notice_days_check check (expiry_notice_days is null or expiry_notice_days >= 1);

alter table public.loyalty_rewards
  drop constraint if exists loyalty_rewards_validity_days_check,
  add constraint loyalty_rewards_validity_days_check check (validity_days >= 1);

alter table public.maquininhas
  drop constraint if exists maquininhas_prazo_dias_check,
  add constraint maquininhas_prazo_dias_check check (prazo_dias >= 1);

alter table public.tenants
  drop constraint if exists tenants_cartao_prazo_dias_check,
  add constraint tenants_cartao_prazo_dias_check check (cartao_prazo_dias >= 1),
  drop constraint if exists tenants_crediario_max_parcelas_check,
  add constraint tenants_crediario_max_parcelas_check check (crediario_max_parcelas >= 1);

notify pgrst, 'reload schema';
