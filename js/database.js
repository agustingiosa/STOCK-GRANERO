// ============================================
// database.js - API REST para SQLite local
// ============================================

const API_BASE = '/api';

// ============================================
// Productos
// ============================================

async function apiGetProducts() {
    const res = await fetch(`${API_BASE}/products`);
    if (!res.ok) throw new Error('Error al obtener productos');
    return res.json();
}

async function apiAddProduct(product) {
    const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
    });
    if (!res.ok) throw new Error('Error al agregar producto');
    return res.json();
}

async function apiUpdateProduct(id, data) {
    const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Error al actualizar producto');
    return res.json();
}

async function apiDeleteProduct(id) {
    const res = await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar producto');
    return res.json();
}

// ============================================
// Sectores personalizados
// ============================================

async function apiGetSectors() {
    const res = await fetch(`${API_BASE}/sectors`);
    if (!res.ok) throw new Error('Error al obtener sectores');
    return res.json();
}

async function apiAddSector(sector) {
    const res = await fetch(`${API_BASE}/sectors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sector)
    });
    if (!res.ok) throw new Error('Error al agregar sector');
    return res.json();
}

async function apiDeleteSector(id) {
    const res = await fetch(`${API_BASE}/sectors/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar sector');
    return res.json();
}

// ============================================
// Historial de stock
// ============================================

async function apiGetHistory() {
    const res = await fetch(`${API_BASE}/history`);
    if (!res.ok) throw new Error('Error al obtener historial');
    return res.json();
}

async function apiSaveDailyStock(date, entries) {
    const res = await fetch(`${API_BASE}/history/daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, entries })
    });
    if (!res.ok) throw new Error('Error al guardar stock diario');
    return res.json();
}

async function apiClearHistory() {
    const res = await fetch(`${API_BASE}/history`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al limpiar historial');
    return res.json();
}