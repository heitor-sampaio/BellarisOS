// Abre o painel lateral ao clicar no ícone da extensão.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('sidePanel behavior', err))
})
