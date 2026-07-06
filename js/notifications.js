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
    list.innerHTML = recipients.map(r => {
        const icon = r.type === 'group' ? '👥' : '👤';
        const detail = r.type === 'group' ? escapeHtml(r.groupName || r.chatId) : escapeHtml(r.phone || '');
        return `
        <div class="recipient-row" data-id="${r.id}">
            <span class="recipient-name">${icon} ${escapeHtml(r.name)}</span>
            <span class="recipient-phone">${detail}</span>
            <button class="btn btn-delete recipient-delete" data-id="${r.id}" style="padding:4px 8px;font-size:0.75rem;">✕</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.recipient-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteRecipient(btn.dataset.id));
    });
}

async function deleteRecipient(id) {
    if (!confirm('¿Eliminar este destinatario?')) return;
    await fetch(`/api/notifications/recipients/${id}`, { method: 'DELETE' });
    await loadRecipients();
}

async function openAddRecipientModal() {
    const type = await showRecipientTypeDialog();
    if (!type) return;

    if (type === 'individual') {
        const name = prompt('Nombre (para identificarlo):');
        if (!name?.trim()) return;
        const phone = prompt('Número con código de país sin + (ej: 5491112345678):');
        if (!phone?.trim()) return;
        await fetch('/api/notifications/recipients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Date.now().toString(36), type: 'individual', name: name.trim(), phone: phone.trim() })
        });
        await loadRecipients();
    } else {
        await openAddGroupModal();
    }
}

function showRecipientTypeDialog() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:24px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <p style="font-size:0.95rem;font-weight:600;margin-bottom:16px;color:var(--text-heading);">¿Qué tipo de destinatario?</p>
                <button id="rt-individual" class="btn btn-secondary" style="width:100%;margin-bottom:10px;justify-content:flex-start;gap:10px;">👤 Número individual</button>
                <button id="rt-group" class="btn btn-secondary" style="width:100%;margin-bottom:16px;justify-content:flex-start;gap:10px;">👥 Grupo de WhatsApp</button>
                <button id="rt-cancel" class="btn" style="width:100%;font-size:0.8rem;color:var(--text-secondary);">Cancelar</button>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#rt-individual').onclick = () => { document.body.removeChild(overlay); resolve('individual'); };
        overlay.querySelector('#rt-group').onclick = () => { document.body.removeChild(overlay); resolve('group'); };
        overlay.querySelector('#rt-cancel').onclick = () => { document.body.removeChild(overlay); resolve(null); };
    });
}

async function openAddGroupModal() {
    const statusEl = document.createElement('div');
    statusEl.textContent = 'Cargando grupos...';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
        <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:24px;width:340px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <p style="font-size:0.95rem;font-weight:600;margin-bottom:4px;color:var(--text-heading);">Agregar grupo de WhatsApp</p>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:14px;">Seleccioná el grupo al que mandar el pedido</p>
            <div id="group-list-container" style="overflow-y:auto;flex:1;margin-bottom:14px;font-size:0.85rem;">Cargando grupos...</div>
            <button id="group-cancel" class="btn" style="width:100%;font-size:0.8rem;color:var(--text-secondary);">Cancelar</button>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#group-cancel').onclick = () => document.body.removeChild(overlay);

    const container = overlay.querySelector('#group-list-container');
    try {
        const groups = await fetch('/api/whatsapp/groups').then(r => r.json());
        if (!Array.isArray(groups) || groups.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);">No se encontraron grupos. Asegurate de que WhatsApp esté conectado y que seas miembro de al menos un grupo.</p>';
            return;
        }
        container.innerHTML = groups.map(g => `
            <div class="recipient-row group-option" data-id="${escapeHtml(g.id)}" data-name="${escapeHtml(g.name)}" style="cursor:pointer;padding:8px 10px;border-radius:6px;margin-bottom:4px;">
                👥 ${escapeHtml(g.name)}
            </div>`).join('');
        container.querySelectorAll('.group-option').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.background = 'var(--bg-hover)');
            el.addEventListener('mouseleave', () => el.style.background = '');
            el.addEventListener('click', async () => {
                const groupId = el.dataset.id;
                const groupName = el.dataset.name;
                const label = prompt('Nombre para identificar este grupo:', groupName);
                if (!label?.trim()) return;
                document.body.removeChild(overlay);
                await fetch('/api/notifications/recipients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: Date.now().toString(36), type: 'group', name: label.trim(), chatId: groupId, groupName })
                });
                await loadRecipients();
            });
        });
    } catch (e) {
        container.innerHTML = '<p style="color:var(--status-critical-text);">Error al cargar grupos.</p>';
    }
}

function updateNotifEnabledBtn() {
    const enabled = document.getElementById('notif-enabled').checked;
    const btn = document.getElementById('notif-enabled-btn');
    btn.textContent = enabled ? '🟢 Aviso activado' : '🔴 Aviso desactivado';
    btn.style.background = enabled ? 'var(--status-ok-bg)' : 'var(--status-critical-bg)';
    btn.style.color = enabled ? 'var(--status-ok-text)' : 'var(--status-critical-text)';
    btn.style.border = `1.5px solid ${enabled ? 'var(--status-ok-text)' : 'var(--status-critical-text)'}`;
}

function toggleNotifEnabled() {
    const cb = document.getElementById('notif-enabled');
    cb.checked = !cb.checked;
    updateNotifEnabledBtn();
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

        // Normalizar días: soporta el campo viejo (day_of_week) y el nuevo (days)
        let days = config.days || [];
        if (!days.length && config.day_of_week) {
            days = config.day_of_week === 'everyday' ? ['1','2','3','4','5','6','0'] : [config.day_of_week];
        }
        document.querySelectorAll('#notif-days input[type="checkbox"]').forEach(cb => {
            cb.checked = days.includes(cb.value);
        });

        document.getElementById('notif-time').value = config.send_time || '08:00';
        document.getElementById('notif-enabled').checked = !!config.enabled;
        updateNotifEnabledBtn();
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
    const days = [...document.querySelectorAll('#notif-days input[type="checkbox"]:checked')].map(cb => cb.value);
    const body = {
        days,
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
            if (data.errors > 0 && data.sent === 0) {
                status.style.color = 'var(--status-critical-text)';
                status.textContent = `❌ Error: ${(data.errorDetails || []).join(', ') || 'Error desconocido'}`;
            } else {
                status.style.color = 'var(--status-ok-text)';
                status.textContent = `✅ Enviado a ${data.sent} destinatario(s)${data.errors > 0 ? ` (${data.errors} error(es))` : ''}.`;
            }
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
