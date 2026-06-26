const fs = require('fs');
const path = require('path');

// Cargar .env si existe
if (fs.existsSync(path.join(__dirname, '.env'))) {
    fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    });
}

async function sync() {
    const railwayUrl = process.env.RAILWAY_URL;
    if (!railwayUrl) {
        console.log('ℹ️  Sin RAILWAY_URL configurada, usando base de datos local.');
        return;
    }

    console.log('🔄 Sincronizando base de datos desde Railway...');
    try {
        const res = await fetch(`${railwayUrl}/api/backup`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const localPath = process.env.DB_PATH || path.join(__dirname, 'restaurant-stock.db');
        fs.writeFileSync(localPath, Buffer.from(buffer));
        console.log('✅ Base de datos actualizada desde Railway');
    } catch (e) {
        console.error('⚠️  No se pudo sincronizar:', e.message);
        console.log('   Continuando con la base de datos local...');
    }
}

sync();
