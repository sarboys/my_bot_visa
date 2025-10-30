import { VisaHttpClient } from './client.js';
import { log, sendErrorNotification, sendImportantNotification } from './utils.js';
1
export class Bot {
  constructor(config, options = {}) {
    this.config = config;
    this.client = new VisaHttpClient(this.config.countryCode, this.config.email, this.config.password);
  }

  async initialize() {
    log('Initializing visa bot...');
    return await this.client.login();
  }

  async checkAvailableDate(sessionHeaders, currentBookedDate) {
    // Log search parameters
    // log(`Searching for available dates for email: ${this.config.email}`);
    // log(`Minimum acceptable date: ${this.config.calculatedMinDate}`);
    // log(`Maximum target date: ${this.config.maxDate}`);

    // if (currentBookedDate) {
      // log(`Current booked date: ${currentBookedDate}`);
    // } else {
      //log(`No current booking - will book any suitable date in range`);
    // }
 
    const dates = await this.client.checkAvailableDate(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId
    );

    if (!dates || dates.length === 0) {
      const message = `No dates available for: ${this.config.email}`;
      log(message);
      await sendErrorNotification(this.config, message);
      return null;
    }

    log(`Found ${dates.length} available dates: ${dates.join(', ')}`);
    
    // Send notification about found dates
    if (dates.length > 0) {
      const message = `📅 <b>Available Dates Found:</b>\n${dates.map(date => `• ${date}`).join('\n')}`;
      await sendImportantNotification(this.config, 'Available Dates Found', message);
    }

    // Filter dates that are better than current booked date and within acceptable range
    const goodDates = dates.filter(date => {
      if (currentBookedDate && date >= currentBookedDate) {
        log(`date ${date} is further than already booked (${currentBookedDate})`);
        return false;
      }

      if (date < this.config.calculatedMinDate) {
        log(`date ${date} is before minimum date (${this.config.calculatedMinDate})`);
        return false;
      }

      if (date > this.config.maxDate) {
        log(`date ${date} is after maximum date (${this.config.maxDate})`);
        return false;
      }

      return true;
    });

    if (goodDates.length === 0) {
      log("no good dates found after filtering");
      return null;
    }

    // Sort dates and return the earliest one
    goodDates.sort();
    const earliestDate = goodDates[0];
    
    log(`found ${goodDates.length} good dates: ${goodDates.join(', ')}, using earliest: ${earliestDate}`);
    
    // Send notification about good dates
    const message = `🎯 <b>Good Dates After Filtering:</b>\n${goodDates.map(date => `• ${date}`).join('\n')}\n\n<b>Selected Date:</b> ${earliestDate}`;
    await sendImportantNotification(this.config, 'Good Dates Found', message);
    
    return earliestDate;
  }

  async bookAppointment(sessionHeaders, date) {
    const time = await this.client.checkAvailableTime(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId,
      date
    );

    if (!time) {
      log(`no available time slots for date ${date}`);
      return false;
    }

    await this.client.book(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId,
      date,
      time
    );

    log(`booked time at ${date} ${time}`);
    
    // Send notification about successful booking
    const message = `🎉 <b>APPOINTMENT SUCCESSFULLY BOOKED!</b>\n\n<b>Date:</b> ${date}\n<b>Time:</b> ${time}\n\n<b>Facility ID:</b> ${this.config.facilityId}\n<b>Schedule ID:</b> ${this.config.scheduleId}`;
    await sendImportantNotification(this.config, 'SUCCESSFUL BOOKING', message);
    
    return true;
  }

}
