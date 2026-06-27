const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./serviceAccountKey.json');
initializeApp({ credential: cert(serviceAccount) });
const firestore = getFirestore();

const sqliteDb = new Database(path.join(__dirname, 'restaurant-stock.db'));

async function batchWrite(collection, docs) {
    const SIZE = 400;
    for (let i = 0; i < docs.length; i += SIZE) {
        const batch = firestore.batch();
        for (const doc of docs.slice(i, i + SIZE)) {
            const ref = firestore.collection(collection).doc(doc.id);
            batch.set(ref, doc);
        }
        await batch.commit();
        console.log(`  ✅ ${Math.min(i + SIZE, docs.length)} / ${docs.length}`);
    }
}

async function migrate() {
    console.log('🚀 Iniciando migración SQLite → Firestore...\n');

    // Productos
    const products = sqliteDb.prepare('SELECT * FROM products').all();
    console.log(`📦 Migrando ${products.length} productos...`);
    await batchWrite('products', products.map(p => ({
        id: p.id, name: p.name, sector: p.sector, unit: p.unit,
        min_stock: p.min_stock, price: p.price ?? null,
        created_at: p.created_at, updated_at: p.updated_at ?? null,
        last_stock: p.last_stock ?? null, last_stock_date: p.last_stock_date ?? null
    })));

    // Sectores
    const sectors = sqliteDb.prepare('SELECT * FROM custom_sectors').all();
    console.log(`\n🗂️  Migrando ${sectors.length} sectores...`);
    await batchWrite('sectors', sectors.map(s => ({
        id: s.id, name: s.name, type: s.type, created_at: s.created_at
    })));

    // Historial
    const history = sqliteDb.prepare('SELECT * FROM stock_history').all();
    console.log(`\n📊 Migrando ${history.length} entradas de historial...`);
    await batchWrite('history', history.map(h => ({
        id: h.id, product_id: h.product_id, product_name: h.product_name,
        sector: h.sector, unit: h.unit, stock: h.stock,
        date: h.date, created_at: h.created_at
    })));

    // Config de notificaciones
    const config = sqliteDb.prepare('SELECT * FROM notification_config WHERE id = 1').get();
    if (config) {
        console.log('\n🔔 Migrando configuración de notificaciones...');
        await firestore.collection('notifications').doc('config').set({
            day_of_week: config.day_of_week || 'everyday',
            send_time: config.send_time || '08:00',
            enabled: !!config.enabled,
            last_sent: config.last_sent || ''
        });
        console.log('  ✅ Config migrada');
    }

    // Destinatarios
    const recipients = sqliteDb.prepare('SELECT * FROM notification_recipients').all();
    if (recipients.length > 0) {
        console.log(`\n📱 Migrando ${recipients.length} destinatarios...`);
        await batchWrite('recipients', recipients);
    }

    sqliteDb.close();
    console.log('\n✅ Migración completada exitosamente!');
    process.exit(0);
}

migrate().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
