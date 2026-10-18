/**
 * O movimento do site (2026-10-18). A página NASCE visível e parada; quem a
 * põe em movimento é a classe `site-movimento` no <html>, que só o script do
 * <head> (`SCRIPT_DO_MOVIMENTO`, no layout) liga — e só para quem não pediu
 * menos movimento ao aparelho. Daí:
 *  - sem JavaScript, a classe nunca entra;
 *  - se o script da página não carregar, o do <head> a tira sozinho depois de
 *    3,5 s, porque ninguém marcou `data-movimento="vivo"` — nada fica preso
 *    invisível (foi o que tirou o fade-up do sistema).
 */
export const SCRIPT_DO_MOVIMENTO = `(function(){try{
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var d=document.documentElement;d.classList.add('site-movimento');
setTimeout(function(){if(d.getAttribute('data-movimento')!=='vivo')d.classList.remove('site-movimento')},3500);
}catch(e){}})()`
