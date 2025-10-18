module.exports = {
  apps: [
    {
      name: 'visa-monitor',
      script: './index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        EMAIL: process.env.EMAIL,
        PASSWORD: process.env.PASSWORD,
        SCHEDULE_ID: process.env.SCHEDULE_ID,
        FACILITY_ID: process.env.FACILITY_ID,
        LOCALE: process.env.LOCALE,
        START_DATE: process.env.START_DATE || '2025-11-25',
        END_DATE: process.env.END_DATE || '2025-12-15',
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8378702542:AAEhOLmL3Y9QUOWXO2A1pISIOSMXqq3y3k4',
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '126633141',
      }
    }
  ]
};