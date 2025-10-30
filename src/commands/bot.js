import { Bot } from '../lib/bot.js';
import { getConfig } from '../lib/config.js';
import { log, sleep, isSocketHangupError, sendErrorNotification } from '../lib/utils.js';
import pm2 from 'pm2';

const COOLDOWN = 60;
// const COOLDOWN = 3600; // 1 hour in seconds


export async function botCommand(options) {
  const config = getConfig();
  const bot = new Bot(config);
  let currentBookedDate = null; // Will be determined from config or API
  const targetDate = config.maxDate;
  const minDate = config.calculatedMinDate;

  // Enhanced logging with email and date range information
  log(`=== US Visa Bot Initialization ===`);
  log(`Email: ${config.email}`);
  log(`Country Code: ${config.countryCode}`);
  log(`Schedule ID: ${config.scheduleId}`);
  log(`Facility ID: ${config.facilityId}`);
  log(`Refresh Delay: ${config.refreshDelay} seconds`);
  log(`Days Before Booking: ${config.daysBeforeBooking}`);

  log(`Minimum acceptable date: ${minDate}`);
  log(`Maximum target date: ${targetDate}`);

  // Show search range summary
  log(`Search range: ${minDate} to ${targetDate}`);

  log(`=== Starting search loop ===`);

  try {
    const sessionHeaders = await bot.initialize();

    while (true) {
      const availableDate = await bot.checkAvailableDate(
        sessionHeaders,
        currentBookedDate
      );

      if (availableDate) {
        const booked = await bot.bookAppointment(sessionHeaders, availableDate);

        if (booked) {
          // Update current date to the new available date
          currentBookedDate = availableDate;

          options = {
            ...options,
            current: currentBookedDate
          };

          if (targetDate && availableDate <= targetDate) {
            log(`Target date reached! Successfully booked appointment on ${availableDate}`);
            
            // Stop PM2 process after successful booking
            try {
              pm2.connect((err) => {
                if (err) {
                  log(`PM2 connect error: ${err.message}`);
                  process.exit(0);
                  return;
                }
                
                pm2.stop(0, (err) => {
                  if (err) {
                    log(`PM2 stop error: ${err.message}`);
                  } else {
                    log('PM2 process stopped successfully');
                  }
                  pm2.disconnect();
                  process.exit(0);
                });
              });
            } catch (error) {
              log(`Error stopping PM2: ${error.message}`);
              process.exit(0);
            }
          }
        }
      }

      await sleep(config.refreshDelay);
    }
  } catch (err) {
    if (isSocketHangupError(err)) {
      const message = `Socket hangup error for ${config.email}: ${err.message}. Trying again after ${COOLDOWN} seconds...`;
      log(message);
      await sendErrorNotification(config, message);
      await sleep(COOLDOWN);
    } else {
      const message = `Session/authentication error for ${config.email}: ${err.message}. Retrying immediately...`;
      log(message);
      await sendErrorNotification(config, message);
    }
    return botCommand(options);
  }
}
