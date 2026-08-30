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
  let traysDetailOpen = false;
  let kgDetailOpen = false;
  
  const LINK_DO_GOOGLE_SHEETS = window.SALES_TRACK_CONFIG?.sheetsCsvUrl
    || "https://docs.google.com/spreadsheets/d/e/2PACX-1vRiztbelxpXGX7JojQAWAEbs2nigwXpty7wG7Nuk80qlb0LLRPn36YEQeud30Bv0Eteb37ZLTnFZ5BX/pub?gid=0&single=true&output=csv";
  const CONTA_AZUL_SYNC_URL = window.SALES_TRACK_CONFIG?.contaAzulSyncUrl || '';

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

  function buildWeeklySeries(dailyAgg, fromValue, toValue) {
    const from = parseInputDate(fromValue);
    const to = parseInputDate(toValue);
    const weekCount = Math.ceil(to.getDate() / 7);
    const values = Array(weekCount).fill(0);

    dailyAgg.forEach(item => {
      const date = parseInputDate(item.dateKey);
      const weekIndex = Math.floor((date.getDate() - 1) / 7);
      if (weekIndex >= 0 && weekIndex < values.length) values[weekIndex] += item.total;
    });

    return {
      labels: values.map((_, index) => `Semana ${index + 1}`),
      values,
    };
  }

  function buildWeeklyFlow(dailyAgg, fromValue, toValue) {
    const series = buildWeeklySeries(dailyAgg, fromValue, toValue);
    return series.labels.map((label, index) => ({
      dateKey: `semana-${index + 1}`,
      label,
      total: series.values[index],
    }));
  }

  function buildWeekdaySeries(dailyAgg, fromValue, toValue) {
    const dailySeries = buildDailySeries(dailyAgg, fromValue, toValue);
    const from = parseInputDate(fromValue);
    const labels = dailySeries.labels.map((_, index) => {
      const date = new Date(from);
      date.setDate(from.getDate() + index);
      const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', '');
      return weekday.charAt(0).toUpperCase() + weekday.slice(1);
    });
    return { labels, values: dailySeries.values };
  }

  function buildWeekdayFlow(dailyAgg, fromValue, toValue) {
    const series = buildWeekdaySeries(dailyAgg, fromValue, toValue);
    return series.labels.map((label, index) => ({
      dateKey: `dia-semana-${index + 1}`,
      label,
      total: series.values[index],
    }));
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

  function buildYearlySeries(dailyAgg, fromValue, toValue) {
    const from = parseInputDate(fromValue);
    const to = parseInputDate(toValue);
    const valuesByYear = new Map();

    dailyAgg.forEach(item => {
      const yearKey = item.dateKey.slice(0, 4);
      valuesByYear.set(yearKey, (valuesByYear.get(yearKey) || 0) + item.total);
    });

    const labels = [];
    const values = [];
    for (let year = from.getFullYear(); year <= to.getFullYear(); year += 1) {
      const yearKey = String(year);
      labels.push(yearKey);
      values.push(valuesByYear.get(yearKey) || 0);
    }

    return { labels, values };
  }

  function buildYearlyFlow(dailyAgg, fromValue, toValue) {
    const series = buildYearlySeries(dailyAgg, fromValue, toValue);
    return series.labels.map((label, index) => ({
      dateKey: label,
      label,
      total: series.values[index],
    }));
  }

  function updateComparisonBadge(currentSeries, previousSeries, previousLabel, valueMode) {
    const badge = document.getElementById('comparison-period-label');
    const currentTotal = currentSeries.values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    const previousTotal = previousSeries.values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    const difference = currentTotal - previousTotal;
    const neutral = Math.abs(difference) < 0.005;
    const growth = difference > 0;
    const percentage = previousTotal > 0 ? difference / previousTotal * 100 : (currentTotal > 0 ? 100 : 0);
    const cssClass = neutral ? 'neutral' : (growth ? 'growth' : 'decline');
    const icon = neutral ? '•' : (growth ? '🚀' : '▼');
    const signal = percentage > 0 ? '+' : '';
    const absoluteDifference = valueMode === 'currency'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(difference)
      : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(difference)} ${valueMode === 'kg' ? 'kg' : 'bandejas'}`;

    badge.classList.remove('growth', 'decline', 'neutral');
    badge.classList.add('comparison-delta', cssClass);
    badge.title = `Diferença absoluta: ${absoluteDifference}`;
    badge.innerHTML = `
      <span class="comparison-delta-icon">${icon}</span>
      <span class="comparison-delta-copy">
        <strong>${signal}${percentage.toFixed(1).replace('.', ',')}%</strong>
        <small>${absoluteDifference} · ${previousLabel}</small>
      </span>`;
  }

  // ─── LEITURA DE DADOS (GOOGLE SHEETS) ─────────────────────────

  async function fetchData() {
    UI.updateSyncStatus('Sincronizando com o Google Drive...', 'carregando');
    
    try {
      const separator = LINK_DO_GOOGLE_SHEETS.includes('?') ? '&' : '?';
      const resposta = await fetch(`${LINK_DO_GOOGLE_SHEETS}${separator}_=${Date.now()}`, { cache: 'no-store' });
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
      return true;
    } catch (err) {
      console.error(err);
      UI.updateSyncStatus('Falha ao sincronizar: ' + err.message, 'erro');
      return false;
    }
  }

  async function syncContaAzulAndRefresh() {
    const button = document.getElementById('newFileBtn');
    if (!CONTA_AZUL_SYNC_URL || button.disabled) return;

    button.disabled = true;
    button.classList.add('is-syncing');
    button.setAttribute('aria-busy', 'true');
    UI.updateSyncStatus('Buscando dados diretamente no Conta Azul...', 'carregando');

    try {
      const separator = CONTA_AZUL_SYNC_URL.includes('?') ? '&' : '?';
      const response = await fetch(`${CONTA_AZUL_SYNC_URL}${separator}action=sync&_=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
      });
      if (!response.ok) throw new Error('A ponte com o Conta Azul não respondeu.');
      const result = await response.json();
      if (!result.ok) throw new Error(result.message || 'Não foi possível atualizar o Conta Azul.');

      UI.updateSyncStatus(`${result.sales || 0} vendas recebidas do Conta Azul. Atualizando painel...`, 'carregando');
      await new Promise(resolve => setTimeout(resolve, 1200));
      const refreshed = await fetchData();
      if (!refreshed) throw new Error('A planilha foi atualizada, mas o painel não conseguiu recarregar.');
    } catch (error) {
      console.error(error);
      UI.updateSyncStatus('Falha ao atualizar pelo Conta Azul: ' + error.message, 'erro');
    } finally {
      button.disabled = false;
      button.classList.remove('is-syncing');
      button.removeAttribute('aria-busy');
    }
  }

  // ─── RENDERIZAR DASHBOARD ─────────────────────────────────────

  function renderDashboard(dateFrom, dateTo) {
    if (!parsedData) return;

    const from = dateFrom || currentFrom;
    const to   = dateTo   || currentTo;

    const productScope = kgDetailOpen ? 'shiitake' : null;
    const agg      = Parser.aggregate(parsedData, from, to, dashboardMode, productScope);
    const dashboardValueMode = (kgDetailOpen || traysDetailOpen) ? quantityMode : 'currency';
    const dailyAgg = Parser.aggregateByDay(parsedData, from, to, dashboardMode, dashboardValueMode, productScope);
    const previousRange = getPreviousRange(from, to);
    const previousAgg = Parser.aggregate(parsedData, previousRange.from, previousRange.to, dashboardMode, productScope);
    const previousDailyAgg = Parser.aggregateByDay(parsedData, previousRange.from, previousRange.to, dashboardMode, dashboardValueMode, productScope);
    const comparison = {
      label: previousRange.label,
      previousAgg,
    };
    let pieData = pieMode === 'produto'
      ? Parser.aggregateProductsByQuantity(parsedData, quantityMode, from, to, dashboardMode)
      : Parser.aggregateByField(parsedData, 'cliente', from, to, dashboardMode);
    if (productScope === 'shiitake') {
      pieData = pieData.filter(product => Parser.norm(product.name).includes('shiitake'));
    }

    UI.showDashboard();
    UI.updateKPIs(agg, comparison);
    document.getElementById('traysDetailCard').classList.toggle('mode-active', traysDetailOpen);
    document.getElementById('kgDetailCard').classList.toggle('mode-active', kgDetailOpen);
    document.getElementById('pieSwitchContainer').classList.toggle('hidden', traysDetailOpen || kgDetailOpen || !parsedData.hasProdutoColumn);
    document.getElementById('quantitySwitchContainer').classList.toggle('hidden', pieMode !== 'produto');
    if (traysDetailOpen) {
      document.getElementById('comparison-title').textContent = `Comparativo de ${quantityMode === 'kg' ? 'Kg' : 'Bandejas'}`;
      document.getElementById('summary-title').textContent = `Resumo por ${quantityMode === 'kg' ? 'Kg' : 'Bandejas'}`;
    } else if (kgDetailOpen) {
      document.getElementById('kpi-total-label').textContent = `Vendas de Shiitake do Período (${agg.totalVendas})`;
      document.getElementById('kpi-toneladas-label').textContent = 'Shiitake em Toneladas';
      const toneladasComposition = document.getElementById('kpi-toneladas-composition');
      toneladasComposition.textContent = `Inteiro: ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(agg.totalKgShiitakeInteiro / 1000)} t | Fatiado: ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(agg.totalKgShiitakeFatiado / 1000)} t`;
      toneladasComposition.classList.remove('hidden');
      document.getElementById('kpi-bandejas-label').textContent = 'Bandejas de Shiitake';
      document.getElementById('kpi-bandejas-composition').textContent = `Inteiro: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(agg.totalBandejasShiitakeInteiro)} | Fatiado: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(agg.totalBandejasShiitakeFatiado)}`;
      document.getElementById('kpi-kg-label').textContent = 'Shiitake';
      document.getElementById('kpi-cancel-label').textContent = `Cancelamentos de Shiitake (${agg.totalCancelamentos})`;
      document.getElementById('kpi-top-label').textContent = 'Melhor Vendedor de Shiitake';
      const shiitakeUnit = quantityMode === 'kg' ? 'Kg' : 'Bandejas';
      document.getElementById('comparison-title').textContent = `Comparativo de ${shiitakeUnit} de Shiitake`;
      document.getElementById('summary-title').textContent = `Resumo de Shiitake por ${shiitakeUnit}`;
    }
    UI.updateSummary(parsedData, agg, comparison, dashboardValueMode, productScope);
    UI.updateFileInfo(parsedData, agg);
    UI.updateFooter();
    UI.setupDateFilter(parsedData.hasDateColumn);

    const chartGranularity = activePeriodMode === 'all'
      ? 'year'
      : (activePeriodMode === 'year'
        ? 'month'
        : (activePeriodMode === 'month' ? 'week' : (activePeriodMode === 'week' ? 'weekday' : 'day')));
    const flowData = chartGranularity === 'year'
      ? buildYearlyFlow(dailyAgg, from, to)
      : (chartGranularity === 'month'
        ? buildMonthlyFlow(dailyAgg, from, to)
        : (chartGranularity === 'week'
          ? buildWeeklyFlow(dailyAgg, from, to)
          : (chartGranularity === 'weekday' ? buildWeekdayFlow(dailyAgg, from, to) : dailyAgg)));
    const currentSeries = chartGranularity === 'year'
      ? buildYearlySeries(dailyAgg, from, to)
      : (chartGranularity === 'month'
        ? buildMonthlySeries(dailyAgg, from, to)
        : (chartGranularity === 'week'
          ? buildWeeklySeries(dailyAgg, from, to)
          : (chartGranularity === 'weekday'
            ? buildWeekdaySeries(dailyAgg, from, to)
            : buildDailySeries(dailyAgg, from, to))));

    let chartPreviousLabel = previousRange.label;
    let previousSeries;
    if (chartGranularity === 'year') {
      const allFrom = parseInputDate(from);
      const allTo = parseInputDate(to);
      const previousYearFrom = formatInputDate(new Date(allFrom.getFullYear() - 1, 0, 1));
      const previousYearTo = formatInputDate(new Date(allTo.getFullYear() - 1, 11, 31));
      const previousYearDailyAgg = Parser.aggregateByDay(
        parsedData,
        previousYearFrom,
        previousYearTo,
        dashboardMode,
        dashboardValueMode,
        productScope
      );
      previousSeries = buildYearlySeries(previousYearDailyAgg, previousYearFrom, previousYearTo);
      chartPreviousLabel = 'ano anterior';
    } else {
      previousSeries = chartGranularity === 'month'
        ? buildMonthlySeries(previousDailyAgg, previousRange.from, previousRange.to)
        : (chartGranularity === 'week'
          ? buildWeeklySeries(previousDailyAgg, previousRange.from, previousRange.to)
          : (chartGranularity === 'weekday'
            ? buildWeekdaySeries(previousDailyAgg, previousRange.from, previousRange.to)
            : buildDailySeries(previousDailyAgg, previousRange.from, previousRange.to)));
    }

    UI.updateChartGranularity(chartGranularity, dashboardMode, dashboardValueMode);
    if (kgDetailOpen) {
      const flowTitle = document.getElementById('daily-chart-title');
      flowTitle.textContent = quantityMode === 'kg'
        ? flowTitle.textContent.replace('Kg Vendidos', 'Kg de Shiitake Vendidos')
        : flowTitle.textContent.replace('Bandejas Vendidas', 'Bandejas de Shiitake Vendidas');
    }
    Charts.renderDailyFlow(flowData, chartGranularity, dashboardValueMode);
    Charts.renderPie(pieData, pieMode === 'produto' ? quantityMode : 'currency');
    Charts.renderPeriodComparison(
      currentSeries,
      previousSeries,
      chartPreviousLabel,
      chartGranularity,
      dashboardValueMode
    );
    updateComparisonBadge(currentSeries, previousSeries, chartPreviousLabel, dashboardValueMode);

    if (traysDetailOpen) {
      const pivot = Parser.buildSalesProductPivot(parsedData, from, to, dashboardMode);
      UI.renderTraysDetail(pivot, document.getElementById('periodSelectorLabel').textContent);
    }
  }

  // ─── INICIALIZACAO ────────────────────────────────────────────
  
  window.addEventListener('DOMContentLoaded', () => {
    fetchData();
  });

  window.addEventListener('salestrack:themechange', () => {
    if (parsedData && currentFrom && currentTo) renderDashboard(currentFrom, currentTo);
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
    renderDashboard(currentFrom, currentTo);
  });

  function setDashboardMode(mode) {
    dashboardMode = mode;
    renderDashboard(currentFrom, currentTo);
  }

  document.getElementById('cancellationModeCard').addEventListener('click', () => {
    traysDetailOpen = false;
    kgDetailOpen = false;
    pieMode = 'cliente';
    document.getElementById('pieSwitch').checked = false;
    UI.updatePieLabels('cliente');
    document.getElementById('traysDetailPanel').classList.add('hidden');
    setDashboardMode(dashboardMode === 'cancelamentos' ? 'vendas' : 'cancelamentos');
  });

  document.getElementById('salesModeCard').addEventListener('click', () => {
    traysDetailOpen = false;
    kgDetailOpen = false;
    pieMode = 'cliente';
    document.getElementById('pieSwitch').checked = false;
    UI.updatePieLabels('cliente');
    document.getElementById('traysDetailPanel').classList.add('hidden');
    setDashboardMode('vendas');
  });

  function toggleTraysDetail() {
    if (traysDetailOpen) {
      traysDetailOpen = false;
      pieMode = 'cliente';
      document.getElementById('pieSwitch').checked = false;
      UI.updatePieLabels('cliente');
      document.getElementById('traysDetailPanel').classList.add('hidden');
      renderDashboard(currentFrom, currentTo);
      return;
    }

    dashboardMode = 'vendas';
    kgDetailOpen = false;
    pieMode = 'produto';
    quantityMode = 'bandejas';
    traysDetailOpen = true;
    document.getElementById('pieSwitch').checked = true;
    document.getElementById('quantitySwitch').checked = false;
    UI.updatePieLabels('produto');
    UI.updateQuantityLabels('bandejas');
    document.getElementById('traysDetailPanel').classList.remove('hidden');
    renderDashboard(currentFrom, currentTo);
  }

  document.getElementById('traysDetailCard').addEventListener('click', toggleTraysDetail);
  document.getElementById('traysDetailCard').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleTraysDetail();
    }
  });

  function toggleKgDetail() {
    if (kgDetailOpen) {
      kgDetailOpen = false;
      pieMode = 'cliente';
      quantityMode = 'bandejas';
      document.getElementById('pieSwitch').checked = false;
      document.getElementById('quantitySwitch').checked = false;
      UI.updatePieLabels('cliente');
      UI.updateQuantityLabels('bandejas');
      renderDashboard(currentFrom, currentTo);
      return;
    }

    dashboardMode = 'vendas';
    traysDetailOpen = false;
    kgDetailOpen = true;
    pieMode = 'produto';
    quantityMode = 'kg';
    document.getElementById('pieSwitch').checked = true;
    document.getElementById('quantitySwitch').checked = true;
    UI.updatePieLabels('produto');
    UI.updateQuantityLabels('kg');
    document.getElementById('traysDetailPanel').classList.add('hidden');
    renderDashboard(currentFrom, currentTo);
  }

  document.getElementById('kgDetailCard').addEventListener('click', toggleKgDetail);
  document.getElementById('kgDetailCard').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleKgDetail();
    }
  });
  document.getElementById('closeTraysDetail').addEventListener('click', () => {
    traysDetailOpen = false;
    kgDetailOpen = false;
    pieMode = 'cliente';
    document.getElementById('pieSwitch').checked = false;
    UI.updatePieLabels('cliente');
    document.getElementById('traysDetailPanel').classList.add('hidden');
    renderDashboard(currentFrom, currentTo);
  });

  ['cancellationModeCard', 'salesModeCard'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        document.getElementById(id).click();
      }
    });
  });

  document.getElementById('newFileBtn').addEventListener('click', syncContaAzulAndRefresh);

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
