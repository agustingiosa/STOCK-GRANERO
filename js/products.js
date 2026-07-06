// ============================================
// products.js - CRUD de productos (via API)
// ============================================

let products = [];

async function loadProducts() {
    try {
        products = await apiGetProducts();
        // Normalizar nombres de campos de snake_case a camelCase
        products = products.map(p => ({
            id: p.id,
            name: p.name,
            sector: p.sector,
            unit: p.unit,
            minStock: p.min_stock,
            recommendedStock: p.recommended_stock ?? p.min_stock,
            price: p.price,
            lastStock: p.last_stock,
            lastStockDate: p.last_stock_date,
            createdAt: p.created_at,
            updatedAt: p.updated_at
        }));
    } catch (e) {
        console.error('Error al cargar productos:', e);
        products = [];
    }
}

async function addProduct(name, sector, unit, minStock, recommendedStock, price) {
    const id = generateId();
    const now = new Date().toISOString();
    const priceVal = price ? parseFloat(price) : null;
    const minVal = parseFloat(minStock) || 0;

    try {
        await apiAddProduct({
            id,
            name: name.trim(),
            sector,
            unit,
            min_stock: minVal,
            recommended_stock: recommendedStock !== '' ? parseFloat(recommendedStock) : minVal,
            price: priceVal,
            created_at: now
        });
        await loadProducts();
        await populateHistoryProductFilter();
        renderProducts();
        renderPedidos();
        renderDailyStock();
        return id;
    } catch (e) {
        console.error('Error al agregar producto:', e);
        alert('Error al guardar el producto.');
        return null;
    }
}

async function updateProduct(id, name, sector, unit, minStock, recommendedStock, price) {
    const now = new Date().toISOString();
    const priceVal = price ? parseFloat(price) : null;
    const minVal = parseFloat(minStock) || 0;

    try {
        await apiUpdateProduct(id, {
            name: name.trim(),
            sector,
            unit,
            min_stock: minVal,
            recommended_stock: recommendedStock !== '' ? parseFloat(recommendedStock) : minVal,
            price: priceVal,
            updated_at: now
        });
        await loadProducts();
        await populateHistoryProductFilter();
        renderProducts();
        renderPedidos();
        renderDailyStock();
        return id;
    } catch (e) {
        console.error('Error al actualizar producto:', e);
        alert('Error al actualizar el producto.');
        return null;
    }
}

async function deleteProduct(id) {
    if (!confirm('¿Estás seguro de eliminar este producto? También se eliminará su historial.')) return;
    try {
        await apiDeleteProduct(id);
        await loadProducts();
        await loadAllHistory();
        await populateHistoryProductFilter();
        renderProducts();
        renderPedidos();
        renderDailyStock();
        renderHistory();

    } catch (e) {
        console.error('Error al eliminar producto:', e);
        alert('Error al eliminar el producto.');
    }
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = product.name;
    document.getElementById('edit-sector').value = product.sector;
    document.getElementById('edit-unit').value = product.unit;
    document.getElementById('edit-min-stock').value = product.minStock;
    document.getElementById('edit-recommended-stock').value = product.recommendedStock;
    document.getElementById('edit-price').value = product.price || '';
    document.getElementById('edit-modal').classList.remove('hidden');
}

// ============================================
// Carga masiva
// ============================================

function buildSectorOptions() {
    const fixed = [
        { value: 'freezer-plancha', label: 'Freezer de Plancha' },
        { value: 'freezer-freidora', label: 'Freezer de Freidora' },
        { value: 'freezer-despacho', label: 'Freezer de Despacho' },
        { value: 'freezer-postres', label: 'Freezer de Postres' },
        { value: 'freezer-produccion', label: 'Freezer de Producción' },
        { value: 'heladera-despacho', label: 'Heladera de Despacho' },
        { value: 'heladera-plancha', label: 'Heladera de Plancha' },
        { value: 'heladera-freidora', label: 'Heladera de Freidora' },
        { value: 'heladera-sector-dulce', label: 'Heladera Sector Dulce' },
    ];
    const custom = customSectors.map(s => ({ value: s.name, label: s.name }));
    return [...fixed, ...custom]
        .map(s => `<option value="${s.value}">${s.label}</option>`)
        .join('');
}

function buildUnitOptions() {
    const units = ['kg','g','l','ml','un','paq','latas','botellas','porciones','planchas','bolsas','cajas'];
    return units.map(u => `<option value="${u}">${u}</option>`).join('');
}

const BULK_INPUT_STYLE = 'width:100%;padding:7px 8px;background:var(--bg-input);border:1.5px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.85rem;';
const BULK_NUM_STYLE = 'width:80px;padding:7px 8px;background:var(--bg-input);border:1.5px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.85rem;';

function createBulkRow() {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="bulk-name" placeholder="Ej: Milanesas" style="${BULK_INPUT_STYLE}"></td>
        <td><select class="bulk-sector" style="${BULK_INPUT_STYLE}">
            <option value="">Seleccionar...</option>${buildSectorOptions()}
        </select></td>
        <td><select class="bulk-unit" style="${BULK_INPUT_STYLE}">
            <option value="">...</option>${buildUnitOptions()}
        </select></td>
        <td><input type="number" class="bulk-min" placeholder="0" min="0" step="0.01" style="${BULK_NUM_STYLE}"></td>
        <td><input type="number" class="bulk-recommended" placeholder="=mín" min="0" step="0.01" style="${BULK_NUM_STYLE}"></td>
        <td><input type="number" class="bulk-stock" placeholder="-" min="0" step="0.01" style="${BULK_NUM_STYLE}"></td>
        <td><button class="bulk-remove btn btn-delete" style="padding:4px 8px;font-size:0.75rem;">✕</button></td>
    `;
    tr.querySelector('.bulk-remove').addEventListener('click', () => tr.remove());
    // Enter en stock actual → nueva fila
    tr.querySelector('.bulk-stock').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('bulk-add-row-btn').click();
            const rows = document.querySelectorAll('#bulk-body tr');
            rows[rows.length - 1]?.querySelector('.bulk-name')?.focus();
        }
    });
    return tr;
}

function openBulkModal() {
    const body = document.getElementById('bulk-body');
    body.innerHTML = '';
    body.appendChild(createBulkRow());
    document.getElementById('bulk-status').textContent = '';
    document.getElementById('bulk-modal').classList.remove('hidden');
    body.querySelector('.bulk-name')?.focus();
}

async function saveBulkProducts() {
    const rows = document.querySelectorAll('#bulk-body tr');
    const status = document.getElementById('bulk-status');
    const toSave = [];

    rows.forEach(row => {
        const name = row.querySelector('.bulk-name').value.trim();
        const sector = row.querySelector('.bulk-sector').value;
        const unit = row.querySelector('.bulk-unit').value;
        const min = row.querySelector('.bulk-min').value;
        const recommended = row.querySelector('.bulk-recommended').value;
        const stock = row.querySelector('.bulk-stock').value;
        if (name && sector && unit && min !== '') toSave.push({ name, sector, unit, min, recommended, stock });
    });

    if (toSave.length === 0) {
        status.textContent = '⚠️ Completá al menos una fila con todos los campos.';
        return;
    }

    status.textContent = `Guardando ${toSave.length} producto(s)...`;
    document.getElementById('bulk-save-btn').disabled = true;

    const now = new Date().toISOString();
    const todayKey = getTodayKey();
    const stockEntries = [];

    for (const p of toSave) {
        const id = generateId();
        await apiAddProduct({
            id,
            name: p.name.trim(),
            sector: p.sector,
            unit: p.unit,
            min_stock: parseFloat(p.min) || 0,
            recommended_stock: p.recommended !== '' ? parseFloat(p.recommended) : parseFloat(p.min) || 0,
            price: null,
            created_at: now
        });
        if (p.stock !== '') {
            stockEntries.push({
                id: generateId(),
                product_id: id,
                product_name: p.name.trim(),
                sector: p.sector,
                unit: p.unit,
                stock: parseFloat(p.stock),
                created_at: now
            });
        }
    }

    if (stockEntries.length > 0) {
        await apiSaveDailyStock(todayKey, stockEntries);
    }

    await loadProducts();
    await loadAllHistory();
    await populateHistoryProductFilter();
    renderProducts();
    renderPedidos();
    renderDailyStock();
    renderHistory();

    document.getElementById('bulk-save-btn').disabled = false;
    status.textContent = `✅ ${toSave.length} producto(s) guardados${stockEntries.length > 0 ? ` con stock de ${stockEntries.length}` : ''}.`;
    setTimeout(() => document.getElementById('bulk-modal').classList.add('hidden'), 1500);
}

const collapsedPedidosSectors = new Set();

function renderPedidos() {
    const container = document.getElementById('pedidos-sectors-container');
    const empty = document.getElementById('pedidos-empty-state');
    const badge = document.getElementById('pedidos-count');

    if (!container) return;

    const needsOrder = products.filter(p =>
        p.lastStock !== null && p.lastStock !== undefined && parseFloat(p.lastStock) <= parseFloat(p.minStock)
    );

    if (badge) badge.textContent = `${needsOrder.length} producto${needsOrder.length !== 1 ? 's' : ''}`;

    if (needsOrder.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    const bySector = {};
    needsOrder.forEach(product => {
        if (!bySector[product.sector]) bySector[product.sector] = [];
        bySector[product.sector].push(product);
    });

    let html = '';
    Object.keys(bySector).forEach(sector => {
        const label = getSectorLabel(sector);
        const isCollapsed = collapsedPedidosSectors.has(sector);
        const count = bySector[sector].length;

        html += `<div class="daily-sector-group${isCollapsed ? ' collapsed' : ''}" data-sector="${sector}">
            <div class="daily-sector-header">
                <span>${label} <span class="badge" style="margin-left:8px;font-size:0.7rem;">${count}</span></span>
                <span class="daily-sector-arrow">${isCollapsed ? '▶' : '▼'}</span>
            </div>
            <div class="daily-sector-body">
                <div class="table-wrapper">
                    <table>
                        <thead><tr>
                            <th>Producto</th>
                            <th>Stock Actual</th>
                            <th>Stock Recomendado</th>
                            <th>Estado</th>
                            <th>A pedir</th>
                        </tr></thead>
                        <tbody>`;

        bySector[sector].forEach(product => {
            const stock = parseFloat(product.lastStock);
            const min = parseFloat(product.minStock);
            const recommended = parseFloat(product.recommendedStock ?? product.minStock);
            const status = getStockStatus(stock, min);
            const aReponer = Math.max(0, recommended - stock).toFixed(2);
            const unit = getUnitLabel(product.unit);

            html += `<tr>
                <td><strong>${escapeHtml(product.name)}</strong></td>
                <td>${stock.toFixed(2)} ${unit}</td>
                <td>${recommended.toFixed(2)} ${unit}</td>
                <td><span class="status-badge ${status.class}">${status.label}</span></td>
                <td><strong>${aReponer} ${unit}</strong></td>
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
                collapsedPedidosSectors.add(sector);
                arrow.textContent = '▶';
            } else {
                collapsedPedidosSectors.delete(sector);
                arrow.textContent = '▼';
            }
        });
    });
}

function renderProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const sectorValue = document.getElementById('sector-filter').value;

    let filtered = products;
    if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));
    if (sectorValue !== 'todos') filtered = filtered.filter(p => p.sector === sectorValue);

    document.getElementById('product-count').textContent =
        `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('inventory-body');
    const wrapper = document.querySelector('#tab-products .table-wrapper');
    const empty = document.getElementById('empty-state');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        wrapper.style.display = 'none';
        empty.style.display = 'block';
        if (products.length === 0) {
            empty.innerHTML = `<p>📦 No hay productos registrados</p><p>Agregá tu primer producto usando el formulario de arriba.</p>`;
        } else {
            empty.innerHTML = `<p>🔍 No se encontraron productos</p><p>Probá con otros términos de búsqueda o filtros.</p>`;
        }
        return;
    }

    wrapper.style.display = 'block';
    empty.style.display = 'none';

    let html = '';
    filtered.forEach(product => {
        const status = getStockStatus(product.lastStock, product.minStock);
        const lastStockDisplay = product.lastStock !== null ? parseFloat(product.lastStock).toFixed(2) : '-';
        const lastDateDisplay = product.lastStockDate ? formatDate(product.lastStockDate) : '-';

        html += `
            <tr>
                <td><strong>${escapeHtml(product.name)}</strong></td>
                <td>${getSectorLabel(product.sector)}</td>
                <td>${getUnitLabel(product.unit)}</td>
                <td>${parseFloat(product.minStock).toFixed(2)}</td>
                <td>${parseFloat(product.recommendedStock ?? product.minStock).toFixed(2)}</td>
                <td class="${product.lastStock !== null ? getStockColorClass(product.lastStock, product.minStock) : ''}">${lastStockDisplay}</td>
                <td>${lastDateDisplay}</td>
                <td><span class="status-badge ${status.class}">${status.label}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editProduct('${product.id}')">✏️</button>
                        <button class="btn btn-delete" onclick="deleteProduct('${product.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}