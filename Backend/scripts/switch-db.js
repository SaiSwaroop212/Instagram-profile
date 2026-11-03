import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

const target = process.argv[2]; // 'cloud' | 'local' | 'status'

if (!fs.existsSync(envPath)) {
  console.error('.env file not found at:', envPath);
  process.exit(1);
}

let content = fs.readFileSync(envPath, 'utf8');

const renderMatch = content.match(/RENDER_DATABASE_URL="([^"]+)"/);
const localMatch = content.match(/LOCAL_DATABASE_URL="([^"]+)"/);

if (!renderMatch || !localMatch) {
  console.error('Could not find RENDER_DATABASE_URL or LOCAL_DATABASE_URL in .env');
  process.exit(1);
}

const renderUrl = renderMatch[1];
const localUrl = localMatch[1];

if (target === 'status') {
  const currentMatch = content.match(/^DATABASE_URL="([^"]+)"/m);
  if (currentMatch && currentMatch[1].includes('render.com')) {
    console.log('Active Database: [RENDER CLOUD]');
  } else if (currentMatch && currentMatch[1].includes('localhost')) {
    console.log('Active Database: [LOCALHOST]');
  } else {
    console.log('Active Database URL:', currentMatch ? currentMatch[1] : 'Not set');
  }
  process.exit(0);
}

if (target === 'cloud') {
  content = content.replace(/^DATABASE_URL="[^"]*"/m, `DATABASE_URL="${renderUrl}"`);
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('Switched to RENDER CLOUD Database!');
} else if (target === 'local') {
  content = content.replace(/^DATABASE_URL="[^"]*"/m, `DATABASE_URL="${localUrl}"`);
  fs.writeFileSync(envPath, content, 'utf8');
  console.log('Switched to LOCALHOST Database!');
} else {
  console.log('Usage: node scripts/switch-db.js [cloud|local|status]');
}
