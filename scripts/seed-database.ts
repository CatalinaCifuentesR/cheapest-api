import * as fs from 'fs';
import * as path from 'path';
import {
  Catalogo,
  Despacho,
  DisponibilidadZona,
  ItemPedido,
  NotaCredito,
  Pedido,
  Producto,
  Promocion,
} from '../libs/logistica/src/repositories/entities';
import {
  ItemInventario,
  RegistroCompraProductoTienda,
  RegistroVentaProductoTienda,
} from '../libs/inventario/src/repositories/entities';
import {
  ItemVenta,
  ProductoExterno,
  Venta,
} from '../libs/ventas/src/repositories/entities';
import { createDataSource } from '../libs/shared/database/src';

const CONNECTION_RETRY_DELAY_MS = parseInt(
  process.env.DB_CONNECT_RETRY_DELAY_MS || '2000',
  10,
);
const CONNECTION_RETRY_ATTEMPTS = parseInt(
  process.env.DB_CONNECT_RETRIES || '15',
  10,
);

process.env.DB_HOST ??= '127.0.0.1';
process.env.DB_PORT ??= '5432';
process.env.DB_USERNAME ??= 'postgres';
process.env.DB_PASSWORD ??= 'postgres';
process.env.DB_NAME ??= 'cheapest';
// El Postgres de Docker Compose no tiene SSL; contra RDS se usa el valor por defecto (true).
if (['127.0.0.1', 'localhost'].includes(process.env.DB_HOST)) {
  process.env.DB_SSL ??= 'false';
}

async function initializeDataSourceWithRetry(entities: Function[]) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CONNECTION_RETRY_ATTEMPTS; attempt += 1) {
    const dataSource = createDataSource(entities);

    try {
      await dataSource.initialize();
      return dataSource;
    } catch (error) {
      lastError = error;

      if (dataSource.isInitialized) {
        await dataSource.destroy().catch(() => undefined);
      }

      if (attempt === CONNECTION_RETRY_ATTEMPTS) {
        break;
      }

      console.log(
        `Waiting for Postgres (${attempt}/${CONNECTION_RETRY_ATTEMPTS}) at ${process.env.DB_HOST}:${process.env.DB_PORT}...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, CONNECTION_RETRY_DELAY_MS),
      );
    }
  }

  throw lastError;
}

async function seedDatabase() {
  const entities = [
    Catalogo,
    Despacho,
    DisponibilidadZona,
    ItemInventario,
    ItemPedido,
    ItemVenta,
    NotaCredito,
    Pedido,
    Producto,
    ProductoExterno,
    Promocion,
    RegistroCompraProductoTienda,
    RegistroVentaProductoTienda,
    Venta,
  ];

  const dataSource = await initializeDataSourceWithRetry(entities);

  try {
    await dataSource.synchronize();

    const tables = await dataSource.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'items_inventario'
      ) AS "exists"
    `);

    if (tables[0]?.exists) {
      const rows = await dataSource.query(
        'SELECT COUNT(*)::int AS count FROM items_inventario',
      );

      if ((rows[0]?.count ?? 0) > 0) {
        console.log('Database already seeded. Skipping.');
        return;
      }
    }

    const sqlPath = path.join(
      __dirname,
      '../libs/shared/database/src/seed.sql',
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');
    // Quitar las líneas de comentario antes de partir: cada bloque de seed.sql empieza con
    // un comentario, y si se filtra por startsWith('--') se descartan todas las sentencias.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter(
        (statement) => statement.length > 0 && !statement.startsWith('--'),
      );

    for (const statement of statements) {
      await dataSource.query(statement);
    }

    console.log('Database seeded successfully.');
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void seedDatabase().catch((error) => {
  console.error('Failed to seed database:', error);
  console.error(
    'Ensure Postgres is running with `docker compose up -d postgres` and reachable with the configured DB_* environment variables.',
  );
  process.exit(1);
});
