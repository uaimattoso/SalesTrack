/**
 * charts.js — Gerenciamento dos graficos Chart.js
 */

const Charts = (() => {

  const COLORS = [
    '#fcb900', '#4b8ef1', '#00e5a0', '#a78bfa',
    '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#06b6d4',
  ];

  let dailyChartInstance = null;
  let pieChartInstance   = null;
  let comparisonChartInstance = null;

  const tooltipDefaults = {
    backgroundColor: '#1a1d27',
    borderColor: '#2a2d3e',
    borderWidth: 1,
    titleColor: '#e8eaf0',
    bodyColor: '#8b8fa8',
    padding: 12,
  };

  function fmtBRL(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  }

  function fmtQuantity(val, unit) {
    const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(val || 0);
    return `${formatted} ${unit === 'kg' ? 'kg' : 'bandejas'}`;
  }

  function destroyAll() {
    if (dailyChartInstance) { dailyChartInstance.destroy(); dailyChartInstance = null; }
    if (pieChartInstance)   { pieChartInstance.destroy();   pieChartInstance   = null; }
    if (comparisonChartInstance) { comparisonChartInstance.destroy(); comparisonChartInstance = null; }
  }

  /**
   * Grafico de fluxo de vendas diarias (linha com area)
   * @param {Array} dailyAgg — array de { dateKey, label, total }
   */
  function renderDailyFlow(dailyAgg) {
    if (dailyChartInstance) { dailyChartInstance.destroy(); dailyChartInstance = null; }

    const labels = dailyAgg.map(d => d.label);
    const values = dailyAgg.map(d => d.total);

    // Acumulado para linha secundaria
    let acc = 0;
    const accumulated = values.map(v => { acc += v; return acc; });

    const ctx = document.getElementById('barChart').getContext('2d');

    // Gradiente de preenchimento da area
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0,   'rgba(252,185,0,0.30)');
    gradient.addColorStop(1,   'rgba(252,185,0,0.00)');

    const gradientAcc = ctx.createLinearGradient(0, 0, 0, 300);
    gradientAcc.addColorStop(0, 'rgba(75,142,241,0.20)');
    gradientAcc.addColorStop(1, 'rgba(75,142,241,0.00)');

    dailyChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Vendas do Dia',
            data: values,
            borderColor: '#fcb900',
            backgroundColor: gradient,
            borderWidth: 2.5,
            pointRadius: dailyAgg.length <= 15 ? 5 : 3,
            pointHoverRadius: 7,
            pointBackgroundColor: '#fcb900',
            pointBorderColor: '#1a1d27',
            pointBorderWidth: 2,
            fill: true,
            tension: 0.35,
            yAxisID: 'y',
          },
          {
            label: 'Acumulado',
            data: accumulated,
            borderColor: '#4b8ef1',
            backgroundColor: gradientAcc,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: '#4b8ef1',
            fill: true,
            tension: 0.35,
            borderDash: [6, 3],
            yAxisID: 'y2',
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: '#8b8fa8',
              font: { family: 'Inter', size: 12 },
              boxWidth: 12,
              padding: 16,
            },
          },
          tooltip: {
            ...tooltipDefaults,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)}`,
            }
          },
        },
        scales: {
          x: {
            grid: { color: '#2a2d3e', drawBorder: false },
            ticks: {
              color: '#8b8fa8',
              font: { family: 'Inter', size: 11 },
              maxTicksLimit: 16,
              maxRotation: 45,
            },
          },
          y: {
            position: 'left',
            grid: { color: '#2a2d3e', drawBorder: false },
            ticks: {
              color: '#fcb900',
              font: { family: 'Inter', size: 11 },
              callback: v => 'R$' + new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v),
            },
            title: {
              display: true,
              text: 'Vendas do Dia',
              color: '#fcb900',
              font: { size: 11, family: 'Inter' },
            },
          },
          y2: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#4b8ef1',
              font: { family: 'Inter', size: 11 },
              callback: v => 'R$' + new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(v),
            },
            title: {
              display: true,
              text: 'Acumulado',
              color: '#4b8ef1',
              font: { size: 11, family: 'Inter' },
            },
          },
        }
      }
    });
  }

  /**
   * Grafico de pizza/donut de participacao por vendedor
   */
  function renderPie(ranking, valueMode = 'currency') {
    if (pieChartInstance) { pieChartInstance.destroy(); pieChartInstance = null; }

    const labels = ranking.map(r => r.name);
    const values = ranking.map(r => r.valor);
    const colors = ranking.map((_, i) => COLORS[i % COLORS.length]);

    const ctx = document.getElementById('pieChart').getContext('2d');

    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: '#1a1d27',
          borderWidth: 3,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#8b8fa8',
              font: { family: 'Inter', size: 12 },
              boxWidth: 12,
              padding: 14,
              generateLabels: function(chart) {
                const labels = chart.data.labels || [];
                const values = chart.data.datasets[0]?.data || [];
                const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
                const meta = chart.getDatasetMeta(0);

                return labels.map((label, index) => {
                  const value = Number(values[index] || 0);
                  const percentage = total > 0 ? value / total * 100 : 0;
                  const style = meta.controller.getStyle(index);
                  const detailedLabel = valueMode === 'currency'
                    ? `${label} — ${fmtBRL(value)} (${percentage.toFixed(1).replace('.', ',')}%)`
                    : `${label} — ${fmtQuantity(value, valueMode)} (${percentage.toFixed(1).replace('.', ',')}%)`;

                  return {
                    text: detailedLabel,
                    fillStyle: style.backgroundColor,
                    strokeStyle: style.borderColor,
                    fontColor: '#8b8fa8',
                    lineWidth: style.borderWidth,
                    hidden: !chart.getDataVisibility(index),
                    index,
                  };
                });
              },
            },
          },
          tooltip: {
            ...tooltipDefaults,
            callbacks: {
              label: function(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                const value = valueMode === 'currency'
                  ? fmtBRL(ctx.parsed)
                  : fmtQuantity(ctx.parsed, valueMode);
                return ` ${value} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  function renderPeriodComparison(currentSeries, previousSeries, previousLabel) {
    if (comparisonChartInstance) {
      comparisonChartInstance.destroy();
      comparisonChartInstance = null;
    }

    const length = Math.max(currentSeries.values.length, previousSeries.values.length);
    const labels = Array.from({ length }, (_, index) => `Dia ${index + 1}`);
    const currentValues = [...currentSeries.values, ...Array(Math.max(0, length - currentSeries.values.length)).fill(null)];
    const previousValues = [...previousSeries.values, ...Array(Math.max(0, length - previousSeries.values.length)).fill(null)];
    const ctx = document.getElementById('comparisonChart').getContext('2d');

    comparisonChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Período aplicado',
            data: currentValues,
            borderColor: '#fcb900',
            backgroundColor: 'rgba(252,185,0,0.78)',
            borderWidth: 1,
            borderRadius: 3,
            maxBarThickness: 22,
          },
          {
            label: previousLabel,
            data: previousValues,
            borderColor: '#4b8ef1',
            backgroundColor: 'rgba(75,142,241,0.68)',
            borderWidth: 1,
            borderRadius: 3,
            maxBarThickness: 22,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: 1,
        animation: false,
        resizeDelay: 150,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#8b8fa8', font: { family: 'Inter', size: 11 }, boxWidth: 12, padding: 14 },
          },
          tooltip: {
            ...tooltipDefaults,
            callbacks: {
              title: items => {
                const index = items[0]?.dataIndex || 0;
                const currentDate = currentSeries.labels[index] || '-';
                const previousDate = previousSeries.labels[index] || '-';
                return `Atual: ${currentDate} · Anterior: ${previousDate}`;
              },
              label: context => ` ${context.dataset.label}: ${fmtBRL(context.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: '#2a2d3e', drawBorder: false },
            ticks: { color: '#8b8fa8', font: { family: 'Inter', size: 10 }, maxTicksLimit: 10 },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#2a2d3e', drawBorder: false },
            ticks: {
              color: '#8b8fa8',
              font: { family: 'Inter', size: 10 },
              callback: value => 'R$' + new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value),
            },
          },
        },
      },
    });
  }

  return { renderDailyFlow, renderPie, renderPeriodComparison, destroyAll };
})();
