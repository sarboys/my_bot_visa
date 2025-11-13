import { sendImportantNotification } from '../lib/utils.js';
import { getConfig } from '../lib/config.js';

// Ensure required env vars exist for getConfig validation
process.env.EMAIL = process.env.EMAIL || 'test@example.com';
process.env.PASSWORD = process.env.PASSWORD || 'test-password';
process.env.SCHEDULE_ID = process.env.SCHEDULE_ID || '00000000';
process.env.FACILITY_ID = process.env.FACILITY_ID || '000';
process.env.COUNTRY_CODE = process.env.COUNTRY_CODE || 'ca';

const config = getConfig();
config.email = 'serejka.poliakov@yandex.ru';

const title = 'Test Important Notification';
const message = 'This is a test message body.';

async function run() {
  try {
    await sendImportantNotification(config, title, message);
    console.log('sendImportantNotification executed without runtime errors');
  } catch (err) {
    console.error('sendImportantNotification threw an error:', err);
    process.exit(1);
  }
}

await run();