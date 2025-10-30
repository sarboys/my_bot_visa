import fetch from "node-fetch";
import * as cheerio from 'cheerio';
import { log, getRandomUserAgent } from './utils.js';
import { getBaseUri } from './config.js';

// Common headers
const COMMON_HEADERS = {
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-store'
};

// Function to get headers with specific User-Agent
function getHeadersWithUserAgent(userAgent, additionalHeaders = {}) {
  return {
    ...COMMON_HEADERS,
    'User-Agent': userAgent,
    ...additionalHeaders
  };
}

export class VisaHttpClient {
  constructor(countryCode, email, password) {
    this.baseUri = getBaseUri(countryCode);
    this.email = email;
    this.password = password;
    // Генерируем User-Agent один раз при создании экземпляра для поддержания сессии
    this.userAgent = getRandomUserAgent();
    log(`Using User-Agent for session: ${this.userAgent}`);
  }

  // Public API methods
  async login() {
    log('Logging in');

    const anonymousHeaders = await this._anonymousRequest(`${this.baseUri}/users/sign_in`)
      .then(response => this._extractHeaders(response));

    const loginData = {
      'utf8': '✓',
      'user[email]': this.email,
      'user[password]': this.password,
      'policy_confirmed': '1',
      'commit': 'Sign In'
    };

    return this._submitForm(`${this.baseUri}/users/sign_in`, anonymousHeaders, loginData)
      .then(res => ({
        ...anonymousHeaders,
        'Cookie': this._extractRelevantCookies(res)
      }));
  }

  async checkAvailableDate(headers, scheduleId, facilityId) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment/days/${facilityId}.json?appointments[expedite]=false`;
    return this._jsonRequest(url, headers)
      .then(data => data.map(item => item.date));
  }

  async checkAvailableTime(headers, scheduleId, facilityId, date) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment/times/${facilityId}.json?date=${date}&appointments[expedite]=false`;
    log(`Checking available times for ${date}: ${url}`);
    
    return this._jsonRequest(url, headers)
      .then(data => data['business_times'][0] || data['available_times'][0]);
  }

  async book(headers, scheduleId, facilityId, date, time) {
    const url = `${this.baseUri}/schedule/${scheduleId}/appointment`;

    log(`=== BOOKING REQUEST DETAILS ===`);
    log(`Booking URL: ${url}`);
    log(`Date: ${date}`);
    log(`Time: ${time}`);
    log(`Facility ID: ${facilityId}`);
    log(`Schedule ID: ${scheduleId}`);

    const bookingHeaders = await this._anonymousRequest(url, headers)
      .then(response => this._extractHeaders(response));

    const bookingData = {
      'utf8': '✓',
      'authenticity_token': bookingHeaders['X-CSRF-Token'],
      'confirmed_limit_message': '1',
      'use_consulate_appointment_capacity': 'true',
      'appointments[consulate_appointment][facility_id]': facilityId,
      'appointments[consulate_appointment][date]': date,
      'appointments[consulate_appointment][time]': time,
      'appointments[asc_appointment][facility_id]': '',
      'appointments[asc_appointment][date]': '',
      'appointments[asc_appointment][time]': ''
    };

    log(`=== BOOKING FORM DATA ===`);
    log(JSON.stringify(bookingData, null, 2));

    const response = await this._submitFormWithRedirect(url, bookingHeaders, bookingData);
    
    log(`=== BOOKING RESPONSE ===`);
    log(`Response Status: ${response.status} ${response.statusText}`);
    log(`Response URL: ${response.url}`);
    log(`Response Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));
    
    // Попытаемся получить текст ответа для логирования
    try {
      const responseText = await response.text();
      log(`Response Body Length: ${responseText.length} characters`);
      log(`=== FULL RESPONSE BODY ===`);
      log(responseText);
      log(`=== END OF RESPONSE BODY ===`);
      
      // Если ответ содержит HTML, попробуем найти важную информацию
      if (responseText.includes('<html') || responseText.includes('<!DOCTYPE')) {
        const $ = cheerio.load(responseText);
        const title = $('title').text();
        const alerts = $('.alert, .notice, .error, .success').map((i, el) => $(el).text().trim()).get();
        
        if (title) log(`Page Title: ${title}`);
        if (alerts.length > 0) log(`Page Alerts: ${JSON.stringify(alerts)}`);
      }
    } catch (error) {
      log(`Error reading response body: ${error.message}`);
    }

    return response;
  }

  // Private request methods
  async _anonymousRequest(url, headers = {}) {
    return fetch(url, {
      headers: getHeadersWithUserAgent(this.userAgent, {
        "Accept": "*/*",
        ...headers
      })
    });
  }

  async _jsonRequest(url, headers = {}) {
    return fetch(url, {
      headers: getHeadersWithUserAgent(this.userAgent, {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        ...headers
      }),
      cache: "no-store"
    })
      .then(r => r.json())
      .then(r => this._handleErrors(r));
  }

  async _submitForm(url, headers = {}, formData = {}) {
    return fetch(url, {
      method: "POST",
      headers: getHeadersWithUserAgent(this.userAgent, {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...headers
      }),
      body: new URLSearchParams(formData)
    });
  }

  async _submitFormWithRedirect(url, headers = {}, formData = {}) {
    const finalHeaders = getHeadersWithUserAgent(this.userAgent, {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...headers
    });
    
    log(`=== FORM SUBMISSION DETAILS ===`);
    log(`URL: ${url}`);
    log(`Method: POST`);
    log(`Headers:`, JSON.stringify(finalHeaders, null, 2));
    log(`Form Data:`, JSON.stringify(formData, null, 2));
    log(`URL Encoded Body: ${new URLSearchParams(formData).toString()}`);
    
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: finalHeaders,
      body: new URLSearchParams(formData)
    });

    log(`=== FORM SUBMISSION RESPONSE ===`);
    log(`Status: ${response.status} ${response.statusText}`);
    log(`Final URL after redirects: ${response.url}`);
    log(`Response Headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

    return response;
  }

  // Private utility methods
  async _extractHeaders(res) {
    const cookies = this._extractRelevantCookies(res);
    const html = await res.text();
    const $ = cheerio.load(html);
    const csrfToken = $('meta[name="csrf-token"]').attr('content');

    return {
      ...COMMON_HEADERS,
      "Cookie": cookies,
      "X-CSRF-Token": csrfToken,
      "Referer": this.baseUri,
      "Referrer-Policy": "strict-origin-when-cross-origin"
    };
  }

  _extractRelevantCookies(res) {
    const parsedCookies = this._parseCookies(res.headers.get('set-cookie'));
    return `_yatri_session=${parsedCookies['_yatri_session']}`;
  }

  _parseCookies(cookies) {
    const parsedCookies = {};

    cookies.split(';').map(c => c.trim()).forEach(c => {
      const [name, value] = c.split('=', 2);
      parsedCookies[name] = value;
    });

    return parsedCookies;
  }

  _handleErrors(response) {
    const errorMessage = response['error'];

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return response;
  }
}
