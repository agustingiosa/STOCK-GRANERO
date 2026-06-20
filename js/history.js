// ============================================
// history.js - Historial de cargas diarias (via API)
// ============================================

let stockHistory = [];

async function loadAllHistory() {
    try {
        stockHistory = await apiGetHistory();
        stockHistory = stockHistory.map(h => ({
            id: h.id,
            productId: h.product_id,
            productName: h.product_name,
            sector: h.sector,
            unit: h.unit,
            stock: h.stock,
            date: h.date
        }));
    } catch (e) {
        console.error('Error al cargar historial:', e);
        stockHistory = [];
    }
}

function getLastStockForProduct(productId) {
    const todayKey = getTodayKey();
    for (const h of stockHistory) {
        if (h.productId === productId && h.date !== todayKey) return h;
    }
    return null;
}

function getTodayHistory() {
    return stockHistory.filter(h => h.date === getTodayKey());
}

async function populateHistoryProductFilter() {
    const filter = document.getElementById('history-product-filter');
    if (!filter) return;
    const currentValue = filter.value;
    filter.innerHTML = '<option value="todos">Todos los productos</option>';
    products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        filter.appendChild(opt);
    });
    filter.value = currentValue;
}

async function saveDailyStock() {
    const todayKey = getTodayKey();

    const container = document.getElementById('daily-sectors-container');
    const rows = container ? container.querySelectorAll('tr[data-product-id]') : [];
    console.log('saveDailyStock: rows encontradas:', rows.length);

    if (rows.length === 0) {
        alert('No hay productos en la tabla de carga diaria. Primero agregá productos en la pestaña "Productos".');
        return;
    }

    const entries = [];
    let inputsFound = 0;

    rows.forEach(row => {
        const productId = row.dataset.productId;

        const input = row.querySelector('.daily-stock-input');
        if (!input) return;

        inputsFound++;
        const val = input.value.trim();
        console.log('saveDailyStock: productId:', productId, 'valor:', `"${val}"`);

        if (val === '') return;

        const stock = parseFloat(val);
        if (isNaN(stock)) return;

        const product = products.find(p => p.id === productId);
        if (!product) return;

        entries.push({
            id: generateId(),
            product_id: productId,
            product_name: product.name,
            sector: product.sector,
            unit: product.unit,
            stock: stock,
            created_at: new Date().toISOString()
        });
    });

    console.log('saveDailyStock: inputsFound:', inputsFound, 'entries:', entries.length);

    if (entries.length === 0) {
        if (inputsFound === 0) {
            alert('No se encontraron los campos de "Stock Hoy". Probá recargar la página.');
        } else {
            alert('No ingresaste stock para ningún producto.\n\nEscribí un número en la columna "Stock Hoy" y después presioná "Guardar carga del día".');
        }
        return;
    }

    try {
        const result = await apiSaveDailyStock(todayKey, entries);
        console.log('saveDailyStock: resultado:', result);

        await loadProducts();
        await loadAllHistory();
        renderProducts();
        renderDailyStock();
        renderHistory();

        alert(`✅ Se guardó el stock de ${result.count} producto(s) para el día de hoy.`);
    } catch (e) {
        console.error('Error al guardar stock diario:', e);
        alert('Error al guardar el stock. Asegurate de que el servidor esté corriendo en http://localhost:3000');
    }
}

async function clearHistory() {
    if (!confirm('¿Estás seguro de eliminar TODO el historial de cargas? Esta acción no se puede deshacer.')) return;
    try {
        await apiClearHistory();
        await loadProducts();
        await loadAllHistory();
        renderProducts();
        renderDailyStock();
        renderHistory();
        alert('Historial eliminado.');
    } catch (e) {
        console.error('Error al limpiar historial:', e);
        alert('Error al limpiar el historial.');
    }
}

const collapsedSectors = new Set();

function renderDailyStock() {
    const container = document.getElementById('daily-sectors-container');
    const empty = document.getElementById('daily-empty-state');

    if (!container) return;

    if (products.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    const searchTerm = (document.getElementById('daily-search')?.value || '').toLowerCase().trim();
    const todayHistory = getTodayHistory();

    const bySector = {};
    products.forEach(product => {
        if (searchTerm && !product.name.toLowerCase().includes(searchTerm)) return;
        if (!bySector[product.sector]) bySector[product.sector] = [];
        bySector[product.sector].push(product);
    });

    const sectorKeys = Object.keys(bySector);

    if (sectorKeys.length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align:center;padding:24px;">No se encontraron productos.</p>';
        return;
    }

    let html = '';
    sectorKeys.forEach(sector => {
        const label = getSectorLabel(sector);
        const isCollapsed = collapsedSectors.has(sector);
        html += `<div class="daily-sector-group${isCollapsed ? ' collapsed' : ''}" data-sector="${sector}">
            <div class="daily-sector-header">
                <span>${label}</span>
                <span class="daily-sector-arrow">${isCollapsed ? '▶' : '▼'}</span>
            </div>
            <div class="daily-sector-body">
                <div class="table-wrapper">
                    <table>
                        <thead><tr>
                            <th>Producto</th>
                            <th>Unidad</th>
                            <th>Stock Mínimo</th>
                            <th>Stock Anterior</th>
                            <th>Stock Hoy</th>
                        </tr></thead>
                        <tbody>`;

        bySector[sector].forEach(product => {
            const todayEntry = todayHistory.find(h => h.productId === product.id);
            const lastEntry = getLastStockForProduct(product.id);
            const previousStock = lastEntry ? lastEntry.stock : null;

            html += `<tr data-product-id="${product.id}">
                <td><strong>${escapeHtml(product.name)}</strong></td>
                <td>${getUnitLabel(product.unit)}</td>
                <td>${parseFloat(product.minStock).toFixed(2)}</td>
                <td>${previousStock !== null ? parseFloat(previousStock).toFixed(2) : '-'}</td>
                <td><input type="number" class="daily-stock-input" min="0" step="0.01"
                           placeholder="Stock hoy..."
                           value="${todayEntry ? todayEntry.stock : ''}"></td>
            </tr>`;
        });

        html += `</tbody></table></div></div></div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.daily-sector-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.daily-sector-group');
            const sector = group.dataset.sector;
            const arrow = header.querySelector('.daily-sector-arrow');
            if (group.classList.toggle('collapsed')) {
                collapsedSectors.add(sector);
                arrow.textContent = '▶';
            } else {
                collapsedSectors.delete(sector);
                arrow.textContent = '▼';
            }
        });
    });
}

let stockChart = null;

function getHistoryDateRange() {
    let fromVal = document.getElementById('history-date-from').value;
    let toVal = document.getElementById('history-date-to').value;

    // Si no hay fechas seleccionadas, usar el último mes por defecto
    if (!fromVal && !toVal) {
        const today = new Date();
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(today.getMonth() - 1);
        fromVal = oneMonthAgo.toISOString().split('T')[0];
        toVal = today.toISOString().split('T')[0];
    }

    return { fromVal, toVal };
}

function renderHistoryChart(filtered) {
    const canvas = document.getElementById('stock-chart');
    const container = document.getElementById('chart-container');
    if (!canvas || !container) return;

    // Destruir gráfico anterior si existe
    if (stockChart) {
        stockChart.destroy();
        stockChart = null;
    }

    if (filtered.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Agrupar por producto y fecha
    const productData = {};
    const dateSet = new Set();

    filtered.forEach(entry => {
        if (!productData[entry.productId]) {
            productData[entry.productId] = {
                name: entry.productName,
                data: {}
            };
        }
        productData[entry.productId].data[entry.date] = entry.stock;
        dateSet.add(entry.date);
    });

    // Ordenar fechas
    const sortedDates = Array.from(dateSet).sort();
    const labels = sortedDates.map(d => formatDate(d));

    // Colores para las líneas
    const colors = [
        '#4a90d9', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#e67e22', '#3498db', '#e91e63', '#00bcd4'
    ];

    // Crear datasets (una línea por producto)
    const datasets = Object.keys(productData).map((productId, index) => {
        const product = productData[productId];
        const data = sortedDates.map(date => {
            return product.data[date] !== undefined ? product.data[date] : null;
        });

        return {
            label: product.name,
            data: data,
            borderColor: colors[index % colors.length],
            backgroundColor: colors[index % colors.length] + '20',
            tension: 0.3,
            fill: false,
            pointRadius: 4,
            pointHoverRadius: 6,
            spanGaps: true
        };
    });

    const ctx = canvas.getContext('2d');
    stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#a0a0b8',
                        font: { size: 11 },
                        boxWidth: 15,
                        padding: 10
                    }
                },
                tooltip: {
                    backgroundColor: '#16213e',
                    titleColor: '#ffffff',
                    bodyColor: '#e0e0e0',
                    borderColor: '#2a2a4a',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y !== null ? context.parsed.y.toFixed(2) : 'Sin datos'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#a0a0b8',
                        font: { size: 10 },
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: {
                        color: 'rgba(42, 42, 74, 0.5)'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#a0a0b8',
                        font: { size: 10 }
                    },
                    grid: {
                        color: 'rgba(42, 42, 74, 0.5)'
                    }
                }
            }
        }
    });
}

function renderHistory() {
    const tbody = document.getElementById('history-body');
    const wrapper = document.querySelector('#tab-history .table-wrapper');
    const empty = document.getElementById('history-empty-state');

    if (!tbody) return;

    // Obtener rango de fechas (default: último mes)
    const { fromVal, toVal } = getHistoryDateRange();

    let filtered = [...stockHistory];

    if (fromVal) filtered = filtered.filter(h => h.date >= fromVal);
    if (toVal) filtered = filtered.filter(h => h.date <= toVal);

    const prodVal = document.getElementById('history-product-filter').value;
    if (prodVal !== 'todos') filtered = filtered.filter(h => h.productId === prodVal);

    // Renderizar gráfico
    renderHistoryChart(filtered);

    // Renderizar tabla
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        wrapper.style.display = 'none';
        empty.style.display = 'block';
        return;
    }

    wrapper.style.display = 'block';
    empty.style.display = 'none';

    let html = '';
    filtered.forEach(entry => {
        html += `
            <tr>
                <td>${formatDate(entry.date)}</td>
                <td>${escapeHtml(entry.productName)}</td>
                <td>${getSectorLabel(entry.sector)}</td>
                <td>${parseFloat(entry.stock).toFixed(2)}</td>
                <td>${getUnitLabel(entry.unit)}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}
