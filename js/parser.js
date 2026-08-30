/**
 * parser.js — Leitura e normalizacao da planilha XLS/XLSX
 * Mapeamento baseado nas colunas reais:
 *   "Vendedor", "Cliente", "Valor liquido", "Data da venda"
 * Cancelamentos detectados via coluna "Cliente" (contem CANCELAD ou NAO ENTREGUE)
 */

const Parser = (() => {

  // Aliases para deteccao flexivel de colunas (case insensitive, sem acento)
  const COL_ALIASES = {
    vendedor: ['vendedor', 'seller', 'nome vendedor', 'funcionario', 'representante'],
    valor:    ['valor liquido', 'valor líquido', 'vl liquido', 'vlr liquido', 'liquido', 'valor', 'value', 'total', 'amount'],
    cliente:  ['cliente', 'client', 'nome cliente', 'comprador', 'customer'],
    produto:  ['nome do produto', 'produto/servico', 'produto', 'servico', 'nome do servico',
               'nome produto', 'descricao', 'item', 'produto servico', 'nome servico'],
    status:   ['status', 'situacao', 'estado', 'situacao venda'],
    data:     ['data da venda', 'data venda', 'data', 'date', 'data pedido', 'dt venda', 'dt'],
  };

  // Palavras no campo "Cliente" que indicam cancelamento
  const CANCEL_CLIENT_KEYWORDS = ['cancelad', 'nao entregue', 'cancelamento', 'devolvid', 'rejeitad'];

  // Palavras no campo "Status" que indicam cancelamento
  const CANCEL_STATUS_KEYWORDS = ['cancelad', 'nao entregue', 'cancelamento', 'devolvid', 'rejeitad'];

  // Nomes canonicos dos vendedores (mapeados por palavra-chave)
  const KNOWN_VENDORS = {
    'anderson': 'Anderson Simoes',
    'dai':      'Dai Canzain',
    'renato':   'Renato Nery',
    'vitor nery': 'Renato Nery',
    'pedro':    'Pedro Laviaguerre',
    'bruno':    'Bruno Laviaguerre',
  };

  const MESES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  /**
   * Normaliza string: minusculo, sem acento, sem espacos extras
   */
  function norm(str) {
    return String(str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Encontra a coluna real da planilha a partir dos aliases
   * Verifica cada alias contra todos os headers para garantir a prioridade
   */
  function findColumn(headers, aliases) {
    // 1. Busca por match exato
    for (const alias of aliases) {
      for (const h of headers) {
        if (norm(h) === alias) return h;
      }
    }
    // 2. Busca por match parcial (includes)
    for (const alias of aliases) {
      for (const h of headers) {
        if (norm(h).includes(alias)) return h;
      }
    }
    return null;
  }

  /**
   * Converte serial Excel para Date JS
   */
  function excelDateToJS(serial) {
    if (!serial || isNaN(serial)) return null;
    const utc_days  = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }

  /**
   * Tenta parsear a data de uma celula do Excel
   */
  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val)) return val;
    if (typeof val === 'number') return excelDateToJS(val);

    const text = String(val).trim();

    // A planilha usa o padrão brasileiro dd/mm/aaaa. Esta verificação deve
    // ocorrer antes de new Date(), que interpreta 08/01 como 1º de agosto.
    const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
      const day = Number(brMatch[1]);
      const month = Number(brMatch[2]);
      const year = Number(brMatch[3]);
      const date = new Date(year, month - 1, day);

      // Rejeita datas impossíveis, como 31/02/2026.
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return date;
      }
      return null;
    }

    // Mantém suporte a datas ISO (aaaa-mm-dd) e outros formatos inequívocos.
    const d = new Date(text);
    if (!isNaN(d)) return d;
    return null;
  }

  /**
   * Converte valores numericos e moedas brasileiras para Number.
   * Exemplos aceitos: 2325.60, "2.325,60", "R$ 2.325,60".
   */
  function parseCurrency(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

    let text = String(val || '').trim();
    if (!text) return 0;

    const negativeByParentheses = /^\(.*\)$/.test(text);
    text = text
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.');

    const parsed = Number.parseFloat(text);
    if (!Number.isFinite(parsed)) return 0;
    return negativeByParentheses ? -Math.abs(parsed) : parsed;
  }

  /**
   * Converte a data do filtro (aaaa-mm-dd) para meia-noite no fuso local.
   * new Date('aaaa-mm-dd') usa UTC e pode recuar um dia no Brasil.
   */
  function parseFilterDate(value, endOfDay = false) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date;
  }

  /**
   * Formata data como "1/agosto" igual ao print
   */
  function formatarDataPeriodo(date) {
    if (!date) return '';
    return `${date.getDate()}/${MESES[date.getMonth()]}`;
  }

  /**
   * Retorna string do periodo ("01/agosto ate 16/agosto") ou null
   */
  function calcPeriodo(rows) {
    const datas = rows.map(r => r.date).filter(Boolean);
    if (datas.length === 0) return null;
    datas.sort((a, b) => a - b);
    const min = datas[0];
    const max = datas[datas.length - 1];
    if (min.getTime() === max.getTime()) return formatarDataPeriodo(min);
    return `${formatarDataPeriodo(min)} ate ${formatarDataPeriodo(max)}`;
  }

  /**
   * Verifica se uma linha e cancelamento/nao entregue
   * Checa tanto o campo "Cliente" quanto "Status" se existirem
   */
  function isCanceled(cliente, status) {
    const c = norm(cliente);
    const s = norm(status);
    const clienteCancel = CANCEL_CLIENT_KEYWORDS.some(k => c.includes(k));
    const statusCancel  = CANCEL_STATUS_KEYWORDS.some(k => s.includes(k));
    return clienteCancel || statusCancel;
  }

  /**
   * Extrai mapa de nomes reais -> nomes canonicos
   */
  function extractVendors(rows, colVendedor) {
    const allNames = new Set();
    rows.forEach(row => {
      const name = String(row[colVendedor] || '').trim();
      if (name) allNames.add(name);
    });

    const vendorMap = {};
    allNames.forEach(name => {
      const n = norm(name);
      let canonical = null;
      for (const [key, label] of Object.entries(KNOWN_VENDORS)) {
        if (n.includes(key)) { canonical = label; break; }
      }
      vendorMap[name] = canonical || name;
    });

    return vendorMap;
  }

  /**
   * Processa a planilha e retorna dados normalizados
   */
  function process(rawData, fileName) {
    if (!rawData || rawData.length === 0) {
      throw new Error('A planilha esta vazia ou nao contem dados.');
    }

    const headers = Object.keys(rawData[0]);

    // Detecta colunas (prioriza nomes exatos da planilha real)
    const colVendedor = findColumn(headers, COL_ALIASES.vendedor);
    
    // REGRA FIXA: valores financeiros sempre vêm da coluna I
    // (9ª coluna da planilha, índice 8 no JavaScript).
    const colValor = headers[8] || null;

    // REGRA FIXA: identificação da venda vem da coluna C
    // (3ª coluna da planilha, índice 2 no JavaScript).
    const colNumeroVenda = headers[2] || null;

    // A quantidade original e sua unidade vêm exclusivamente das colunas F e G.
    // As quantidades equivalentes em bandejas e kg são calculadas pelo SalesTrack.
    const colQuantidade = headers[5] || null;
    const colUnidade = headers[6] || null;
    
    const colCliente  = findColumn(headers, COL_ALIASES.cliente);
    const colProduto  = findColumn(headers, COL_ALIASES.produto);
    const colStatus   = findColumn(headers, COL_ALIASES.status);
    const colData     = findColumn(headers, COL_ALIASES.data);

    if (!colVendedor) throw new Error('Coluna "Vendedor" nao encontrada na planilha.');
    if (!colNumeroVenda) throw new Error('A planilha nao possui a coluna C (Numero da venda).');
    if (norm(colNumeroVenda) !== 'numero da venda') {
      throw new Error(`A coluna C deve ser "Numero da venda", mas foi encontrada "${colNumeroVenda}".`);
    }
    if (!colQuantidade || norm(colQuantidade) !== 'quantidade de itens') {
      throw new Error('A coluna F deve ser "Quantidade de itens".');
    }
    if (!colUnidade || norm(colUnidade) !== 'unidade de medida') {
      throw new Error('A coluna G deve ser "Unidade de medida".');
    }
    if (!colValor) throw new Error('A planilha nao possui a coluna I (coluna numero 9).');
    if (norm(colValor) !== 'valor liquido') {
      throw new Error(`A coluna I deve ser "Valor liquido", mas foi encontrada "${colValor}".`);
    }

    const vendorMap = extractVendors(rawData, colVendedor);

    const rows = rawData.map(row => {
      const rawVendedor = String(row[colVendedor] || '').trim();
      const rawCliente  = colCliente ? String(row[colCliente] || '').trim() : '';
      const rawProduto  = colProduto ? String(row[colProduto] || '').trim() : '';
      const rawStatus   = colStatus  ? String(row[colStatus]  || '') : '';
      const numeroVenda = String(row[colNumeroVenda] || '').trim();
      const quantidadeOriginal = parseCurrency(row[colQuantidade]);
      const unidadeMedida = norm(row[colUnidade]).toUpperCase();

      // Mesma regra operacional antes aplicada pelo PowerQuery:
      // BANDEJA => mantém F; KILOGRAMA => F / 0,200; demais => mantém F.
      const quantidadeBandejas = unidadeMedida === 'KILOGRAMA'
        ? quantidadeOriginal / 0.2
        : quantidadeOriginal;

      // Cada bandeja exige 205 g para compensar a desidratação do produto.
      const quantidadeKg = quantidadeBandejas * 0.205;

      const valor = parseCurrency(row[colValor]);

      const canceled = isCanceled(rawCliente, rawStatus);
      const date     = colData ? parseDate(row[colData]) : null;

      return {
        vendedor: vendorMap[rawVendedor] || rawVendedor || 'Nao informado',
        rawVendedor,
        cliente:  rawCliente || 'Nao informado',
        produto:  rawProduto || 'Nao informado',
        numeroVenda,
        quantidadeOriginal,
        unidadeMedida,
        quantidadeBandejas,
        quantidadeKg,
        valor,
        canceled,
        date,
      };
    }).filter(r => r.rawVendedor !== '');

    const allVendors = [...new Set(Object.values(vendorMap))].sort();
    const periodo    = calcPeriodo(rows);

    return {
      rows,
      allVendors,
      hasDateColumn:    colData    !== null,
      hasProdutoColumn: colProduto !== null,
      valueColumn:      colValor,
      valueColumnIndex: 9,
      saleNumberColumn: colNumeroVenda,
      saleNumberColumnIndex: 3,
      quantityColumn: colQuantidade,
      quantityColumnIndex: 6,
      unitColumn: colUnidade,
      unitColumnIndex: 7,
      periodo,
      fileName,
      totalRows: rows.length,
    };
  }

  /**
   * Agrega os dados por vendedor (respeitando filtro de data)
   */
  function aggregate(parsedData, dateFrom, dateTo, dashboardMode = 'vendas', productScope = null) {
    let rows = parsedData.rows;

    // Filtro de data (se aplicado via UI)
    if (parsedData.hasDateColumn && dateFrom && dateTo) {
      const from = parseFilterDate(dateFrom);
      const to   = parseFilterDate(dateTo, true);
      rows = rows.filter(r => r.date && r.date >= from && r.date <= to);
    }

    if (productScope === 'shiitake') {
      rows = rows.filter(row => norm(row.produto).includes('shiitake'));
    }

    const periodRows = rows;
    const validRows = periodRows.filter(row => !row.canceled);
    const canceledRows = periodRows.filter(row => row.canceled);
    rows = dashboardMode === 'cancelamentos' ? canceledRows : validRows;

    const vendorTotals = {};
    const vendorTrayTotals = {};
    const vendorKgTotals = {};
    const productStatsMap = {};
    const vendorSaleNumbers = {};
    parsedData.allVendors.forEach(v => {
      vendorTotals[v] = 0;
      vendorTrayTotals[v] = 0;
      vendorKgTotals[v] = 0;
    });

    // Uma venda pode ocupar várias linhas (uma por produto). Por isso a
    // quantidade é calculada pelos números distintos da coluna C.
    const totalVendas = new Set(
      rows.map(row => row.numeroVenda).filter(Boolean)
    ).size;

    const totalCancelamentos = new Set(
      canceledRows.map(row => row.numeroVenda).filter(Boolean)
    ).size;

    let totalBruto     = 0;
    const totalCancelado = canceledRows.reduce((sum, row) => sum + row.valor, 0);
    const totalVendasValidas = validRows.reduce((sum, row) => sum + row.valor, 0);
    let totalBandejas  = 0;
    let totalKg        = 0;
    let totalKgShiitake = 0;
    let totalKgShiitakeInteiro = 0;
    let totalKgShiitakeFatiado = 0;
    let totalBandejasShiitake = 0;
    let totalBandejasShiitakeInteiro = 0;
    let totalBandejasShiitakeFatiado = 0;

    rows.forEach(row => {
      totalBruto += row.valor;
      vendorTotals[row.vendedor] = (vendorTotals[row.vendedor] || 0) + row.valor;
      vendorTrayTotals[row.vendedor] = (vendorTrayTotals[row.vendedor] || 0) + row.quantidadeBandejas;
      vendorKgTotals[row.vendedor] = (vendorKgTotals[row.vendedor] || 0) + row.quantidadeKg;
      if (!vendorSaleNumbers[row.vendedor]) vendorSaleNumbers[row.vendedor] = new Set();
      if (row.numeroVenda) vendorSaleNumbers[row.vendedor].add(row.numeroVenda);
      totalBandejas += row.quantidadeBandejas;
      totalKg += row.quantidadeKg;
      const productName = canonicalProductName(row.produto);
      if (!productStatsMap[productName]) {
        productStatsMap[productName] = { name: productName, bandejas: 0, kg: 0, valor: 0, saleNumbers: new Set() };
      }
      const productStats = productStatsMap[productName];
      productStats.bandejas += row.quantidadeBandejas;
      productStats.kg += row.quantidadeKg;
      productStats.valor += row.valor;
      if (row.numeroVenda) productStats.saleNumbers.add(row.numeroVenda);
      const produtoNormalizado = norm(row.produto);
      if (produtoNormalizado.includes('shiitake')) {
        totalKgShiitake += row.quantidadeKg;
        totalBandejasShiitake += row.quantidadeBandejas;
        if (produtoNormalizado.includes('inteiro')) {
          totalKgShiitakeInteiro += row.quantidadeKg;
          totalBandejasShiitakeInteiro += row.quantidadeBandejas;
        }
        if (produtoNormalizado.includes('fatiado')) {
          totalKgShiitakeFatiado += row.quantidadeKg;
          totalBandejasShiitakeFatiado += row.quantidadeBandejas;
        }
      }
    });

    // Mantido por compatibilidade: no modo principal já representa apenas
    // vendas válidas, sem qualquer subtração posterior de cancelamentos.
    const faturamento = totalBruto;

    const vendorSaleCounts = Object.fromEntries(
      Object.keys(vendorTotals).map(name => [name, vendorSaleNumbers[name]?.size || 0])
    );

    const ranking = Object.entries(vendorTotals)
      .map(([name, valor]) => ({ name, valor, numeroVendas: vendorSaleCounts[name] || 0 }))
      .sort((a, b) => b.valor - a.valor)
      .filter(v => v.valor > 0);

    const productStats = Object.values(productStatsMap)
      .map(item => ({
        name: item.name,
        bandejas: item.bandejas,
        kg: item.kg,
        valor: item.valor,
        numeroVendas: item.saleNumbers.size,
      }))
      .filter(item => item.bandejas > 0 || item.kg > 0 || item.valor > 0)
      .sort((a, b) => b.bandejas - a.bandejas);

    const topVendor = ranking[0] || null;
    const grossWithCanceled = totalVendasValidas + totalCancelado;
    const cancelPct = grossWithCanceled > 0 ? (totalCancelado / grossWithCanceled * 100) : 0;

    // Periodo filtrado (recalcula se houver filtro de data)
    let periodo = parsedData.periodo;
    if (dateFrom && dateTo) {
      if (rows.length > 0) {
        periodo = Parser.calcPeriodo(rows);
      } else {
        const fromDate = parseFilterDate(dateFrom);
        const toDate = parseFilterDate(dateTo);
        periodo = fromDate && toDate
          ? `${formatarDataPeriodo(fromDate)} ate ${formatarDataPeriodo(toDate)}`
          : null;
      }
    }

    // Calculo de Comissoes
    const comissoes = {};
    const commissionEnabled = dashboardMode !== 'cancelamentos';
    const valAnderson = commissionEnabled ? (vendorTotals['Anderson Simoes'] || 0) : 0;
    const valDai      = commissionEnabled ? (vendorTotals['Dai Canzain'] || 0) : 0;
    const valRenato   = commissionEnabled ? (vendorTotals['Renato Nery'] || 0) : 0;
    const valPedro    = commissionEnabled ? (vendorTotals['Pedro Laviaguerre'] || 0) : 0;
    const valBruno    = commissionEnabled ? (vendorTotals['Bruno Laviaguerre'] || 0) : 0;

    comissoes['Anderson Simoes'] = 0; // CEO, sem comissao
    comissoes['Dai Canzain'] = valDai * 0.04;

    const vendasRenatoBP = valRenato + valPedro + valBruno;
    const poolRenatoBP = vendasRenatoBP * 0.04;

    comissoes['Renato Nery'] = poolRenatoBP * 0.75;
    comissoes['Pedro Laviaguerre'] = poolRenatoBP * 0.125;
    comissoes['Bruno Laviaguerre'] = poolRenatoBP * 0.125;

    // A comissão individual só aparece para quem realizou vendas no período.
    // O pagamento da BP, porém, mantém as duas parcelas de 12,5% e é pago
    // de forma consolidada à empresa.
    const comissoesPorVendedor = {
      'Renato Nery': valRenato > 0 ? comissoes['Renato Nery'] : 0,
      'Bruno Laviaguerre': valBruno > 0 ? comissoes['Bruno Laviaguerre'] : 0,
      'Pedro Laviaguerre': valPedro > 0 ? comissoes['Pedro Laviaguerre'] : 0,
      'Dai Canzain': valDai > 0 ? comissoes['Dai Canzain'] : 0,
    };

    const comissoesAPagar = {
      'Renato Nery': comissoes['Renato Nery'],
      'Bruno Laviaguerre': comissoes['Bruno Laviaguerre'],
      'Pedro Laviaguerre': comissoes['Pedro Laviaguerre'],
      'Dai Canzain': comissoes['Dai Canzain'],
    };

    const comissaoBPConsolidada = comissoesAPagar['Bruno Laviaguerre']
      + comissoesAPagar['Pedro Laviaguerre'];

    // Teste de seguranca: Venda total (Faturamento) - Dai - Anderson == BP + Renato
    const remainingForSecurity = faturamento - valDai - valAnderson;
    const diff = Math.abs(remainingForSecurity - vendasRenatoBP);
    const securityCheck = diff < 0.05;

    return {
      totalBruto,
      totalCancelado,
      totalCancelamentos,
      totalBandejas,
      totalKg,
      totalKgShiitake,
      totalKgShiitakeInteiro,
      totalKgShiitakeFatiado,
      totalBandejasShiitake,
      totalBandejasShiitakeInteiro,
      totalBandejasShiitakeFatiado,
      faturamento,
      vendorTotals,
      vendorTrayTotals,
      vendorKgTotals,
      vendorSaleCounts,
      ranking,
      productStats,
      topVendor,
      cancelPct,
      filteredRows: rows.length,
      totalVendas,
      dashboardMode,
      productScope,
      periodo,
      comissoes,
      comissoesPorVendedor,
      comissoesAPagar,
      comissaoBPConsolidada,
      securityCheck
    };
  }

  /**
   * Agrega vendas nao canceladas por dia calendario
   * Retorna array de { dateKey, label, total } ordenado por data
   */
  function aggregateByDay(parsedData, dateFrom, dateTo, dashboardMode = 'vendas', valueMode = 'currency', productScope = null) {
    let rows = parsedData.rows;

    if (parsedData.hasDateColumn && dateFrom && dateTo) {
      const from = parseFilterDate(dateFrom);
      const to   = parseFilterDate(dateTo, true);
      rows = rows.filter(r => r.date && r.date >= from && r.date <= to);
    }

    const map = {};

    rows.forEach(row => {
      if (!row.date || (dashboardMode === 'cancelamentos' ? !row.canceled : row.canceled)) return;
      if (productScope === 'shiitake' && !norm(row.produto).includes('shiitake')) return;
      const d = row.date;
      // Chave no formato yyyy-mm-dd para ordenacao correta
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (!map[key]) {
        map[key] = {
          dateKey: key,
          label: `${d.getDate()}/${MESES[d.getMonth()]}`,
          total: 0,
        };
      }
      map[key].total += valueMode === 'bandejas'
        ? row.quantidadeBandejas
        : (valueMode === 'kg' ? row.quantidadeKg : row.valor);
    });

    return Object.values(map).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }

  /**
   * Agrega vendas nao canceladas por um campo arbitrario da linha
   * @param {string} field — 'cliente' ou 'produto'
   * Retorna array de { name, valor } ordenado por valor desc (mesmo formato do ranking)
   */
  function aggregateByField(parsedData, field, dateFrom, dateTo, dashboardMode = 'vendas') {
    let rows = parsedData.rows;

    if (parsedData.hasDateColumn && dateFrom && dateTo) {
      const from = parseFilterDate(dateFrom);
      const to   = parseFilterDate(dateTo, true);
      rows = rows.filter(r => r.date && r.date >= from && r.date <= to);
    }

    const map = {};
    rows.forEach(row => {
      if (dashboardMode === 'cancelamentos' ? !row.canceled : row.canceled) return;
      const rawKey = row[field] || 'Nao informado';
      const key = field === 'cliente' ? canonicalClientName(rawKey) : rawKey;
      map[key] = (map[key] || 0) + row.valor;
    });

    return Object.entries(map)
      .map(([name, valor]) => ({ name, valor }))
      .filter(v => v.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }

  /**
   * Consolida nomes comerciais em famílias de produto, preservando a divisão
   * entre Shiitake Inteiro e Shiitake Fatiado.
   */
  function canonicalProductName(productName) {
    const original = String(productName || '').trim();
    const product = norm(original);

    if (product.includes('shiitake')) {
      if (product.includes('talo')) return 'Shiitake Talo';
      if (product.includes('fatiado')) return 'Shiitake Fatiado';
      if (product.includes('inteiro')) return 'Shiitake Inteiro';
      return 'Shiitake';
    }
    if (product.includes('shimeji')) {
      if (product.includes('salmao')) return 'Shimeji Salmão';
      if (product.includes('branco')) return 'Shimeji Branco';
      if (product.includes('preto')) return 'Shimeji Preto';
      return 'Shimeji';
    }
    if (product.includes('enoki')) return 'Enoki';
    if (product.includes('eryngui')) return 'Eryngui';

    // Remove apenas referências de peso da embalagem para unir variações
    // como "Produto 200g" e "Produto 1kg" sem perder o nome comercial.
    return original.replace(/\s+\d+(?:[.,]\d+)?\s*(?:g|kg)\b/gi, '').trim() || 'Nao informado';
  }

  /**
   * Consolida filiais de clientes na respectiva matriz para o gráfico de
   * participação. Os nomes originais permanecem preservados nas linhas.
   */
  function canonicalClientName(clientName) {
    const original = String(clientName || '').trim();
    const client = norm(original);

    if (client.includes('super mercado zona sul')) return 'Zona Sul';
    if (client.includes('hortifruti')) return 'Hortifruti';
    if (client.includes('cardin')) return 'Cardin';
    if (client.includes('temakeria e cia')) return 'Temakeria e Cia';
    if (client.includes('domenica')) return 'Domenica';
    if (client.includes('rede ultra')) return 'Rede Ultra';
    if (client.includes('aipo e aipim') || client.includes('aipo & aipim')) return 'Aipo e Aipim';

    return original || 'Nao informado';
  }

  function aggregateProductsByQuantity(parsedData, quantityMode, dateFrom, dateTo, dashboardMode = 'vendas') {
    let rows = parsedData.rows;

    if (parsedData.hasDateColumn && dateFrom && dateTo) {
      const from = parseFilterDate(dateFrom);
      const to = parseFilterDate(dateTo, true);
      rows = rows.filter(r => r.date && r.date >= from && r.date <= to);
    }

    const map = {};
    rows.forEach(row => {
      if (dashboardMode === 'cancelamentos' ? !row.canceled : row.canceled) return;
      const key = canonicalProductName(row.produto);
      const quantity = quantityMode === 'kg' ? row.quantidadeKg : row.quantidadeBandejas;
      map[key] = (map[key] || 0) + quantity;
    });

    return Object.entries(map)
      .map(([name, valor]) => ({ name, valor }))
      .filter(item => item.valor > 0)
      .sort((a, b) => b.valor - a.valor);
  }

  function buildSalesProductPivot(parsedData, dateFrom, dateTo, dashboardMode = 'vendas') {
    let rows = parsedData.rows;
    if (parsedData.hasDateColumn && dateFrom && dateTo) {
      const from = parseFilterDate(dateFrom);
      const to = parseFilterDate(dateTo, true);
      rows = rows.filter(row => row.date && row.date >= from && row.date <= to);
    }

    const sales = new Map();
    const productTotals = new Map();
    rows.forEach(row => {
      if (dashboardMode === 'cancelamentos' ? !row.canceled : row.canceled) return;
      const product = canonicalProductName(row.produto);
      const quantity = Number(row.quantidadeBandejas) || 0;
      if (quantity <= 0) return;

      const dateKey = row.date
        ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
        : '';
      const saleKey = `${row.numeroVenda || 'sem-numero'}|${dateKey}|${row.cliente}`;
      if (!sales.has(saleKey)) {
        sales.set(saleKey, {
          numeroVenda: row.numeroVenda || 'Não informado',
          date: row.date,
          cliente: row.cliente,
          products: {},
          valorLiquido: 0,
          totalBandejas: 0,
        });
      }
      const sale = sales.get(saleKey);
      sale.products[product] = (sale.products[product] || 0) + quantity;
      sale.valorLiquido += Number(row.valor) || 0;
      sale.totalBandejas += quantity;
      productTotals.set(product, (productTotals.get(product) || 0) + quantity);
    });

    const columns = [...productTotals.entries()]
      .filter(([, total]) => total > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    const pivotRows = [...sales.values()].sort((a, b) =>
      String(a.numeroVenda).localeCompare(String(b.numeroVenda), 'pt-BR', { numeric: true })
    );

    const totalValorLiquido = pivotRows.reduce((sum, sale) => sum + sale.valorLiquido, 0);
    const totalBandejas = pivotRows.reduce((sum, sale) => sum + sale.totalBandejas, 0);
    const productPeriodTotals = Object.fromEntries(
      columns.map(product => [product, productTotals.get(product) || 0])
    );

    return {
      columns,
      rows: pivotRows,
      totals: {
        products: productPeriodTotals,
        valorLiquido: totalValorLiquido,
        totalBandejas,
        mediaPorBandeja: totalBandejas > 0 ? totalValorLiquido / totalBandejas : 0,
      },
    };
  }

  return { process, aggregate, aggregateByDay, aggregateByField, aggregateProductsByQuantity, buildSalesProductPivot, norm, calcPeriodo };
})();
