// ============================================
// utils.js - Utilidades compartidas
// ============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function getUnitLabel(value) {
    const labels = {
        'kg': 'kg', 'g': 'g', 'l': 'l', 'ml': 'ml',
        'un': 'un', 'paq': 'paq', 'latas': 'latas',
        'botellas': 'botellas', 'porciones': 'porciones',
        'planchas': 'planchas'
    };
    return labels[value] || value;
}

function getStockStatus(stock, minStock) {
    if (stock === null || stock === undefined) return { class: 'status-muted', label: 'Sin datos' };
    if (stock === 0) return { class: 'status-critical', label: 'Sin stock' };
    if (stock <= minStock * 0.5) return { class: 'status-critical', label: 'Crítico' };
    if (stock <= minStock) return { class: 'status-low', label: 'Bajo' };
    if (stock <= minStock * 3) return { class: 'status-ok', label: 'Normal' };
    return { class: 'status-overstock', label: 'Excedente' };
}

function getStockColorClass(stock, minStock) {
    if (isNaN(stock) || minStock === 0) return '';
    if (stock <= minStock) return 'stock-critical';
    if (stock <= minStock * 1.5) return 'stock-warning';
    return 'stock-ok';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setDailyDate(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const today = new Date();
    const formatted = today.toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    el.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}