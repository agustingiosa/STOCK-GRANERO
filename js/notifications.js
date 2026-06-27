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

async function loadNotificationConfig() {
    try {
        const config = await fetch('/api/notifications/config').then(r => r.json());
        document.getElementById('notif-phone').value = config.phone || '';
        document.getElementById('notif-apikey').value = config.apikey || '';
        document.getElementById('notif-day').value = config.day_of_week || 'everyday';
        document.getElementById('notif-time').value = config.send_time || '08:00';
        document.getElementById('notif-enabled').checked = !!config.enabled;
    } catch (e) {
        console.error('Error al cargar config de notificaciones:', e);
    }
}

async function saveNotificationConfig() {
    const status = document.getElementById('notif-status');
    const body = {
        phone: document.getElementById('notif-phone').value.trim(),
        apikey: document.getElementById('notif-apikey').value.trim(),
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
        if (res.ok && data.success !== false) {
            status.style.color = 'var(--status-ok-text)';
            status.textContent = '✅ Mensaje enviado. Revisá tu WhatsApp.';
        } else {
            status.style.color = 'var(--status-critical-text)';
            status.textContent = `❌ Error: ${data.error || data.response || 'No se pudo enviar.'}`;
        }
    } catch (e) {
        status.style.color = 'var(--status-critical-text)';
        status.textContent = '❌ Error de conexión.';
    }

    document.getElementById('notif-test-btn').disabled = false;
    setTimeout(() => status.textContent = '', 5000);
}
