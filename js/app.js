/**
 * app.js — Orquestracao principal do SalesTrack
 */

(function() {

  let parsedData   = null;
  let currentFrom  = null;
  let currentTo    = null;
  let pieMode      = 'cliente'; // 'cliente' | 'produto'
  let quantityMode = 'bandejas'; // 'bandejas' | 'kg'
  let dashboardMode = 'vendas'; // 'vendas' | 'cancelamentos'
  let selectedMonth = new Date();
  let activePeriodMode = 'month';
  
  const LINK_DO_GOOGLE_SHEETS = window.SALES_TRACK_CONFIG?.sheetsCsvUrl
    || "https://docs.google.com/spreadsheets/d/e/2PACX-1vRiztbelxpXGX7JojQAWAEbs2nigwXpty7wG7Nuk80qlb0LLRPn36YEQeud30Bv0Eteb37ZLTnFZ5BX/pub?gid=0&single=true&output=csv";

  // ─── UTILITARIO DE DATA ───────────────────────────────────────

  function getMesCorrente() {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = now.getMonth();
    const from = new Date(y, m, 1);
    const to   = new Date(y, m + 1, 0);
    const fmt  = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { from: fmt(from), to: fmt(to) };
  }

  function parseInputDate(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatInputDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function monthYearLabel(date) {
    const text = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function shortRangeLabel(fromValue, toValue) {
    const from = parseInputDate(fromValue).toLocaleDateString('pt-BR');
    const to = parseInputDate(toValue).toLocaleDateString('pt-BR');
    return `${from} – ${to}`;
  }

  function compactRangeLabel(prefix, from, to) {
    const fromText = from.toLocaleDateString('pt-BR');
    const toText = to.toLocaleDateString('pt-BR');
    return `${prefix} · ${fromText} – ${toText}`;
  }

  function updatePeriodArrows() {
    const disabled = activePeriodMode === 'all';
    document.getElementById('previousMonthBtn').disabled = disabled;
    document.getElementById('nextMonthBtn').disabled = disabled;
  }

  function closePeriodDropdown() {
    document.getElementById('periodDropdown').classList.add('hidden');
    document.getElementById('periodDropdownToggle').setAttribute('aria-expanded', 'false');
  }

  function applyDateRange(from, to, label, mode = activePeriodMode) {
    activePeriodMode = mode;
    currentFrom = formatInputDate(from);
    currentTo = formatInputDate(to);
    UI.setDateFilter(currentFrom, currentTo);
    document.getElementById('periodSelectorLabel').textContent = label;
    updatePeriodArrows();
    closePeriodDropdown();
    renderDashboard(currentFrom, currentTo);
  }

  function getDataDateRange() {
    const dates = parsedData?.rows.map(row => row.date).filter(Boolean).sort((a, b) => a - b) || [];
    return dates.length ? { from: new Date(dates[0]), to: new Date(dates[dates.length - 1]) } : null;
  }

  function applyPeriodPreset(preset) {
    const now = new Date();
    let from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let to = new Date(from);
    let label = '';

    if (preset === 'today') {
      label = `Hoje · ${from.toLocaleDateString('pt-BR')}`;
    } else if (preset === 'week') {
      const sundayOffset = now.getDay();
      from.setDate(from.getDate() - sundayOffset);
      to = new Date(from);
      to.setDate(to.getDate() + 6);
      label = compactRangeLabel('Esta semana', from, to);
    } else if (preset === 'month') {
      selectedMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      label = monthYearLabel(from);
    } else if (preset === 'year') {
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31);
      label = `Este ano · ${now.getFullYear()}`;
    } else if (preset === 'last30') {
      from.setDate(from.getDate() - 29);
      label = compactRangeLabel('Últimos 30 dias', from, to);
    } else if (preset === 'last12months') {
      from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      from.setDate(from.getDate() + 1);
      label = compactRangeLabel('Últimos 12 meses', from, to);
    } else if (preset === 'all') {
      const dataRange = getDataDateRange();
      if (!dataRange) return;
      from = dataRange.from;
      to = dataRange.to;
      label = 'Todo o período';
    }

    applyDateRange(from, to, label, preset);
    document.querySelectorAll('.period-option').forEach(option => {
      option.classList.toggle('active', option.dataset.period === preset);
    });
  }

  function navigateActivePeriod(direction) {
    if (!currentFrom || !currentTo || activePeriodMode === 'all') return;

    let from = parseInputDate(currentFrom);
    let to = parseInputDate(currentTo);
    let label = '';

    if (activePeriodMode === 'today') {
      from.setDate(from.getDate() + direction);
      to = new Date(from);
      label = `Dia · ${from.toLocaleDateString('pt-BR')}`;
    } else if (activePeriodMode === 'week') {
      from.setDate(from.getDate() + direction * 7);
      to.setDate(to.getDate() + direction * 7);
      label = compactRangeLabel('Semana', from, to);
    } else if (activePeriodMode === 'month') {
      from = new Date(from.getFullYear(), from.getMonth() + direction, 1);
      to = new Date(from.getFullYear(), from.getMonth() + 1, 0);
      selectedMonth = new Date(from);
      label = monthYearLabel(from);
    } else if (activePeriodMode === 'year') {
      from = new Date(from.getFullYear() + direction, 0, 1);
      to = new Date(from.getFullYear(), 11, 31);
      label = `Ano · ${from.getFullYear()}`;
    } else if (activePeriodMode === 'last30') {
      from.setDate(from.getDate() + direction * 30);
      to.setDate(to.getDate() + direction * 30);
      label = compactRangeLabel('30 dias', from, to);
    } else if (activePeriodMode === 'last12months') {
      from.setMonth(from.getMonth() + direction * 12);
      to.setMonth(to.getMonth() + direction * 12);
      label = compactRangeLabel('12 meses', from, to);
    } else {
      const days = Math.round((to - from) / 86400000) + 1;
      from.setDate(from.getDate() + direction * days);
      to.setDate(to.getDate() + direction * days);
      label = compactRangeLabel('Personalizado', from, to);
    }

    applyDateRange(from, to, label, activePeriodMode);
  }

  function getPreviousRange(fromValue, toValue) {
    const from = parseInputDate(fromValue);
    const to = parseInputDate(toValue);
    const dayMs = 86400000;
    const days = Math.round((to - from) / dayMs) + 1;
    const lastDayOfMonth = new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate();
    const isFullMonth = from.getDate() === 1 && to.getDate() === lastDayOfMonth
      && from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    const isFullYear = from.getMonth() === 0 && from.getDate() === 1
      && to.getMonth() === 11 && to.getDate() === 31
      && from.getFullYear() === to.getFullYear();

    let previousFrom;
    let previousTo;
    let label;

    if (isFullYear) {
      previousFrom = new Date(from.getFullYear() - 1, 0, 1);
      previousTo = new Date(from.getFullYear() - 1, 11, 31);
      label = 'ano anterior';
    } else if (isFullMonth) {
      previousFrom = new Date(from.getFullYear(), from.getMonth() - 1, 1);
      previousTo = new Date(from.getFullYear(), from.getMonth(), 0);
      label = 'mês anterior';
    } else {
      previousTo = new Date(from);
      previousTo.setDate(previousTo.getDate() - 1);
      previousFrom = new Date(previousTo);
      previousFrom.setDate(previousFrom.getDate() - days + 1);
      label = days === 7 ? 'semana anterior' : `período anterior (${days} dias)`;
    }

    return { from: formatInputDate(previousFrom), to: formatInputDate(previousTo), label };
  }

  function buildDailySeries(dailyAgg, fromValue, toValue) {
    const valuesByDate = new Map(dailyAgg.map(item => [item.dateKey, item.total]));
    const from = parseInputDate(fromValue);
    const to = parseInputDate(toValue);
    const labels = [];
    const values = [];

    for (const cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
      const key = formatInputDate(cursor);
      labels.push(`${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      values.push(valuesByDate.get(key) || 0);
    }

    return { labels, values };
  }

  function buildMonthlySeries(dailyAgg, fromValue, toValue) {
    const from = parseInputDate(fromValue);
    const to = parseInputDate(toValue);
    const valuesByMonth = new Map();

    dailyAgg.forEach(item => {
      const monthKey = item.dateKey.slice(0, 7);
      valuesByMonth.set(monthKey, (valuesByMonth.get(monthKey) || 0) + item.total);
    });

    const labels = [];
    const values = [];
    for (const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      cursor <= to;
      cursor.setMonth(cursor.getMonth() + 1)) {
      const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
      labels.push(label.charAt(0).toUpperCase() + label.slice(1));
      values.push(valuesByMonth.get(monthKey) || 0);
    }

    return { labels, values };
  }

  function buildMonthlyFlow(dailyAgg, fromValue, toValue) {
    const series = buildMonthlySeries(dailyAgg, fromValue, toValue);
    return series.labels.map((label, index) => ({
      dateKey: `${parseInputDate(fromValue).getFullYear()}-${String(index + 1).padStart(2, '0')}`,
      label,
      total: series.values[index],
    }));
  }

  // ─── LEITURA DE DADOS (GOOGLE SHEETS) ─────────────────────────

  async function fetchData() {
    UI.updateSyncStatus('Sincronizando com o Google Drive...', 'carregando');
    
    try {
      const resposta = await fetch(LINK_DO_GOOGLE_SHEETS);
      if (!resposta.ok) throw new Error("Nao foi possivel acessar a planilha.");

      // O Google publica o CSV em UTF-8. A leitura como texto preserva
      // corretamente acentos em cabeçalhos como "Valor líquido".
      const csvText = await resposta.text();
      // raw:true impede que datas brasileiras sejam convertidas como mm/dd.
      const workbook = XLSX.read(csvText, { type: 'string', raw: true });
      const rawData  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

      parsedData = Parser.process(rawData, 'Google Drive (Tempo Real)');
      pieMode    = 'cliente'; // reseta o switch
      quantityMode = 'bandejas';

      // Sincroniza o switch no DOM
      const sw = document.getElementById('pieSwitch');
      if (sw) sw.checked = false;
      const quantitySw = document.getElementById('quantitySwitch');
      if (quantitySw) quantitySw.checked = false;
      UI.updatePieLabels('cliente');
      UI.updateQuantityLabels('bandejas');

      // Mostra/oculta o switch se a coluna de produto existir
      UI.setupPieSwitch(parsedData.hasProdutoColumn);

      // Se for a primeira carga, define o filtro do mes corrente
      if (!currentFrom || !currentTo) {
        const range = getMesCorrente();
        currentFrom = range.from;
        currentTo   = range.to;
        UI.setDateFilter(range.from, range.to);
        selectedMonth = parseInputDate(range.from);
        activePeriodMode = 'month';
        document.getElementById('periodSelectorLabel').textContent = monthYearLabel(selectedMonth);
        updatePeriodArrows();
      }

      renderDashboard();
      UI.updateSyncStatus('Dados atualizados em tempo real!', 'sucesso');
    } catch (err) {
      console.error(err);
      UI.updateSyncStatus('Falha ao sincronizar: ' + err.message, 'erro');
    }
  }

  // ─── RENDERIZAR DASHBOARD ─────────────────────────────────────

  function renderDashboard(dateFrom, dateTo) {
    if (!parsedData) return;

    const from = dateFrom || currentFrom;
    const to   = dateTo   || currentTo;

    const agg      = Parser.aggregate(parsedData, from, to, dashboardMode);
    const dailyAgg = Parser.aggregateByDay(parsedData, from, to, dashboardMode);
    const previousRange = getPreviousRange(from, to);
    const previousAgg = Parser.aggregate(parsedData, previousRange.from, previousRange.to, dashboardMode);
    const previousDailyAgg = Parser.aggregateByDay(parsedData, previousRange.from, previousRange.to, dashboardMode);
    const comparison = {
      label: previousRange.label,
      previousAgg,
    };
    const pieData = pieMode === 'produto'
      ? Parser.aggregateProductsByQuantity(parsedData, quantityMode, from, to, dashboardMode)
      : Parser.aggregateByField(parsedData, 'cliente', from, to, dashboardMode);

    UI.showDashboard();
    UI.updateKPIs(agg, comparison);
    UI.updateSummary(parsedData, agg, comparison);
    UI.updateFileInfo(parsedData, agg);
    UI.updateFooter();
    UI.setupDateFilter(parsedData.hasDateColumn);

    const chartGranularity = activePeriodMode === 'year' ? 'month' : 'day';
    const flowData = chartGranularity === 'month'
      ? buildMonthlyFlow(dailyAgg, from, to)
      : dailyAgg;
    const currentSeries = chartGranularity === 'month'
      ? buildMonthlySeries(dailyAgg, from, to)
      : buildDailySeries(dailyAgg, from, to);
    const previousSeries = chartGranularity === 'month'
      ? buildMonthlySeries(previousDailyAgg, previousRange.from, previousRange.to)
      : buildDailySeries(previousDailyAgg, previousRange.from, previousRange.to);

    UI.updateChartGranularity(chartGranularity, dashboardMode);
    Charts.renderDailyFlow(flowData, chartGranularity);
    Charts.renderPie(pieData, pieMode === 'produto' ? quantityMode : 'currency');
    Charts.renderPeriodComparison(
      currentSeries,
      previousSeries,
      previousRange.label,
      chartGranularity
    );
    document.getElementById('comparison-period-label').textContent = `Atual × ${previousRange.label}`;
  }

  // ─── INICIALIZACAO ────────────────────────────────────────────
  
  window.addEventListener('DOMContentLoaded', () => {
    fetchData();
  });

  // ─── EVENTOS DA UI ────────────────────────────────────────────

  document.getElementById('pieSwitch').addEventListener('change', function() {
    pieMode = this.checked ? 'produto' : 'cliente';
    UI.updatePieLabels(pieMode);
    if (!parsedData) return;
    const pieData = pieMode === 'produto'
      ? Parser.aggregateProductsByQuantity(parsedData, quantityMode, currentFrom, currentTo, dashboardMode)
      : Parser.aggregateByField(parsedData, 'cliente', currentFrom, currentTo, dashboardMode);
    Charts.renderPie(pieData, pieMode === 'produto' ? quantityMode : 'currency');
  });

  document.getElementById('quantitySwitch').addEventListener('change', function() {
    quantityMode = this.checked ? 'kg' : 'bandejas';
    UI.updateQuantityLabels(quantityMode);
    if (!parsedData || pieMode !== 'produto') return;
    const pieData = Parser.aggregateProductsByQuantity(parsedData, quantityMode, currentFrom, currentTo, dashboardMode);
    Charts.renderPie(pieData, quantityMode);
  });

  function setDashboardMode(mode) {
    dashboardMode = mode;
    renderDashboard(currentFrom, currentTo);
  }

  document.getElementById('cancellationModeCard').addEventListener('click', () => {
    setDashboardMode(dashboardMode === 'cancelamentos' ? 'vendas' : 'cancelamentos');
  });

  document.getElementById('salesModeCard').addEventListener('click', () => setDashboardMode('vendas'));

  ['cancellationModeCard', 'salesModeCard'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.getElementById(id).click();
      }
    });
  });

  document.getElementById('newFileBtn').addEventListener('click', () => {
    fetchData(); // Agora ele funciona como botao Atualizar
  });

  document.getElementById('periodDropdownToggle').addEventListener('click', () => {
    const dropdown = document.getElementById('periodDropdown');
    const willOpen = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden', !willOpen);
    document.getElementById('periodDropdownToggle').setAttribute('aria-expanded', String(willOpen));
    if (!willOpen) document.getElementById('customDatePanel').classList.add('hidden');
  });

  document.querySelectorAll('.period-option').forEach(option => {
    option.addEventListener('click', event => {
      event.stopPropagation();
      if (option.dataset.period === 'custom') {
        document.getElementById('customDatePanel').classList.remove('hidden');
      } else {
        applyPeriodPreset(option.dataset.period);
      }
    });
  });

  document.getElementById('previousMonthBtn').addEventListener('click', () => {
    navigateActivePeriod(-1);
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    navigateActivePeriod(1);
  });

  document.getElementById('applyFilter').addEventListener('click', () => {
    const from = document.getElementById('dateFrom').value;
    const to   = document.getElementById('dateTo').value;
    if (from && to) {
      applyDateRange(parseInputDate(from), parseInputDate(to), shortRangeLabel(from, to), 'custom');
    }
  });

  document.getElementById('cancelCustomFilter').addEventListener('click', () => {
    document.getElementById('customDatePanel').classList.add('hidden');
  });

  document.addEventListener('click', event => {
    if (!document.getElementById('dateFilterContainer').contains(event.target)) closePeriodDropdown();
  });

})();
