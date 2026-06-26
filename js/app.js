// ============================================
// app.js - Punto de entrada principal (via API)
// ============================================

// ============================================
// Inicialización
// ============================================

async function init() {
    try {
        await loadCustomSectors();
        await loadProducts();
        await loadAllHistory();
        populateSectorSelects();
        await populateHistoryProductFilter();
        renderCustomSectorsList();
        renderProducts();
        renderPedidos();
        renderDailyStock();
        renderHistory();
        setDailyDate('daily-date');
    } catch (e) {
        console.error('Error al inicializar:', e);
        alert('Error al conectar con el servidor. Asegurate de que esté corriendo en http://localhost:3000');
    }
}

// ============================================
// Pestañas
// ============================================

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// ============================================
// Event Handlers - Modal Agregar Producto
// ============================================

const addModal = document.getElementById('add-product-modal');
const addForm = document.getElementById('add-product-form');

document.getElementById('open-add-product-modal').addEventListener('click', () => {
    addModal.classList.remove('hidden');
});

document.getElementById('close-add-modal').addEventListener('click', () => {
    addModal.classList.add('hidden');
    addForm.reset();
    document.getElementById('ap-sector').value = '';
    document.getElementById('ap-unit').value = '';
});

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) {
        addModal.classList.add('hidden');
        addForm.reset();
        document.getElementById('ap-sector').value = '';
        document.getElementById('ap-unit').value = '';
    }
});

addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('ap-name').value;
    const sector = document.getElementById('ap-sector').value;
    const unit = document.getElementById('ap-unit').value;
    const minStock = document.getElementById('ap-min-stock').value;
    const price = document.getElementById('ap-price').value;

    if (!name || !sector || !unit || minStock === '') {
        alert('Completá todos los campos obligatorios.');
        return;
    }

    await addProduct(name, sector, unit, minStock, price);
    addForm.reset();
    document.getElementById('ap-sector').value = '';
    document.getElementById('ap-unit').value = '';
    addModal.classList.add('hidden');
});

// ============================================
// Event Handlers - Editar producto (modal)
// ============================================

document.getElementById('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value;
    const sector = document.getElementById('edit-sector').value;
    const unit = document.getElementById('edit-unit').value;
    const minStock = document.getElementById('edit-min-stock').value;
    const price = document.getElementById('edit-price').value;

    if (!name || !sector || !unit || minStock === '') {
        alert('Completá todos los campos obligatorios.');
        return;
    }

    await updateProduct(id, name, sector, unit, minStock, price);
    closeEditModal();
});

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-form').reset();
}

document.getElementById('close-modal').addEventListener('click', closeEditModal);
document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('edit-modal').classList.contains('hidden')) {
        closeEditModal();
    }
});

// ============================================
// Event Handlers - Carga del día
// ============================================

document.getElementById('save-daily-btn').addEventListener('click', saveDailyStock);
document.getElementById('daily-search').addEventListener('input', renderDailyStock);

// ============================================
// Event Handlers - Historial
// ============================================

document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
document.getElementById('history-date-from').addEventListener('change', renderHistory);
document.getElementById('history-date-to').addEventListener('change', renderHistory);
document.getElementById('history-product-filter').addEventListener('change', renderHistory);

// ============================================
// Event Handlers - Filtros de productos
// ============================================

document.getElementById('search-input').addEventListener('input', renderProducts);
document.getElementById('sector-filter').addEventListener('change', renderProducts);

// ============================================
// Event Handlers - Sectores personalizados
// ============================================

document.getElementById('add-sector-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-sector-name').value.trim();
    const type = document.getElementById('new-sector-type').value;
    if (!name) { alert('Ingresá un nombre para el sector.'); return; }
    if (await addCustomSector(name, type)) document.getElementById('new-sector-name').value = '';
});

document.getElementById('new-sector-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-sector-btn').click(); }
});

// ============================================
// Exponer funciones globales para onclick en HTML
// ============================================

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.deleteCustomSector = deleteCustomSector;

// ============================================
// Arranque
// ============================================

init();