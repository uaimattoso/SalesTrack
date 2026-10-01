(function () {
  'use strict';
  let pending = null;
  function sync() {
    if (pending) return pending;
    const configuredUrl = window.SALES_TRACK_CONFIG?.contaAzulSyncUrl;
    if (!configuredUrl) return Promise.reject(new Error('Integração com o Conta Azul não configurada.'));
    pending = (async function () {
      const controller = new AbortController();
      const timeout = setTimeout(function () { controller.abort(); }, 360000);
      try {
        const url = new URL(configuredUrl);
        url.searchParams.set('action', 'sync');
        url.searchParams.set('_', String(Date.now()));
        const response = await fetch(url.toString(), {
          method: 'GET', cache: 'no-store', redirect: 'follow', signal: controller.signal
        });
        if (!response.ok) throw new Error('A ponte com o Conta Azul não respondeu.');
        const result = await response.json();
        if (!result.ok) throw new Error(result.message || 'Não foi possível atualizar o Conta Azul.');
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('A atualização demorou mais que o esperado. Confira a planilha antes de tentar novamente.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })().finally(function () { pending = null; });
    return pending;
  }
  window.SalesTrackSync = { sync: sync };
})();
