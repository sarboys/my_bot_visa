import { VisaHttpClient } from './client.js';
import { calculateStartDate } from './config.js';
import { log, sendErrorNotification, sendImportantNotification, getRandomDelay, sleep } from './utils.js';
1
export class Bot {
  constructor(config, options = {}) {
    this.config = config;
    this.client = new VisaHttpClient(this.config.countryCode, this.config.email, this.config.password);
  }

  async initialize() {
    // log('Initializing visa bot...');
    return await this.client.login();
  }

  async checkAvailableDate(sessionHeaders, currentBookedDate) {
    // Add random delay before checking dates to avoid detection
    const randomDelay = getRandomDelay();
    log(`Waiting ${randomDelay} seconds before checking available dates...`);
    await sleep(randomDelay);

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
      return null;
    }

    // log(`Found ${dates.length} available dates: ${dates.join(', ')}`);
    // const rangesSummary = (this.config.dateRanges || [{ start_date: this.config.calculatedMinDate, end_date: this.config.maxDate }])
    //   .map(r => `${r.start_date}..${r.end_date}`).join(', ');
    // log(`Search ranges: ${rangesSummary}`);
    
    // if (dates.length > 0) {
    //   const message = `📅 <b>Available Dates Found:</b>\n${dates.map(date => `• ${date}`).join('\n')}`;
    //   await sendImportantNotification(this.config, 'Available Dates Found', message);
    // }

    // Filter dates that are better than current booked date and within acceptable range
    const goodDates = dates.filter(date => {
      if (currentBookedDate && date >= currentBookedDate) {
        return false;
      }
      // In-range check across multiple intervals
      const inAnyRange = (this.config.dateRanges || [{ start_date: this.config.calculatedMinDate, end_date: this.config.maxDate }])
        .some(r => {
          const start = calculateStartDate(r.start_date, this.config.daysBeforeBooking);
          const end = r.end_date;
          const ok = date >= start && date <= end;
          if (!ok) return false;
          return true;
        });
      if (!inAnyRange) {
        return false;
      }
      return true;
    });

    if (goodDates.length === 0) {
      return null;
    }

    // Sort dates and return the earliest one
    goodDates.sort();
    const earliestDate = goodDates[0];
    
    // log(`found ${goodDates.length} good dates: ${goodDates.join(', ')}, using earliest: ${earliestDate}`);
    
    // Send notification about good dates
    // const message = `🎯 <b>Good Dates After Filtering:</b>\n${goodDates.map(date => `• ${date}`).join('\n')}\n\n<b>Selected Date:</b> ${earliestDate}`;
    // await sendImportantNotification(this.config, 'Good Dates Found', message);
    
    return earliestDate;
  }

  async bookAppointment(sessionHeaders, date) {
    const times = await this.client.getAvailableTimes(
      sessionHeaders,
      this.config.scheduleId,
      this.config.facilityId,
      date
    );

    if (!times || times.length === 0) {
      return false;
    }

    // const timesMsg = `⏰ <b>Available Times Found:</b>\n${times.map(t => `• ${t}`).join('\n')}\n\n<b>Date:</b> ${date}`;
    // await sendImportantNotification(this.config, 'Available Times Found', timesMsg);

    const bookingHeaders = await this.client.getBookingHeaders(
      sessionHeaders,
      this.config.scheduleId
    );

    for (const time of [...times].reverse()) {
      const bookingResult = await this.client.book(
        sessionHeaders,
        this.config.scheduleId,
        this.config.facilityId,
        date,
        time,
        bookingHeaders
      );
      if (bookingResult?.busy) {
        const msg = `❌ Booking failed: System is busy. Please try again later.\n\n<b>Date:</b> ${date}\n<b>Time:</b> ${time}\n<b>Alerts:</b> ${bookingResult.alerts && bookingResult.alerts.length ? bookingResult.alerts.join(' | ') : 'none'}`;
        await sendImportantNotification(this.config, 'BOOKING FAILED', msg);
        continue;
      }
      // log(`booked time at ${date} ${time}`);
      const message = `🎉 <b>APPOINTMENT SUCCESSFULLY BOOKED!</b>\n\n<b>Date:</b> ${date}\n<b>Time:</b> ${time}\n\n<b>Facility ID:</b> ${this.config.facilityId}\n<b>Schedule ID:</b> ${this.config.scheduleId}`;
      await sendImportantNotification(this.config, 'SUCCESSFUL BOOKING', message);
      return true;
    }
    return false;
  }

}
