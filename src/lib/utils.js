import fetch from 'node-fetch';

// Array of realistic User-Agent strings for different browsers
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function log(message) {
  console.log(`[${new Date().toISOString()}]`, message);
}

export function isSocketHangupError(err) {
  return err.code === 'ECONNRESET' || 
         err.code === 'ENOTFOUND' || 
         err.code === 'ETIMEDOUT' ||
         err.message.includes('socket hang up') ||
         err.message.includes('network') ||
         err.message.includes('connection');
}

// Telegram notification functions
export async function sendTelegramMessage(botToken, chatId, message) {
  if (!botToken || !chatId) {
    log('Telegram bot token or chat ID not configured, skipping notification');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      log(`Failed to send Telegram message: ${response.status} ${errorText}`);
    } else {
      //log('Telegram message sent successfully');
    }
  } catch (error) {
    log(`Error sending Telegram message: ${error.message}`);
  }
}

// Send error/log message to main bot
export async function sendErrorNotification(config, message) {
  const formattedMessage = 
    `📅 ${message}`;
  
  await sendTelegramMessage(config.telegramBotToken, config.telegramChatId, formattedMessage);
}

// Send important event (found dates, successful booking) to special bot
export async function sendImportantNotification(config, title, message) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `✅ <b>${title}</b>\n\n` +
    `<b>Time:</b> ${timestamp}\n` +
    `<b>Email:</b> ${config.email}\n\n` +
    `<b>Start Date:</b> ${config.email}\n\n` +
    `<b>Min Date:</b> ${config.email}\n\n` +
    `${message}`;
  
  await sendTelegramMessage(config.specialBotToken, config.specialChatId, formattedMessage);
}