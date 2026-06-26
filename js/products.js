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

async function addProduct(name, sector, unit, minStock, price) {
    const id = generateId();
    const now = new Date().toISOString();
    const priceVal = price ? parseFloat(price) : null;

    try {
        await apiAddProduct({
            id,
            name: name.trim(),
            sector,
            unit,
            min_stock: parseFloat(minStock) || 0,
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

async function updateProduct(id, name, sector, unit, minStock, price) {
    const now = new Date().toISOString();
    const priceVal = price ? parseFloat(price) : null;

    try {
        await apiUpdateProduct(id, {
            name: name.trim(),
            sector,
            unit,
            min_stock: parseFloat(minStock) || 0,
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
    document.getElementById('edit-price').value = product.price || '';
    document.getElementById('edit-modal').classList.remove('hidden');
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
                            <th>Stock Mínimo</th>
                            <th>Estado</th>
                            <th>A reponer</th>
                        </tr></thead>
                        <tbody>`;

        bySector[sector].forEach(product => {
            const stock = parseFloat(product.lastStock);
            const min = parseFloat(product.minStock);
            const status = getStockStatus(stock, min);
            const aReponer = Math.max(0, min - stock).toFixed(2);
            const unit = getUnitLabel(product.unit);

            html += `<tr>
                <td><strong>${escapeHtml(product.name)}</strong></td>
                <td>${stock.toFixed(2)} ${unit}</td>
                <td>${min.toFixed(2)} ${unit}</td>
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
                <td>${lastStockDisplay}</td>
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