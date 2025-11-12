import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
  const config = {
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
    scheduleId: process.env.SCHEDULE_ID,
    facilityId: process.env.FACILITY_ID,
    countryCode: process.env.COUNTRY_CODE,
    //refreshDelay: Number(process.env.REFRESH_DELAY || 3),
    minDate: process.env.MIN_DATE,
    maxDate: process.env.MAX_DATE,
    dateRangesRaw: process.env.DATE_RANGES,
    daysBeforeBooking: Number(process.env.DAYS_BEFORE_BOOKING || 0),
    // Telegram configuration for errors and logs
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '8378702542:AAEhOLmL3Y9QUOWXO2A1pISIOSMXqq3y3k4',
    telegramChatId: (process.env.TELEGRAM_CHAT_ID || '126633141,194213175').split(',').map(id => id.trim()),
    // Special bot for important events (found dates and successful bookings)
    specialBotToken: process.env.SPECIAL_BOT_TOKEN || '8051057939:AAEfPFNypptmXtwo5eaeMkK93x1KxhFpenI',
    specialChatId: (process.env.SPECIAL_CHAT_ID || '126633141,194213175').split(',').map(id => id.trim())
  };

  validateConfig(config);
  
  // Parse and prepare date ranges (supports multiple intervals)
  config.dateRanges = parseDateRanges(config.dateRangesRaw, config.minDate, config.maxDate);
  // Calculate actual start date for single-range compatibility
  config.calculatedMinDate = calculateStartDate(config.minDate, config.daysBeforeBooking);
  
  return config;
}

function validateConfig(config) {
  const required = ['email', 'password', 'scheduleId', 'facilityId', 'countryCode'];
  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.map(k => k.toUpperCase()).join(', ')}`);
    process.exit(1);
  }

  // Validate either single-range or multiple ranges
  if (config.dateRangesRaw) {
    // Validation deferred to parseDateRanges which will throw on error
    try {
      parseDateRanges(config.dateRangesRaw, config.minDate, config.maxDate);
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
  } else {
    if (!isValidDate(config.minDate)) {
      console.error(`Invalid MIN_DATE format. Expected YYYY-MM-DD, got: ${config.minDate}`);
      process.exit(1);
    }
    if (!isValidDate(config.maxDate)) {
      console.error(`Invalid MAX_DATE format. Expected YYYY-MM-DD, got: ${config.maxDate}`);
      process.exit(1);
    }
    if (new Date(config.minDate) >= new Date(config.maxDate)) {
      console.error(`MIN_DATE must be earlier than MAX_DATE. MIN_DATE: ${config.minDate}, MAX_DATE: ${config.maxDate}`);
      process.exit(1);
    }
  }
}

export function calculateStartDate(originalStartDate, daysBeforeBooking) {
  // Если DAYS_BEFORE_BOOKING не указан или равен 0, возвращаем оригинальную дату
  if (daysBeforeBooking <= 0) {
    return originalStartDate;
  }

  const today = new Date();
  const startDate = new Date(originalStartDate);
  
  // Вычисляем разность в днях между сегодня и начальной датой
  const diffTime = startDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Если до начальной даты остается меньше чем daysBeforeBooking дней,
  // сдвигаем начальную дату вперед
  if (diffDays < daysBeforeBooking) {
    const shiftedDate = new Date(today);
    shiftedDate.setDate(today.getDate() + daysBeforeBooking);
    return shiftedDate.toISOString().split('T')[0];
  }
  
  return originalStartDate;
}

function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && dateString === date.toISOString().split('T')[0];
}

export function getBaseUri(countryCode) {
  return `https://ais.usvisa-info.com/en-${countryCode}/niv`;
}
function parseDateRanges(raw, fallbackMin, fallbackMax) {
  if (!raw) {
    return [{ start_date: fallbackMin, end_date: fallbackMax }];
  }
  let ranges;
  try {
    ranges = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid DATE_RANGES JSON: ${e.message}`);
  }
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('DATE_RANGES must be a non-empty array');
  }
  for (const r of ranges) {
    if (!r || !r.start_date || !r.end_date) {
      throw new Error('Each date range must have start_date and end_date');
    }
    if (!isValidDate(r.start_date) || !isValidDate(r.end_date)) {
      throw new Error(`Invalid date in range: ${JSON.stringify(r)}`);
    }
    if (new Date(r.start_date) > new Date(r.end_date)) {
      throw new Error(`start_date must be <= end_date in range: ${JSON.stringify(r)}`);
    }
  }
  return ranges;
}
