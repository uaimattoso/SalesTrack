/**
 * ui.js — Atualizacao dinamica da interface
 */

const UI = (() => {

  const fmt = val => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  const fmtQty = (val, minDigits = 0) => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: 2,
  }).format(val || 0);
  const pct = val => (val || 0).toFixed(1) + '%';

  const MEDALS = ['gold', 'silver', 'bronze'];
  const MEDAL_EMOJI = ['', '', ''];

  function updateVariation(elementId, current, previous, label, inverse = false) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.classList.remove('growth', 'decline', 'neutral');

    if (!previous) {
      if (current > 0) {
        element.classList.add(inverse ? 'decline' : 'growth');
        element.innerHTML = `<span class="variation-icon">${inverse ? '⚠' : '🚀'}</span>Novo resultado vs ${label}`;
      } else {
        element.classList.add('neutral');
        element.innerHTML = `<span class="variation-icon">•</span>Sem movimento vs ${label}`;
      }
      return;
    }

    const percentage = (current - previous) / previous * 100;
    const isOperationalGrowth = percentage > 0;
    const isPositive = inverse ? percentage < 0 : percentage > 0;
    const isNeutral = Math.abs(percentage) < 0.05;

    element.classList.add(isNeutral ? 'neutral' : (isPositive ? 'growth' : 'decline'));
    const icon = isNeutral ? '•' : (isPositive ? '🚀' : (isOperationalGrowth ? '▲' : '▼'));
    const signal = percentage > 0 ? '+' : '';
    element.innerHTML = `<span class="variation-icon">${icon}</span>${signal}${percentage.toFixed(1).replace('.', ',')}% vs ${label}`;
  }

  function summaryVariation(current, previous, label) {
    if (!previous) {
      if (current > 0) return `<span class="summary-variation growth" title="Novo resultado vs ${label}">🚀 Novo</span>`;
      return `<span class="summary-variation neutral" title="Sem movimento vs ${label}">• 0,0%</span>`;
    }

    const percentage = (current - previous) / previous * 100;
    const isNeutral = Math.abs(percentage) < 0.05;
    const cssClass = isNeutral ? 'neutral' : (percentage > 0 ? 'growth' : 'decline');
    const icon = isNeutral ? '•' : (percentage > 0 ? '🚀' : '▼');
    const signal = percentage > 0 ? '+' : '';
    return `<span class="summary-variation ${cssClass}" title="Comparado com ${label}">${icon} ${signal}${percentage.toFixed(1).replace('.', ',')}%</span>`;
  }

  function updateKPIs(agg, comparison) {
    const cancellationMode = agg.dashboardMode === 'cancelamentos';
    const previousAgg = comparison?.previousAgg;
    document.getElementById('kpi-total-bruto').textContent   = fmt(agg.totalBruto);
    document.getElementById('kpi-total-label').textContent   =
      `${cancellationMode ? 'Cancelamentos' : 'Vendas'} do Período (${agg.totalVendas})`;
    document.getElementById('kpi-toneladas').textContent     = fmtQty(agg.totalKg / 1000, 2) + ' t';
    document.getElementById('kpi-bandejas').textContent      = fmtQty(agg.totalBandejas);
    document.getElementById('kpi-kg').textContent            =
      `${fmtQty(agg.totalBandejasShiitake)} bdj · ${fmtQty(agg.totalKgShiitake, 2)} kg`;
    document.getElementById('kpi-kg-composition').textContent =
      `Inteiro: ${fmtQty(agg.totalBandejasShiitakeInteiro)} bdj · ${fmtQty(agg.totalKgShiitakeInteiro, 2)} kg | Fatiado: ${fmtQty(agg.totalBandejasShiitakeFatiado)} bdj · ${fmtQty(agg.totalKgShiitakeFatiado, 2)} kg`;
    document.getElementById('kpi-cancelamentos').textContent = fmt(agg.totalCancelado);
    document.getElementById('kpi-cancel-label').textContent  = `Cancelamentos (${agg.totalCancelamentos})`;
    document.getElementById('kpi-cancel-pct').textContent    = cancellationMode
      ? 'Exibindo cancelamentos · clique para voltar'
      : pct(agg.cancelPct) + ' do valor total · clique para analisar';
    document.getElementById('kpi-bandejas-label').textContent = cancellationMode ? 'Bandejas Canceladas' : 'Bandejas Vendidas';
    document.getElementById('kpi-kg-label').textContent = cancellationMode ? 'Shiitake Cancelado' : 'Shiitake';
    document.getElementById('kpi-toneladas-label').textContent = cancellationMode ? 'Toneladas Canceladas' : 'Venda Total em Toneladas';
    document.getElementById('kpi-top-label').textContent = cancellationMode ? 'Maior Valor Cancelado' : 'Melhor Vendedor';
    document.getElementById('daily-chart-title').textContent = cancellationMode ? 'Fluxo de Cancelamentos Diários' : 'Fluxo de Vendas Diárias';
    document.getElementById('participation-title').textContent = cancellationMode ? 'Participação nos Cancelamentos' : 'Participação';
    document.getElementById('comparison-title').textContent = cancellationMode ? 'Comparativo de Cancelamentos' : 'Comparativo de Vendas';
    document.getElementById('summary-title').textContent = cancellationMode ? 'Resumo dos Cancelamentos' : 'Resumo do Período';
    document.getElementById('cancellationModeCard').classList.toggle('mode-active', cancellationMode);

    if (previousAgg) {
      const label = comparison.label;
      updateVariation('kpi-sales-variation', agg.totalBruto, previousAgg.totalBruto, label);
      updateVariation('kpi-toneladas-comparison', agg.totalKg, previousAgg.totalKg, label);
      updateVariation('kpi-bandejas-variation', agg.totalBandejas, previousAgg.totalBandejas, label);
      updateVariation('kpi-kg-variation', agg.totalKgShiitake, previousAgg.totalKgShiitake, label);
      updateVariation('kpi-cancel-variation', agg.totalCancelado, previousAgg.totalCancelado, label, true);

      const currentTopName = agg.topVendor?.name;
      const currentTopValue = agg.topVendor?.valor || 0;
      const previousTopValue = currentTopName ? (previousAgg.vendorTotals[currentTopName] || 0) : 0;
      updateVariation('kpi-top-variation', currentTopValue, previousTopValue, label);
    }

    // Exibe o periodo no subtitulo do primeiro KPI
    const subTotalEl = document.getElementById('kpi-total-sub');
    if (subTotalEl) {
      subTotalEl.textContent = agg.periodo ? 'Período: ' + agg.periodo : 'Números únicos da coluna C';
    }

    if (agg.topVendor) {
      document.getElementById('kpi-top-name').textContent  = agg.topVendor.name;
      document.getElementById('kpi-top-value').textContent = fmt(agg.topVendor.valor);
      document.getElementById('kpi-top-sales').textContent = `${agg.topVendor.numeroVendas} ${agg.topVendor.numeroVendas === 1 ? 'venda realizada' : 'vendas realizadas'}`;
    } else {
      document.getElementById('kpi-top-name').textContent  = '-';
      document.getElementById('kpi-top-value').textContent = '-';
      document.getElementById('kpi-top-sales').textContent = '0 vendas realizadas';
    }
  }

  function updateChartGranularity(granularity, dashboardMode, valueMode = 'currency') {
    const cancellationMode = dashboardMode === 'cancelamentos';
    const monthly = granularity === 'month';
    const weekly = granularity === 'week';
    const yearly = granularity === 'year';
    const subject = valueMode === 'currency'
      ? (cancellationMode ? 'Cancelamentos' : 'Vendas')
      : (valueMode === 'kg' ? 'Kg Vendidos' : 'Bandejas Vendidas');
    document.getElementById('daily-chart-title').textContent = yearly
      ? `Fluxo de ${subject} Anuais`
      : (monthly ? `Fluxo de ${subject} Mensais` : (weekly ? `Fluxo de ${subject} Semanais` : `Fluxo de ${subject} Diárias`));
    document.getElementById('flow-period-label').textContent = yearly
      ? 'Ano a Ano'
      : (monthly ? 'Mês a Mês' : (weekly ? 'Semana a Semana' : 'Dia a Dia'));
  }

  function updateRanking(agg) {
    const body = document.getElementById('rankingBody');
    body.innerHTML = '';

    const maxValor = agg.ranking.length > 0 ? agg.ranking[0].valor : 1;

    agg.ranking.forEach((item, idx) => {
      const pctValor = agg.faturamento > 0 ? (item.valor / agg.faturamento * 100) : 0;
      const barWidth = maxValor > 0 ? (item.valor / maxValor * 100) : 0;
      const medal = idx < 3 ? MEDAL_EMOJI[idx] + ' ' : '';
      const posLabel = idx < 3
        ? `<span class="rank-pos" style="color: ${['#fcb900','#9ca3af','#cd7f32'][idx]}">${medal}${idx+1}.</span>`
        : `<span class="rank-pos" style="color: var(--text-dim)">${idx+1}.</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${posLabel}</td>
        <td>${item.name}</td>
        <td>${fmt(item.valor)}</td>
        <td>
          <div class="rank-bar-wrap">
            <div class="rank-bar-bg">
              <div class="rank-bar-fill" style="width: ${barWidth}%"></div>
            </div>
            <span class="rank-pct">${pct(pctValor)}</span>
          </div>
        </td>
      `;
      body.appendChild(tr);
    });

    if (agg.ranking.length === 0) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum dado disponivel</td></tr>';
    }
  }

  function updateSummary(parsedData, agg, comparison, valueMode = 'currency', productScope = null) {
    const body = document.getElementById('summaryBody');
    body.innerHTML = '';
    let html = '';

    if (agg.dashboardMode === 'cancelamentos') {
      html += `<tr class="summary-header"><td>Vendedor</td><td>Valor cancelado</td><td>Participação</td></tr>`;
      const total = agg.ranking.reduce((sum, item) => sum + item.valor, 0);
      agg.ranking.forEach(item => {
        const participation = total > 0 ? item.valor / total * 100 : 0;
        html += `<tr><td>${item.name}</td><td class="commission-individual">${fmt(item.valor)}</td><td class="commission-payable">${participation.toFixed(1).replace('.', ',')}%</td></tr>`;
      });
      if (agg.ranking.length === 0) {
        html += `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum cancelamento no período</td></tr>`;
      }
      body.innerHTML = html;
      return;
    }

    if (valueMode === 'bandejas' || valueMode === 'kg') {
      const unitLabel = valueMode === 'kg' ? 'Kg' : 'Bandejas';
      const currentProductStats = (agg.productStats || []).filter(product =>
        productScope !== 'shiitake' || normProductForScope(product.name).includes('shiitake')
      );
      const previousProductStats = (comparison?.previousAgg?.productStats || []).filter(product =>
        productScope !== 'shiitake' || normProductForScope(product.name).includes('shiitake')
      );
      const previousProducts = new Map(
        previousProductStats.map(product => [product.name, product])
      );
      const comparisonLabel = comparison?.label || 'período anterior';
      const totalQuantity = currentProductStats.reduce(
        (sum, product) => sum + (valueMode === 'kg' ? product.kg : product.bandejas), 0
      );
      const previousTotalQuantity = previousProductStats.reduce(
        (sum, product) => sum + (valueMode === 'kg' ? product.kg : product.bandejas), 0
      );
      html += `<tr class="summary-header">
        <td>Produto</td><td>Total de ${unitLabel}</td><td>Participação</td><td>Total Monetário</td><td>Média por ${valueMode === 'kg' ? 'Kg' : 'Bandeja'}</td>
      </tr>`;
      currentProductStats.forEach(product => {
        const quantity = valueMode === 'kg' ? product.kg : product.bandejas;
        const formattedQuantity = valueMode === 'kg'
          ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(quantity)
          : fmtQty(quantity);
        const monetaryAverage = quantity > 0
          ? Math.round((product.valor / quantity + Number.EPSILON) * 100) / 100
          : 0;
        const previousProduct = previousProducts.get(product.name);
        const previousQuantity = previousProduct
          ? (valueMode === 'kg' ? previousProduct.kg : previousProduct.bandejas)
          : 0;
        const previousAverage = previousQuantity > 0
          ? Math.round((previousProduct.valor / previousQuantity + Number.EPSILON) * 100) / 100
          : 0;
        const participation = totalQuantity > 0 ? quantity / totalQuantity * 100 : 0;
        const previousParticipation = previousTotalQuantity > 0
          ? previousQuantity / previousTotalQuantity * 100
          : 0;
        html += `<tr>
          <td>${product.name}</td>
          <td class="sales-total">${formattedQuantity}${summaryVariation(quantity, previousQuantity, comparisonLabel)}</td>
          <td class="sales-count">${participation.toFixed(1).replace('.', ',')}%${summaryVariation(participation, previousParticipation, comparisonLabel)}</td>
          <td class="sales-total">${fmt(product.valor)}${summaryVariation(product.valor, previousProduct?.valor || 0, comparisonLabel)}</td>
          <td class="sales-average">${fmt(monetaryAverage)}${summaryVariation(monetaryAverage, previousAverage, comparisonLabel)}</td>
        </tr>`;
      });
      if (!currentProductStats.length) {
        html += `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">Nenhum produto vendido no período</td></tr>`;
      }
      body.innerHTML = html;
      return;
    }

    // Cabecalho das colunas
    html += `<tr class="summary-header">
              <td>Vendedor</td>
              <td>Número de Vendas</td>
              <td>Total Vendido</td>
              <td>Média por Venda</td>
              <td>Comissão a Pagar</td>
             </tr>`;

    const vendedoresComissao = [
      'Renato Nery',
      'Bruno Laviaguerre',
      'Pedro Laviaguerre',
      'Dai Canzain',
    ];

    const previousAgg = comparison?.previousAgg;
    const comparisonLabel = comparison?.label || 'período anterior';

    vendedoresComissao.forEach(nome => {
      const numeroVendas = agg.vendorSaleCounts[nome] || 0;
      const totalVendido = agg.vendorTotals[nome] || 0;
      const mediaVenda = numeroVendas > 0 ? totalVendido / numeroVendas : 0;
      const numeroVendasAnterior = previousAgg?.vendorSaleCounts[nome] || 0;
      const totalVendidoAnterior = previousAgg?.vendorTotals[nome] || 0;
      const mediaVendaAnterior = numeroVendasAnterior > 0 ? totalVendidoAnterior / numeroVendasAnterior : 0;
      const comissaoAnterior = previousAgg?.comissoesAPagar[nome] || 0;
      const pertenceBP = nome === 'Bruno Laviaguerre' || nome === 'Pedro Laviaguerre';
      const detalheBP = pertenceBP
        ? `<span class="commission-note">BP consolidado: ${fmt(agg.comissaoBPConsolidada)}</span>`
        : '';

      html += `<tr>
                 <td>${nome}</td>
                 <td class="sales-count">${numeroVendas}${summaryVariation(numeroVendas, numeroVendasAnterior, comparisonLabel)}</td>
                 <td class="sales-total">${fmt(totalVendido)}${summaryVariation(totalVendido, totalVendidoAnterior, comparisonLabel)}</td>
                 <td class="sales-average">${fmt(mediaVenda)}${summaryVariation(mediaVenda, mediaVendaAnterior, comparisonLabel)}</td>
                 <td class="commission-payable">${fmt(agg.comissoesAPagar[nome] || 0)}${summaryVariation(agg.comissoesAPagar[nome] || 0, comissaoAnterior, comparisonLabel)}${detalheBP}</td>
               </tr>`;
    });

    body.innerHTML = html;
  }

  function normProductForScope(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function updateSyncStatus(msg, state) {
    const el = document.getElementById('statusConsulta');
    if (!el) return;
    el.textContent = msg;
    
    // Remove all state classes
    el.classList.remove('carregando', 'sucesso', 'erro');
    el.style.background = 'transparent';
    el.style.color = '';
    el.style.borderColor = 'transparent';

    if (state === 'carregando') {
      el.style.background = 'rgba(252,185,0,0.1)';
      el.style.color = '#fcb900';
      el.style.borderColor = 'rgba(252,185,0,0.2)';
    } else if (state === 'sucesso') {
      el.style.background = 'rgba(0,229,160,0.1)';
      el.style.color = '#00e5a0';
      el.style.borderColor = 'rgba(0,229,160,0.2)';
    } else if (state === 'erro') {
      el.style.background = 'rgba(255,83,112,0.1)';
      el.style.color = '#ff5370';
      el.style.borderColor = 'rgba(255,83,112,0.2)';
    }
  }

  function updateFileInfo(parsedData, agg) {
    document.getElementById('totalRows').textContent = agg.filteredRows + ' registros';
  }

  function updateFooter() {
    const now = new Date();
    document.getElementById('footerDate').textContent =
      now.toLocaleDateString('pt-BR') + ' as ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function showDashboard() {
    document.getElementById('dashboard-screen').classList.remove('hidden');
  }

  function setupDateFilter(hasDateColumn) {
    const container = document.getElementById('dateFilterContainer');
    if (hasDateColumn) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }

  /**
   * Preenche os inputs de data (chamado ao carregar arquivo com mes corrente)
   */
  function setDateFilter(from, to) {
    document.getElementById('dateFrom').value = from;
    document.getElementById('dateTo').value   = to;
  }

  /**
   * Mostra ou oculta o switch se existir coluna de Produto
   */
  function setupPieSwitch(hasProduto) {
    const container = document.getElementById('pieSwitchContainer');
    if (container) {
      if (hasProduto) {
        container.classList.remove('hidden');
      } else {
        container.classList.add('hidden');
      }
    }
  }

  /**
   * Atualiza as classes ativas dos labels do switch
   */
  function updatePieLabels(mode) {
    const lblCliente = document.getElementById('pieLabelCliente');
    const lblProduto = document.getElementById('pieLabelProduto');
    if (lblCliente && lblProduto) {
      if (mode === 'produto') {
        lblCliente.classList.remove('active');
        lblProduto.classList.add('active');
        document.getElementById('quantitySwitchContainer')?.classList.remove('hidden');
      } else {
        lblCliente.classList.add('active');
        lblProduto.classList.remove('active');
        document.getElementById('quantitySwitchContainer')?.classList.add('hidden');
      }
    }
  }

  function updateQuantityLabels(mode) {
    const lblBandejas = document.getElementById('quantityLabelBandejas');
    const lblKg = document.getElementById('quantityLabelKg');
    if (!lblBandejas || !lblKg) return;
    lblBandejas.classList.toggle('active', mode === 'bandejas');
    lblKg.classList.toggle('active', mode === 'kg');
  }

  function renderTraysDetail(pivot, periodLabel) {
    const head = document.getElementById('traysDetailHead');
    const body = document.getElementById('traysDetailBody');
    const period = document.getElementById('trays-detail-period');
    if (!head || !body) return;
    period.textContent = periodLabel || 'Período selecionado';

    const headerRow = document.createElement('tr');
    [
      'Número da venda',
      'Data da venda',
      'Cliente',
      ...pivot.columns,
      'Valor líquido da NFe',
      'Média monetária por bandeja',
      'Consolidado',
    ].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    });
    head.replaceChildren(headerRow);
    body.replaceChildren();

    if (!pivot.rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = Math.max(6, pivot.columns.length + 6);
      td.className = 'trays-empty';
      td.textContent = 'Nenhuma bandeja vendida no período selecionado.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    pivot.rows.forEach(sale => {
      const tr = document.createElement('tr');
      const dateText = sale.date ? sale.date.toLocaleDateString('pt-BR') : 'Não informada';
      [sale.numeroVenda, dateText, sale.cliente].forEach(value => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      pivot.columns.forEach(product => {
        const td = document.createElement('td');
        const value = sale.products[product] || 0;
        td.className = value > 0 ? 'trays-quantity' : 'trays-zero';
        td.textContent = value > 0 ? fmtQty(value) : '';
        tr.appendChild(td);
      });
      const average = sale.totalBandejas > 0 ? sale.valorLiquido / sale.totalBandejas : 0;
      [fmt(sale.valorLiquido), fmt(average), fmtQty(sale.totalBandejas)].forEach((value, index) => {
        const td = document.createElement('td');
        td.className = index === 2 ? 'trays-consolidated' : 'trays-monetary';
        td.textContent = value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });

    const totalsRow = document.createElement('tr');
    totalsRow.className = 'trays-total-row';
    ['Total do período', '', ''].forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      totalsRow.appendChild(td);
    });
    pivot.columns.forEach(product => {
      const td = document.createElement('td');
      td.className = 'trays-quantity';
      td.textContent = fmtQty(pivot.totals.products[product] || 0);
      totalsRow.appendChild(td);
    });
    [
      fmt(pivot.totals.valorLiquido),
      fmt(pivot.totals.mediaPorBandeja),
      fmtQty(pivot.totals.totalBandejas),
    ].forEach((value, index) => {
      const td = document.createElement('td');
      td.className = index === 2 ? 'trays-consolidated' : 'trays-monetary';
      td.textContent = value;
      totalsRow.appendChild(td);
    });
    body.appendChild(totalsRow);
  }

  return {
    updateKPIs,
    updateRanking,
    updateSummary,
    updateFileInfo,
    updateFooter,
    updateChartGranularity,
    updateSyncStatus,
    showDashboard,
    setupDateFilter,
    setDateFilter,
    setupPieSwitch,
    updatePieLabels,
    updateQuantityLabels,
    renderTraysDetail,
  };
})();
