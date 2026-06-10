import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};

  const env = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const index = line.indexOf('=');
    if (index === -1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

const fileEnv = {
  ...loadEnvFile('.env'),
  ...loadEnvFile('.env.local'),
};

const pgBouncerPort = process.env.PGBOUNCER_HOST_PORT ?? fileEnv.PGBOUNCER_HOST_PORT ?? '56432';
const mysqlPort = process.env.MYSQL_HOST_PORT ?? fileEnv.MYSQL_HOST_PORT ?? '53306';
const redisPort = process.env.REDIS_HOST_PORT ?? fileEnv.REDIS_HOST_PORT ?? '56379';
const gotenbergPort = process.env.GOTENBERG_HOST_PORT ?? fileEnv.GOTENBERG_HOST_PORT ?? '53000';
const rustfsApiPort = process.env.RUSTFS_API_PORT ?? fileEnv.RUSTFS_API_PORT ?? '5335';
const meiliPort = process.env.MEILI_PORT ?? fileEnv.MEILI_PORT ?? '5333';
const soketiPort = process.env.SOKETI_PORT ?? fileEnv.SOKETI_PORT ?? '5334';
const dbDriver = process.env.DB_DRIVER ?? fileEnv.DB_DRIVER ?? 'postgres';

const env = {
  ...fileEnv,
  ...process.env,
  NODE_ENV: 'development',
  APP_URL: process.env.APP_URL ?? fileEnv.APP_URL ?? 'http://127.0.0.1:5173',
  DB_DRIVER: dbDriver,
  DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.DB_PORT ?? (dbDriver === 'mysql' ? mysqlPort : pgBouncerPort),
  DB_PREPARE: process.env.DB_PREPARE ?? 'false',
  REDIS_HOST: process.env.REDIS_HOST ?? '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT ?? redisPort,
  CACHE_DRIVER: process.env.CACHE_DRIVER ?? 'redis',
  QUEUE_DRIVER: process.env.QUEUE_DRIVER ?? 'redis',
  RATE_LIMIT_STORE: process.env.RATE_LIMIT_STORE ?? 'cache',
  RATE_LIMIT_CACHE_STORE: process.env.RATE_LIMIT_CACHE_STORE ?? 'redis',
  PUSHER_HOST: process.env.PUSHER_HOST ?? '127.0.0.1',
  PUSHER_PORT: process.env.PUSHER_PORT ?? soketiPort,
  PUSHER_CLIENT_HOST: process.env.PUSHER_CLIENT_HOST ?? 'localhost',
  PUSHER_CLIENT_PORT: process.env.PUSHER_CLIENT_PORT ?? soketiPort,
  MEILISEARCH_HOST: process.env.MEILISEARCH_HOST ?? `http://127.0.0.1:${meiliPort}`,
  GOTENBERG_URL: process.env.GOTENBERG_URL ?? `http://127.0.0.1:${gotenbergPort}`,
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? `http://127.0.0.1:${rustfsApiPort}`,
};

const child = spawn('npx', ['svelar', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
