#!/usr/bin/env node

import fetch from "node-fetch";
import cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL = process.env.EMAIL
const PASSWORD = process.env.PASSWORD
const SCHEDULE_ID = process.env.SCHEDULE_ID
const FACILITY_ID = process.env.FACILITY_ID
const LOCALE = process.env.LOCALE
const DAYS_BEFORE_BOOKING = parseInt(process.env.DAYS_BEFORE_BOOKING) || 0
const END_DATE = process.env.END_DATE || '2025-12-15'

// Функция для расчета START_DATE с учетом days_before_booking
function calculateStartDate() {
  const originalStartDate = process.env.START_DATE || '2025-11-25'
  
  // Если указан DAYS_BEFORE_BOOKING, проверяем нужно ли сдвинуть дату
  if (DAYS_BEFORE_BOOKING > 0) {
    const today = new Date()
    const startDate = new Date(originalStartDate)
    
    // Вычисляем разность в днях между сегодня и начальной датой
    const diffTime = startDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Если до начальной даты остается меньше чем days_before_booking дней,
    // сдвигаем начальную дату вперед
    if (diffDays < DAYS_BEFORE_BOOKING) {
      const shiftedDate = new Date(today)
      shiftedDate.setDate(today.getDate() + DAYS_BEFORE_BOOKING)
      return shiftedDate.toISOString().split('T')[0]
    }
  }
  
  return originalStartDate
}

const START_DATE = calculateStartDate()
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8378702542:AAEhOLmL3Y9QUOWXO2A1pISIOSMXqq3y3k4'
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '126633141'

// Специальный бот для важных событий (найденные даты и успешные записи)
const SPECIAL_BOT_TOKEN = process.env.SPECIAL_BOT_TOKEN || '8051057939:AAEfPFNypptmXtwo5eaeMkK93x1KxhFpenI'
const SPECIAL_CHAT_ID = process.env.SPECIAL_CHAT_ID || '126633141'

const BASE_URI = `https://ais.usvisa-info.com/${LOCALE}/niv`

// Массив User-Agent для ротации
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
]

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function createFetchOptions(additionalOptions = {}) {
  const userAgent = getRandomUserAgent()
  
  const options = {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive',
      'DNT': '1',
      'Sec-GPC': '1',
      ...additionalOptions.headers
    },
    ...additionalOptions
  }
  
  return options
}

// Счетчик ошибок для circuit breaker
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5

function resetErrorCounter() {
  consecutiveErrors = 0
}

function incrementErrorCounter() {
  consecutiveErrors++
}

function shouldCircuitBreak() {
  return consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
}

async function main() {
  if (!EMAIL || !PASSWORD || !SCHEDULE_ID || !FACILITY_ID || !LOCALE) {
    log(`Missing required env variables`)
    await sendTelegramMessage(`❌ Missing required env variables`)
    process.exit(1)
  }

  log(`Starting monitoring for ${EMAIL}, range ${START_DATE} to ${END_DATE} (DAYS_BEFORE_BOOKING: ${DAYS_BEFORE_BOOKING}, original START_DATE: ${process.env.START_DATE || 'not set'})`)
  await sendTelegramMessage(`🔔 Started monitoring for ${EMAIL} in range ${START_DATE} to ${END_DATE}`)

  let sessionHeaders = null
  let lastLoginTime = 0
  const SESSION_REFRESH_INTERVAL = 15 * 60 * 1000 // 15 минут в миллисекундах
  let requestCount = 0

  try {
    while (true) {
      // Проверяем circuit breaker
      if (shouldCircuitBreak()) {
        log(`Circuit breaker activated after ${consecutiveErrors} consecutive errors. Waiting 30 minutes...`)
        await sendTelegramMessage(`🔴 Circuit breaker activated for ${EMAIL}. Too many consecutive errors. Waiting 30 minutes...`)
        await sleep(1800) // Ждем 30 минут
        consecutiveErrors = 0 // Сбрасываем счетчик после длительной паузы
        continue
      }

      // Проверяем нужно ли переподключиться
      const currentTime = Date.now()
      const needsRelogin = !sessionHeaders || 
                          (currentTime - lastLoginTime > SESSION_REFRESH_INTERVAL) ||
                          (requestCount > 0 && requestCount % 20 === 0) // Каждые 20 запросов

      if (needsRelogin) {
        log(`${sessionHeaders ? 'Re-logging in' : 'Logging in'} (${sessionHeaders ? 'session refresh' : 'initial login'})`)
        try {
          sessionHeaders = await login()
          lastLoginTime = currentTime
          requestCount = 0
          resetErrorCounter() // Сбрасываем счетчик при успешном логине
          log(`Login successful, session refreshed`)
        } catch (loginError) {
          log(`Login failed: ${loginError.message}`)
          await sendTelegramMessage(`❌ Login failed for ${EMAIL}: ${loginError.message}`)
          incrementErrorCounter()
          
          // Ждем дольше при ошибке логина
          const loginBackoff = Math.min(300 * Math.pow(2, consecutiveErrors - 1), 1800) // От 5 минут до 30 минут
          log(`Login backoff: waiting ${loginBackoff} seconds`)
          await sleep(loginBackoff)
          continue
        }
      }

      requestCount++

      try {
        // Задержка удалена для максимальной скорости проверки дат
        log(`Checking available dates immediately for maximum speed`)
        
        const dateResponse = await checkAvailableDate(sessionHeaders)
        log(`Available dates response: ${JSON.stringify(dateResponse, null, 2)}`)

        // Отправляем полный ответ сервера для анализа дат
        if (dateResponse.raw && dateResponse.raw.length > 0) {
          await sendSpecialTelegramMessage(`📋 ПОЛНЫЙ ОТВЕТ СЕРВЕРА ДЛЯ ДАТ:\n\n` +
            `🔍 Запрос: проверка доступных дат\n` +
            `📊 Найдено дат: ${dateResponse.raw.length}\n\n` +
            `📄 Полный JSON ответ:\n${JSON.stringify(dateResponse.raw, null, 2)}\n\n` +
            `---END OF DATES RESPONSE---`)
        }

        // Отправляем информацию о всех найденных датах (если есть)
        if (dateResponse.raw && dateResponse.raw.length > 0) {
          const allFoundDates = dateResponse.raw.map(item => item.date).sort()
          await sendSpecialTelegramMessage(`🗓️ ALL FOUND DATES (${allFoundDates.length} total) for ${EMAIL}: ${allFoundDates.join(', ')}`)
        }

        if (!dateResponse.date) {
          log(`No dates available in range ${START_DATE} to ${END_DATE}`)
          await sendTelegramMessage(`📅 No dates available for ${EMAIL} in range ${START_DATE} to ${END_DATE}`)
          resetErrorCounter() // Сбрасываем при успешном запросе
        } else {
          // Логируем все найденные даты в нашем диапазоне
          if (dateResponse.allDates && dateResponse.allDates.length > 0) {
            log(`Found ${dateResponse.allDates.length} available dates: ${dateResponse.allDates.join(', ')}`)
            await sendSpecialTelegramMessage(`✅ SUITABLE DATES (${dateResponse.allDates.length} in range ${START_DATE} to ${END_DATE}) for ${EMAIL}: ${dateResponse.allDates.join(', ')} #success`)
          } else {
            log(`Found date: ${dateResponse.date}`)
            await sendSpecialTelegramMessage(`✅ SUITABLE DATE for ${EMAIL}: ${dateResponse.date} #success`)
          }
          resetErrorCounter() // Сбрасываем при успешном запросе

          // Задержка удалена для мгновенной проверки времени
          log(`Checking time slots immediately for maximum speed`)

          const timeResponse = await checkAvailableTime(sessionHeaders, dateResponse.date)

          // Отправляем полный ответ сервера для анализа времени
          if (timeResponse.raw) {
            await sendSpecialTelegramMessage(`📋 ПОЛНЫЙ ОТВЕТ СЕРВЕРА ДЛЯ ВРЕМЕНИ:\n\n` +
              `🔍 Запрос: проверка доступного времени для ${dateResponse.date}\n` +
              `📊 Business times: ${timeResponse.businessTimes?.length || 0}\n` +
              `📊 Available times: ${timeResponse.availableTimes?.length || 0}\n\n` +
              `📄 Полный JSON ответ:\n${JSON.stringify(timeResponse.raw, null, 2)}\n\n` +
              `---END OF TIME RESPONSE---`)
          }

          if (!timeResponse.time) {
            log(`No time slots for ${dateResponse.date}`)
            await sendTelegramMessage(`⏰ No time slots for ${EMAIL} on ${dateResponse.date}`)
          } else {
            // Логируем все найденные времена
            if (timeResponse.allTimes && timeResponse.allTimes.length > 0) {
              log(`Found ${timeResponse.allTimes.length} available times for ${dateResponse.date}: ${timeResponse.allTimes.join(', ')}`)
              await sendSpecialTelegramMessage(`⏰ Found ${timeResponse.allTimes.length} times for ${EMAIL} on ${dateResponse.date}: ${timeResponse.allTimes.join(', ')} #success`)
            } else {
              log(`Found time: ${timeResponse.time}`)
            }
            
            log(`Attempting to book ${dateResponse.date} ${timeResponse.time}`)
            await sendSpecialTelegramMessage(`🎯 Attempting to book for ${EMAIL}: ${dateResponse.date} ${timeResponse.time}`)
            
            // Задержка удалена для мгновенного бронирования
            log(`Booking immediately without delay for maximum speed`)
            
            try {
              const bookingResponse = await book(sessionHeaders, dateResponse.date, timeResponse.time)
              const bookingText = await bookingResponse.text()
              
              // Логируем полный ответ для диагностики
              log(`Booking response status: ${bookingResponse.status}`)
              log(`Booking response text (first 500 chars): ${bookingText.substring(0, 500)}`)
              
              // Отправляем полный ответ сервера в Telegram для анализа
              await sendSpecialTelegramMessage(`📋 ПОЛНЫЙ ОТВЕТ СЕРВЕРА ПРИ БРОНИРОВАНИИ:\n\n` +
                `📧 Email: ${EMAIL}\n` +
                `🔢 HTTP Status: ${bookingResponse.status}\n\n` +
                `📄 Полный ответ сервера:\n${bookingText}\n\n` +
                `⏰ Время запроса: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`
              )
              
              // Проверяем успешность ТОЛЬКО через верификацию изменения дат
              // HTTP статус может быть 200 даже при неуспешном бронировании
              log(`📋 Booking request completed, verifying result through date change check...`)
              
              let bookingSuccessful = false
              
              try {
                const verificationResponse = await checkAvailableDate(sessionHeaders)
                
                // Проверяем, изменились ли доступные даты (если запись прошла успешно, должны измениться)
                if (verificationResponse && verificationResponse.date) {
                  const newNearestDate = verificationResponse.date
                  log(`🔍 Verification check: new nearest date is ${newNearestDate}`)
                  
                  if (newNearestDate !== dateResponse.date) {
                    log(`✅ BOOKING SUCCESSFUL: nearest date changed from ${dateResponse.date} to ${newNearestDate}`)
                    bookingSuccessful = true
                  } else {
                    log(`❌ BOOKING FAILED: nearest date unchanged (${dateResponse.date})`)
                    bookingSuccessful = false
                  }
                } else {
                  log(`⚠️ Verification failed: could not get new date information`)
                  bookingSuccessful = false
                }
              } catch (verificationError) {
                log(`⚠️ Verification check failed: ${verificationError.message}`)
                bookingSuccessful = false
              }
              
              if (bookingSuccessful) {
                log(`🎉 Successfully booked ${dateResponse.date} ${timeResponse.time}`)
                await sendSpecialTelegramMessage(`🎉🎉🎉 УСПЕШНАЯ ЗАПИСЬ! 🎉🎉🎉\n\n✅ Appointment successfully booked for ${EMAIL}:\n📅 Date: ${dateResponse.date}\n⏰ Time: ${timeResponse.time}\n\n🎯 Monitoring stopped. Mission accomplished! #success #booked`)
                log(`Booking completed successfully. Stopping monitoring.`)
                process.exit(0) // Останавливаем процесс после успешной записи
              } else {
                log(`❌ Booking verification failed for ${dateResponse.date} ${timeResponse.time}`)
                await sendSpecialTelegramMessage(`❌ Booking failed for ${EMAIL}: ${dateResponse.date} ${timeResponse.time}\n\n🔍 Verification method: Date change check\n📊 HTTP Status: ${bookingResponse.status}\n\n📄 Полный ответ сервера был отправлен выше для анализа.`)
              }
            } catch (bookingError) {
              log(`❌ Booking error: ${bookingError.message}`)
              await sendSpecialTelegramMessage(`❌ Booking error for ${EMAIL}: ${bookingError.message}`)
              
              // Если ошибка связана с сессией, принудительно переподключаемся
              if (bookingError.message.includes('Empty response') || 
                  bookingError.message.includes('Invalid JSON') ||
                  bookingError.message.includes('401') ||
                  bookingError.message.includes('403')) {
                log(`Session might be expired, forcing re-login`)
                sessionHeaders = null
                lastLoginTime = 0
              }
              incrementErrorCounter()
            }
          }
        }
      } catch (apiError) {
        log(`API Error: ${apiError.message}`)
        
        // Если получили пустой ответ или ошибку парсинга JSON, возможно сессия истекла
        if (apiError.message.includes('Empty response') || 
            apiError.message.includes('Invalid JSON') ||
            apiError.message.includes('401') ||
            apiError.message.includes('403')) {
          log(`Possible session expiration, forcing re-login`)
          await sendTelegramMessage(`🔄 Session expired for ${EMAIL}, re-logging in...`)
          sessionHeaders = null
          lastLoginTime = 0
          continue // Пропускаем задержку и сразу переподключаемся
        }
        
        incrementErrorCounter()
        throw apiError // Передаем ошибку дальше для общей обработки
      }

      const delay = randomDelay(10, 20) // Минимальная задержка 5-15 секунд для максимальной скорости
      log(`Main loop delay: waiting ${delay} seconds`)
      await sleep(delay)
    }

  } catch (err) {
    log(`Error: ${err.message}`)
    incrementErrorCounter()
    
    // Расширенная проверка типа ошибки для разной обработки
    if (err.message.includes('ECONNREFUSED') || 
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('TLS connection') ||
        err.message.includes('socket disconnected')) {
      log(`Network/Connection error detected: ${err.message}`)
      await sendTelegramMessage(`🚫 Network error for ${EMAIL}: ${err.message}\nWaiting 10 minutes before retry...`)
      await sleep(600) // Ждем 10 минут при сетевых ошибках
    } else if (err.message.includes('403') || err.message.includes('Forbidden')) {
      log(`Access forbidden error. Waiting 15 minutes before retry...`)
      await sendTelegramMessage(`❌ 403 Forbidden for ${EMAIL}. Waiting 15 minutes...`)
      await sleep(900) // Ждем 15 минут при 403 ошибках
    } else {
      await sendTelegramMessage(`❌ Error for ${EMAIL}: ${err.message}\nRetrying...`)
      
      // Экспоненциальная задержка в зависимости от количества ошибок
      const backoffDelay = Math.min(120 * Math.pow(2, consecutiveErrors - 1), 1800) // Максимум 30 минут
      log(`Exponential backoff: waiting ${backoffDelay} seconds`)
      await sleep(backoffDelay)
    }
    
    main()
  }
}

async function login() {
  log(`Logging in`)

  const makeRequest = async () => {
    const options = {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive'
      }
    }

    return fetch(`${BASE_URI}/users/sign_in`, options)
  }

  const anonymousHeaders = await makeRequest()
    .then(async response => {
      log(`Login page response status: ${response.status}`)
      
      if (!response.ok) {
        throw new Error(`Login page request failed: ${response.status} ${response.statusText}`)
      }
      return extractHeaders(response)
    })

  return fetch(`${BASE_URI}/users/sign_in`, createFetchOptions({
    "headers": Object.assign({}, anonymousHeaders, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    }),
    "method": "POST",
    "body": new URLSearchParams({
      'utf8': '✓',
      'user[email]': EMAIL,
      'user[password]': PASSWORD,
      'policy_confirmed': '1',
      'commit': 'Acessar'
    })
  }))
    .then(async res => {
      log(`Login POST response status: ${res.status}`)
      if (!res.ok) {
        const errorText = await res.text()
        log(`Login failed. Response: ${errorText.substring(0, 500)}...`)
        throw new Error(`Login failed: ${res.status} ${res.statusText}`)
      }
      return Object.assign({}, anonymousHeaders, {
        'Cookie': extractRelevantCookies(res)
      })
    })
}

function checkAvailableDate(headers) {
  return fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/days/${FACILITY_ID}.json?appointments[expedite]=false`, createFetchOptions({
    "headers": Object.assign({}, headers, {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    }),
    "cache": "no-store"
  }))
    .then(async r => {
      const responseText = await r.text()
      log(`Date API response status: ${r.status}, body length: ${responseText.length}`)
      
      if (!responseText.trim()) {
        throw new Error('Empty response from date API')
      }
      
      try {
        return JSON.parse(responseText)
      } catch (parseError) {
        log(`JSON parse error. Response text: ${responseText.substring(0, 500)}...`)
        throw new Error(`Invalid JSON response: ${parseError.message}`)
      }
    })
    .then(r => handleErrors(r))
    .then(d => {
      // Log ALL found dates before filtering
      const allFoundDates = d.map(item => item.date).sort()
      if (allFoundDates.length > 0) {
        log(`🗓️ ALL FOUND DATES (${allFoundDates.length} total): ${allFoundDates.join(', ')}`)
      } else {
        log(`🗓️ NO DATES FOUND`)
      }
      
      // Filter dates within the specified range
      const filteredDates = d.filter(item => item.date >= START_DATE && item.date <= END_DATE)
      log(`✅ Filtered dates in range ${START_DATE} to ${END_DATE}: ${JSON.stringify(filteredDates, null, 2)}`)
      
      // Sort by date
      filteredDates.sort((a, b) => a.date.localeCompare(b.date))
      
      // Return all filtered dates and the earliest one for backward compatibility
      const nearestDate = filteredDates.length > 0 ? filteredDates[0].date : null
      const allDates = filteredDates.map(item => item.date)
      
      return { 
        date: nearestDate, 
        allDates: allDates,
        raw: d, 
        filtered: filteredDates 
      }
    })
}

function checkAvailableTime(headers, date) {
  return fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/times/${FACILITY_ID}.json?date=${date}&appointments[expedite]=false`, createFetchOptions({
    "headers": Object.assign({}, headers, {
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin"
    }),
    "cache": "no-store"
  }))
    .then(async r => {
      const responseText = await r.text()
      log(`Time API response status: ${r.status}, body length: ${responseText.length}`)
      
      if (!responseText.trim()) {
        throw new Error('Empty response from time API')
      }
      
      try {
        return JSON.parse(responseText)
      } catch (parseError) {
        log(`JSON parse error. Response text: ${responseText.substring(0, 500)}...`)
        throw new Error(`Invalid JSON response: ${parseError.message}`)
      }
    })
    .then(r => handleErrors(r))
    .then(d => {
      const businessTimes = d['business_times'] || []
      const availableTimes = d['available_times'] || []
      const allTimes = [...businessTimes, ...availableTimes]
      
      // Return all available times and the first one for backward compatibility
      const firstTime = businessTimes[0] || availableTimes[0]
      
      return {
        time: firstTime,
        allTimes: allTimes,
        businessTimes: businessTimes,
        availableTimes: availableTimes,
        raw: d
      }
    })
}

function handleErrors(response) {
  const errorMessage = response['error']

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return response
}

async function book(headers, date, time) {
  const url = `${BASE_URI}/schedule/${SCHEDULE_ID}/appointment`

  const newHeaders = await fetch(url, { "headers": headers })
    .then(response => extractHeaders(response))

  return fetch(url, {
    "method": "POST",
    "redirect": "follow",
    "headers": Object.assign({}, newHeaders, {
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    "body": new URLSearchParams({
      'utf8': '✓',
      'authenticity_token': newHeaders['X-CSRF-Token'],
      'confirmed_limit_message': '1',
      'use_consulate_appointment_capacity': 'true',
      'appointments[consulate_appointment][facility_id]': FACILITY_ID,
      'appointments[consulate_appointment][date]': date,
      'appointments[consulate_appointment][time]': time,
      'appointments[asc_appointment][facility_id]': '',
      'appointments[asc_appointment][date]': '',
      'appointments[asc_appointment][time]': ''
    }),
  })
}

async function extractHeaders(res) {
  const cookies = extractRelevantCookies(res)

  const html = await res.text()
  const $ = cheerio.load(html);
  const csrfToken = $('meta[name="csrf-token"]').attr('content')

  return {
    "Cookie": cookies,
    "X-CSRF-Token": csrfToken,
    "Referer": BASE_URI,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive'
  }
}

function extractRelevantCookies(res) {
  const parsedCookies = parseCookies(res.headers.get('set-cookie'))
  return `_yatri_session=${parsedCookies['_yatri_session']}`
}

function parseCookies(cookies) {
  const parsedCookies = {}

  cookies.split(';').map(c => c.trim()).forEach(c => {
    const [name, value] = c.split('=', 2)
    parsedCookies[name] = value
  })

  return parsedCookies
}

function sleep(s) {
  return new Promise((resolve) => {
    setTimeout(resolve, s * 1000);
  });
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function sendTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    })
    
    if (!response.ok) {
      log(`Failed to send Telegram message: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    log(`Error sending Telegram message: ${error.message}`)
  }
}

// Функция для отправки важных событий в специальный бот
async function sendSpecialTelegramMessage(message) {
  try {
    const url = `https://api.telegram.org/bot${SPECIAL_BOT_TOKEN}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: SPECIAL_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    })
    
    if (!response.ok) {
      log(`Failed to send special Telegram message: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    log(`Error sending special Telegram message: ${error.message}`)
  }
}

function log(message) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

main()