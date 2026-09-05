(function () {
  'use strict';

  const modal = document.getElementById('companyMenuModal');
  const toggle = document.getElementById('companyMenuToggle');
  const views = {
    salestrack: document.getElementById('salestrack-view'),
    socios: document.getElementById('socios-view'),
    construction: document.getElementById('construction-view')
  };
  const footer = document.querySelector('.footer');
  const originalFooter = footer ? footer.innerHTML : '';
  let currentView = 'salestrack';
  let sociosLoaded = false;
  let sociosLoading = false;
  let sociosRows = [];
  let sociosChart = null;
  let sociosMetric = 'all';

  document.body.dataset.dashboard = 'salestrack';

  function openMenu() {
    modal.classList.remove('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const selected = modal.querySelector('.company-option.selected') || modal.querySelector('.company-option');
    if (selected) selected.focus();
  }

  function closeMenu() {
    modal.classList.add('hidden');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    toggle.focus();
  }

  function showView(name) {
    currentView = name;
    Object.values(views).forEach(function (view) { view.classList.add('hidden'); });
    modal.querySelectorAll('.company-option').forEach(function (option) {
      option.classList.toggle('selected', option.dataset.view === name);
    });

    document.body.dataset.dashboard = name;
    if (name === 'salestrack') {
      views.salestrack.classList.remove('hidden');
      if (footer) footer.innerHTML = originalFooter;
    } else if (name === 'socios') {
      views.socios.classList.remove('hidden');
      if (footer) footer.textContent = 'Fazenda Eldorado — Dashboard de Sócios';
      loadSocios();
    } else {
      const isDre = name === 'dre';
      document.getElementById('constructionTitle').textContent = isDre ? 'DRE em construção' : 'Fluxo de Caixa em construção';
      document.getElementById('constructionDescription').textContent = isDre
        ? 'O demonstrativo de resultados será disponibilizado aqui em breve.'
        : 'A visão interativa de entradas, saídas e projeções será disponibilizada aqui em breve.';
      views.construction.classList.remove('hidden');
      if (footer) footer.textContent = 'Fazenda Eldorado — ' + (isDre ? 'DRE' : 'Fluxo de Caixa');
    }
    closeMenu();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(field); field = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(field); field = '';
        if (row.some(function (value) { return value.trim(); })) rows.push(row);
        row = [];
      } else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function toNumber(value) {
    const clean = String(value || '').replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    return Number(clean) || 0;
  }

  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
  }

  async function loadSocios() {
    if (sociosLoading) return;
    sociosLoading = true;
    const status = document.getElementById('sociosStatus');
    const refresh = document.getElementById('sociosRefresh');
    refresh.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Consultando planilha…';
    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      const response = await fetch(window.SALES_TRACK_CONFIG.sociosCsvUrl + '&_=' + Date.now(), { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Falha ao consultar a planilha');
      const matrix = parseCsv(await response.text());
      const headers = ['Sócio/Acionista', 'Valor aplicado', 'Valor devolvido', 'Situação'];
      const headerIndex = matrix.findIndex(function (row) {
        return headers.every(function (name) { return row.includes(name); });
      });
      if (headerIndex < 0) throw new Error('Base de empréstimos e AFAC não disponível');
      const columns = headers.map(function (name) { return matrix[headerIndex].indexOf(name); });
      const partners = new Map();
      matrix.slice(headerIndex + 1).forEach(function (row) {
        const nome = String(row[columns[0]] || '').trim();
        if (!nome || String(row[columns[3]] || '').trim() !== 'Pago') return;
        const partner = partners.get(nome) || { nome: nome, aplicado: 0, devolvido: 0, saldo: 0 };
        partner.aplicado += Math.round(toNumber(row[columns[1]]) * 100);
        partner.devolvido += Math.round(toNumber(row[columns[2]]) * 100);
        partners.set(nome, partner);
      });
      const rows = Array.from(partners.values()).map(function (partner) {
        partner.saldo = (partner.aplicado - partner.devolvido) / 100;
        partner.aplicado /= 100;
        partner.devolvido /= 100;
        return partner;
      }).sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      if (!rows.length) throw new Error('Nenhum dado disponível');
      sociosRows = rows;
      sociosLoaded = true;
      status.textContent = 'Planilha consultada às ' + new Date().toLocaleTimeString('pt-BR');
      renderSocios();
    } catch (error) {
      status.textContent = sociosLoaded ? 'Falha ao atualizar — exibindo a última consulta' : 'Não foi possível consultar a planilha';
      status.classList.add('error');
      if (!sociosLoaded) {
        ['sociosTotalAplicado', 'sociosTotalDevolvido', 'sociosSaldoLiquido', 'sociosTotalAplicadoSub'].forEach(function (id) {
          document.getElementById(id).textContent = '—';
        });
        document.getElementById('sociosTableBody').innerHTML = '<tr><td colspan="4">A base de sócios está indisponível. Confira o acesso à planilha e tente atualizar novamente.</td></tr>';
      }
    } finally {
      clearTimeout(timeout);
      sociosLoading = false;
      refresh.disabled = false;
    }
  }

  function renderSocios() {
    const totals = sociosRows.reduce(function (sum, row) {
      sum.aplicado += row.aplicado;
      sum.devolvido += row.devolvido;
      sum.saldo += row.saldo;
      return sum;
    }, { aplicado: 0, devolvido: 0, saldo: 0 });
    document.getElementById('sociosTotalAplicado').textContent = money(totals.aplicado);
    document.getElementById('sociosTotalDevolvido').textContent = money(totals.devolvido);
    document.getElementById('sociosSaldoLiquido').textContent = money(totals.saldo);
    document.getElementById('sociosTotalAplicadoSub').textContent = sociosRows.length + ' acionistas';
    renderSociosTable();
    renderSociosChart();
  }

  function renderSociosTable() {
    const query = document.getElementById('sociosSearch').value.trim().toLocaleLowerCase('pt-BR');
    const filtered = sociosRows.filter(function (row) { return row.nome.toLocaleLowerCase('pt-BR').includes(query); });
    document.getElementById('sociosTableBody').innerHTML = filtered.map(function (row) {
      return '<tr><td>' + escapeHtml(row.nome) + '</td><td>' + money(row.aplicado) + '</td><td>' + money(row.devolvido) + '</td><td>' + money(row.saldo) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">Nenhum acionista encontrado.</td></tr>';
  }

  function renderSociosChart() {
    const isLight = document.documentElement.dataset.theme === 'light';
    const datasets = sociosMetric === 'saldo'
      ? [{ label: 'Saldo líquido', data: sociosRows.map(function (row) { return row.saldo; }), backgroundColor: '#3b82f6', borderRadius: 7 }]
      : [
        { label: 'Aplicado', data: sociosRows.map(function (row) { return row.aplicado; }), backgroundColor: '#3b82f6', borderRadius: 7 },
        { label: 'Devolvido', data: sociosRows.map(function (row) { return row.devolvido; }), backgroundColor: '#fcb900', borderRadius: 7 }
      ];
    if (sociosChart) sociosChart.destroy();
    sociosChart = new Chart(document.getElementById('sociosChart'), {
      type: 'bar',
      data: { labels: sociosRows.map(function (row) { return row.nome; }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: isLight ? '#334155' : '#cbd5e1', usePointStyle: true } }, tooltip: { callbacks: { label: function (item) { return item.dataset.label + ': ' + money(item.raw); } } } },
        scales: {
          x: { ticks: { color: isLight ? '#475569' : '#94a3b8', maxRotation: 25 }, grid: { display: false } },
          y: { ticks: { color: isLight ? '#475569' : '#94a3b8', callback: function (value) { return 'R$ ' + (value / 1000000).toFixed(1).replace('.', ',') + ' mi'; } }, grid: { color: isLight ? 'rgba(15,23,42,.08)' : 'rgba(148,163,184,.09)' } }
        }
      }
    });
  }

  toggle.addEventListener('click', openMenu);
  modal.querySelectorAll('[data-close-company-menu]').forEach(function (button) { button.addEventListener('click', closeMenu); });
  modal.querySelectorAll('.company-option').forEach(function (button) { button.addEventListener('click', function () { showView(button.dataset.view); }); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !modal.classList.contains('hidden')) closeMenu(); });
  document.getElementById('sociosSearch').addEventListener('input', renderSociosTable);
  document.getElementById('sociosRefresh').addEventListener('click', loadSocios);
  document.querySelectorAll('[data-socios-metric]').forEach(function (button) {
    button.addEventListener('click', function () {
      sociosMetric = button.dataset.sociosMetric;
      document.querySelectorAll('[data-socios-metric]').forEach(function (item) { item.classList.toggle('active', item === button); });
      renderSociosChart();
    });
  });

  new MutationObserver(function () { if (sociosLoaded && currentView === 'socios') renderSociosChart(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
