import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

if (!fs.existsSync(envPath)) {
  console.error('.env file not found at:', envPath);
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const currentMatch = content.match(/^DATABASE_URL="([^"]+)"/m);

console.log('==================================================');
console.log('Active Database: [RENDER CLOUD]');
if (currentMatch) {
  console.log('Database Host: dpg-dbhhsr7b9u1s73etjc50-a.oregon-postgres.render.com');
  console.log('Database Name: social_feed_db_7w6m');
  console.log('Mode: Single Cloud Database (Local database removed)');
} else {
  console.log('Status: DATABASE_URL not found in .env');
}
console.log('==================================================');
