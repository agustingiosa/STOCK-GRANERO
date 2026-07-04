// ============================================
// notifications.js - Configuración de alertas WhatsApp
// ============================================

async function createManualBackup() {
    const status = document.getElementById('backup-status');
    const btn = document.getElementById('create-backup-btn');
    btn.disabled = true;
    status.textContent = 'Creando backup...';
    try {
        const res = await fetch('/api/backups/create', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            status.style.color = 'var(--status-ok-text)';
            status.textContent = `✅ ${data.file}`;
        } else {
            status.style.color = 'var(--status-critical-text)';
            status.textContent = '❌ Error al crear backup.';
        }
    } catch (e) {
        status.style.color = 'var(--status-critical-text)';
        status.textContent = '❌ Error de conexión.';
    }
    btn.disabled = false;
    setTimeout(() => status.textContent = '', 4000);
}

// ============================================
// Destinatarios
// ============================================

async function loadRecipients() {
    try {
        const recipients = await fetch('/api/notifications/recipients').then(r => r.json());
        renderRecipients(recipients);
    } catch (e) {
        console.error('Error al cargar destinatarios:', e);
    }
}

function renderRecipients(recipients) {
    const list = document.getElementById('recipients-list');
    if (recipients.length === 0) {
        list.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No hay destinatarios. Agregá al menos uno.</p>';
        return;
    }
    list.innerHTML = recipients.map(r => `
        <div class="recipient-row" data-id="${r.id}">
            <span class="recipient-name">${escapeHtml(r.name)}</span>
            <span class="recipient-phone">${escapeHtml(r.phone)}</span>
            <button class="btn btn-delete recipient-delete" data-id="${r.id}" style="padding:4px 8px;font-size:0.75rem;">✕</button>
        </div>
    `).join('');

    list.querySelectorAll('.recipient-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteRecipient(btn.dataset.id));
    });
}

async function deleteRecipient(id) {
    if (!confirm('¿Eliminar este destinatario?')) return;
    await fetch(`/api/notifications/recipients/${id}`, { method: 'DELETE' });
    await loadRecipients();
}

function openAddRecipientModal() {
    const name = prompt('Nombre (para identificarlo):');
    if (!name?.trim()) return;
    const phone = prompt('Número con código de país sin + (ej: 5491112345678):');
    if (!phone?.trim()) return;

    fetch('/api/notifications/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Date.now().toString(36), name: name.trim(), phone: phone.trim() })
    }).then(() => loadRecipients());
}

// ============================================
// Estado de conexión WhatsApp
// ============================================

let waPollingInterval = null;

async function loadWAStatus() {
    try {
        const data = await fetch('/api/whatsapp/status').then(r => r.json());
        const dot = document.getElementById('wa-status-dot');
        const text = document.getElementById('wa-status-text');
        const qrContainer = document.getElementById('wa-qr-container');
        const qrImg = document.getElementById('wa-qr-img');
        const logoutBtn = document.getElementById('wa-logout-btn');

        if (data.status === 'ready') {
            dot.style.background = '#22c55e';
            text.textContent = 'WhatsApp conectado ✓';
            qrContainer.style.display = 'none';
            logoutBtn.style.display = 'inline-block';
            clearInterval(waPollingInterval);
            waPollingInterval = null;
        } else if (data.status === 'qr') {
            dot.style.background = '#f59e0b';
            text.textContent = 'Esperando escaneo del QR...';
            qrContainer.style.display = 'block';
            qrImg.src = data.qr || '';
            logoutBtn.style.display = 'none';
            if (!waPollingInterval) waPollingInterval = setInterval(loadWAStatus, 4000);
        } else if (data.status === 'connecting') {
            dot.style.background = '#3b82f6';
            text.textContent = 'Conectando...';
            qrContainer.style.display = 'none';
            logoutBtn.style.display = 'none';
            if (!waPollingInterval) waPollingInterval = setInterval(loadWAStatus, 3000);
        } else {
            dot.style.background = '#ef4444';
            text.textContent = 'WhatsApp desconectado — iniciando...';
            qrContainer.style.display = 'none';
            logoutBtn.style.display = 'none';
            if (!waPollingInterval) waPollingInterval = setInterval(loadWAStatus, 5000);
        }
    } catch (e) {
        console.error('Error al obtener estado WA:', e);
    }
}

// ============================================
// Config de horario
// ============================================

async function loadNotificationConfig() {
    try {
        const config = await fetch('/api/notifications/config').then(r => r.json());
        document.getElementById('notif-day').value = config.day_of_week || 'everyday';
        document.getElementById('notif-time').value = config.send_time || '08:00';
        document.getElementById('notif-enabled').checked = !!config.enabled;
        await Promise.all([loadRecipients(), loadWAStatus()]);

        document.getElementById('wa-logout-btn').addEventListener('click', async () => {
            if (!confirm('¿Desconectar WhatsApp? Tendrás que volver a escanear el QR.')) return;
            await fetch('/api/whatsapp/logout', { method: 'POST' });
            await loadWAStatus();
        });
    } catch (e) {
        console.error('Error al cargar config de notificaciones:', e);
    }
}

async function saveNotificationConfig() {
    const status = document.getElementById('notif-status');
    const body = {
        day_of_week: document.getElementById('notif-day').value,
        send_time: document.getElementById('notif-time').value,
        enabled: document.getElementById('notif-enabled').checked
    };
    try {
        await fetch('/api/notifications/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        status.style.color = 'var(--status-ok-text)';
        status.textContent = '✅ Configuración guardada.';
    } catch (e) {
        status.style.color = 'var(--status-critical-text)';
        status.textContent = '❌ Error al guardar.';
    }
    setTimeout(() => status.textContent = '', 3000);
}

async function sendTestNotification() {
    const status = document.getElementById('notif-status');
    status.style.color = 'var(--text-secondary)';
    status.textContent = '📤 Enviando mensaje de prueba...';
    document.getElementById('notif-test-btn').disabled = true;

    try {
        const res = await fetch('/api/notifications/test', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            status.style.color = 'var(--status-ok-text)';
            status.textContent = `✅ Enviado a ${data.sent} destinatario(s)${data.errors > 0 ? `, ${data.errors} error(es)` : ''}.`;
        } else {
            status.style.color = 'var(--status-critical-text)';
            status.textContent = `❌ ${data.error}`;
        }
    } catch (e) {
        status.style.color = 'var(--status-critical-text)';
        status.textContent = '❌ Error de conexión.';
    }

    document.getElementById('notif-test-btn').disabled = false;
    setTimeout(() => status.textContent = '', 5000);
}
