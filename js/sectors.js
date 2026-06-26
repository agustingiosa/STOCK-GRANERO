// ============================================
// sectors.js - Gestión de sectores personalizados (via API)
// ============================================

const SECTOR_LABELS = {
    'freezer-plancha': '🧊 Freezer de Plancha',
    'freezer-freidora': '🧊 Freezer de Freidora',
    'freezer-despacho': '🧊 Freezer de Despacho',
    'freezer-postres': '🧊 Freezer de Postres',
    'freezer-produccion': '🧊 Freezer de Producción',
    'heladera-despacho': '🧊 Heladera de Despacho',
    'heladera-plancha': '🧊 Heladera de Plancha',
    'heladera-freidora': '🧊 Heladera de Freidora',
    'heladera-sector-dulce': '🧊 Heladera de Sector Dulce'
};

let customSectors = [];

async function loadCustomSectors() {
    try {
        customSectors = await apiGetSectors();
    } catch (e) {
        console.error('Error al cargar sectores:', e);
        customSectors = [];
    }
}

async function addCustomSector(name, type) {
    const id = generateId();
    const now = new Date().toISOString();
    try {
        await apiAddSector({ id, name: name.trim(), type, created_at: now });
        await loadCustomSectors();
        refreshSectorUI();
        return true;
    } catch (e) {
        console.error('Error al agregar sector:', e);
        alert('Error al guardar el sector. Quizás ya existe uno con ese nombre.');
        return false;
    }
}

async function deleteCustomSector(id) {
    const sector = customSectors.find(s => s.id === id);
    if (!sector) return;

    const productsInSector = products.filter(p => p.sector === sector.name);
    if (productsInSector.length > 0) {
        if (!confirm(`Hay ${productsInSector.length} producto(s) en este sector. ¿Eliminarlos también?`)) return;
    }

    try {
        await apiDeleteSector(id);
        await loadCustomSectors();
        await loadProducts();
        await loadAllHistory();
        refreshSectorUI();
        renderProducts();
        renderPedidos();
        renderDailyStock();
        renderHistory();
    } catch (e) {
        console.error('Error al eliminar sector:', e);
    }
}

function getSectorLabel(sectorValue) {
    if (SECTOR_LABELS[sectorValue]) return SECTOR_LABELS[sectorValue];
    const custom = customSectors.find(s => s.name === sectorValue);
    if (custom) {
        const icon = custom.type === 'freezer' || custom.type === 'heladera' ? '🧊' : '📦';
        return `${icon} ${custom.name}`;
    }
    return sectorValue;
}

function populateSectorSelects() {
    const groups = [
        'product-custom-sectors-group',
        'ap-custom-sectors-group',
        'filter-custom-sectors-group',
        'edit-custom-sectors-group'
    ];
    groups.forEach(groupId => {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.innerHTML = '';
        customSectors.forEach(s => {
            const icon = s.type === 'freezer' || s.type === 'heladera' ? '🧊' : '📦';
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = `${icon} ${s.name}`;
            group.appendChild(opt);
        });
    });
}

function renderCustomSectorsList() {
    const list = document.getElementById('custom-sectors-list');
    if (!list) return;
    if (customSectors.length === 0) {
        list.innerHTML = '<p class="text-muted">No hay sectores personalizados todavía.</p>';
        return;
    }
    let html = '<div class="sector-tags">';
    customSectors.forEach(s => {
        const icon = s.type === 'freezer' || s.type === 'heladera' ? '🧊' : '📦';
        html += `<div class="sector-tag"><span>${icon} ${escapeHtml(s.name)}</span><button class="sector-tag-delete" onclick="deleteCustomSector('${s.id}')" title="Eliminar">&times;</button></div>`;
    });
    html += '</div>';
    list.innerHTML = html;
}

function refreshSectorUI() {
    populateSectorSelects();
    renderCustomSectorsList();
}