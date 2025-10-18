# US Visa Bot - Полная Логика Работы

## Обзор
Этот документ описывает полную логику работы бота для автоматического бронирования визовых интервью в посольстве США. Бот работает в непрерывном цикле, проверяя доступные даты и автоматически бронируя подходящие слоты.

## 1. Инициализация и Настройка Окружения

### 1.1 Загрузка Зависимостей
```javascript
import fetch from "node-fetch";
import cheerio from 'cheerio';
import dotenv from 'dotenv';
```

### 1.2 Загрузка Переменных Окружения
Бот загружает конфигурацию из `.env` файла:
- `EMAIL` - Email для входа в систему
- `PASSWORD` - Пароль для входа
- `SCHEDULE_ID` - ID расписания
- `FACILITY_ID` - ID учреждения (посольства)
- `LOCALE` - Локаль (например, 'ru-ru')
- `START_DATE` - Начальная дата поиска (по умолчанию '2025-11-25')
- `END_DATE` - Конечная дата поиска (по умолчанию '2025-12-15')
- `TELEGRAM_BOT_TOKEN` - Токен Telegram бота для уведомлений
- `TELEGRAM_CHAT_ID` - ID чата для отправки уведомлений

### 1.3 Константы и Конфигурация
- `BASE_URI` - Базовый URL API: `https://ais.usvisa-info.com/${LOCALE}/niv`
- `USER_AGENTS` - Массив из 5 различных User-Agent строк для ротации
- `MAX_CONSECUTIVE_ERRORS` = 5 - Максимальное количество последовательных ошибок
- `SESSION_REFRESH_INTERVAL` = 20 - Интервал обновления сессии (каждые 20 запросов)

## 2. Основной Цикл Работы (main function)

### 2.1 Проверка Переменных Окружения
Бот проверяет наличие всех необходимых переменных окружения и завершает работу с ошибкой, если что-то отсутствует.

### 2.2 Инициализация Счетчиков
- `consecutiveErrors = 0` - Счетчик последовательных ошибок
- `requestCount = 0` - Счетчик запросов для обновления сессии
- `headers = null` - Заголовки аутентификации

### 2.3 Бесконечный Цикл Мониторинга
```javascript
while (true) {
  // Логика работы бота
}
```

## 3. Circuit Breaker (Автоматический Выключатель)

### 3.1 Проверка Состояния
Если `consecutiveErrors >= MAX_CONSECUTIVE_ERRORS`:
- Логирует активацию circuit breaker
- Ждет 30 минут (`sleep(30 * 60)`)
- Сбрасывает счетчик ошибок
- Принудительно обновляет сессию (`headers = null`)

### 3.2 Функции Управления Ошибками
- `resetErrorCounter()` - Сбрасывает счетчик ошибок
- `incrementErrorCounter()` - Увеличивает счетчик ошибок
- `shouldCircuitBreak()` - Проверяет необходимость активации circuit breaker

## 4. Управление Сессией и Аутентификация

### 4.1 Условия Обновления Сессии
Сессия обновляется если:
- `headers === null` (первый запуск или принудительное обновление)
- `requestCount % SESSION_REFRESH_INTERVAL === 0` (каждые 20 запросов)

### 4.2 Процесс Входа (login function)

#### 4.2.1 Получение Страницы Входа
```javascript
const loginPageResponse = await fetch(`${BASE_URI}/users/sign_in`, createFetchOptions())
```

#### 4.2.2 Извлечение CSRF Токена
Использует Cheerio для парсинга HTML и извлечения `csrf-token` из мета-тега.

#### 4.2.3 Отправка Данных Входа
```javascript
const loginResponse = await fetch(`${BASE_URI}/users/sign_in`, {
  method: "POST",
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': getRandomUserAgent()
  },
  body: new URLSearchParams({
    'utf8': '✓',
    'user[email]': EMAIL,
    'user[password]': PASSWORD,
    'policy_confirmed': '1',
    'authenticity_token': csrfToken
  })
})
```

#### 4.2.4 Извлечение Заголовков Сессии
Функция `extractHeaders()` извлекает:
- Cookies (особенно `_yatri_session`)
- CSRF токен из HTML страницы
- Устанавливает стандартные заголовки

## 5. Создание Опций Запросов (createFetchOptions)

### 5.1 Базовые Заголовки
```javascript
{
  'User-Agent': getRandomUserAgent(),
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
}
```

### 5.2 Ротация User-Agent
Функция `getRandomUserAgent()` случайно выбирает один из 5 предустановленных User-Agent строк для имитации разных браузеров.

## 6. Проверка Доступных Дат (checkAvailableDate)

### 6.1 API Запрос
```javascript
fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/days/${FACILITY_ID}.json?appointments[expedite]=false`)
```

### 6.2 Обработка Ответа
- Проверяет статус ответа
- Валидирует JSON
- Логирует все найденные даты
- Фильтрует даты по диапазону `START_DATE` - `END_DATE`
- Сортирует по дате

### 6.3 Возвращаемые Данные
```javascript
{
  date: nearestDate,        // Ближайшая доступная дата
  allDates: allDates,       // Все доступные даты в диапазоне
  raw: d,                   // Сырые данные от API
  filtered: filteredDates   // Отфильтрованные данные
}
```

## 7. Проверка Доступного Времени (checkAvailableTime)

### 7.1 API Запрос
```javascript
fetch(`${BASE_URI}/schedule/${SCHEDULE_ID}/appointment/times/${FACILITY_ID}.json?date=${date}&appointments[expedite]=false`)
```

### 7.2 Обработка Времени
- Извлекает `business_times` и `available_times`
- Объединяет все доступные времена
- Приоритизирует `business_times`

### 7.3 Возвращаемые Данные
```javascript
{
  time: firstTime,              // Первое доступное время
  allTimes: allTimes,           // Все доступные времена
  businessTimes: businessTimes, // Рабочие часы
  availableTimes: availableTimes, // Доступные времена
  raw: d                        // Сырые данные
}
```

## 8. Процесс Бронирования (book function)

### 8.1 Получение Свежих Заголовков
```javascript
const newHeaders = await fetch(url, { "headers": headers })
  .then(response => extractHeaders(response))
```

### 8.2 Отправка Запроса Бронирования
```javascript
fetch(url, {
  "method": "POST",
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
  })
})
```

## 9. Логика Основного Цикла

### 9.1 Проверка Доступности
```javascript
const { date, allDates } = await checkAvailableDate(headers)
```

### 9.2 Условие Бронирования
Если найдена доступная дата:
1. Получает доступное время для даты
2. Если время найдено - выполняет бронирование
3. Логирует полный ответ сервера
4. Проверяет успешность бронирования

### 9.3 Верификация Успешного Бронирования
После бронирования проверяет изменение доступных дат:
```javascript
const { allDates: newAllDates } = await checkAvailableDate(headers)
if (JSON.stringify(allDates) !== JSON.stringify(newAllDates)) {
  // Бронирование успешно
  await sendTelegramMessage(`✅ УСПЕШНО ЗАБРОНИРОВАНО!\nДата: ${date}\nВремя: ${time}`)
  break // Выход из цикла
}
```

## 10. Обработка Ошибок и Повторные Попытки

### 10.1 Ошибки Сессии
При ошибках 401, 403, пустом ответе или невалидном JSON:
- Принудительно обновляет сессию (`headers = null`)
- Увеличивает счетчик ошибок

### 10.2 Сетевые Ошибки
При ошибках подключения (ECONNREFUSED, ENOTFOUND, ECONNRESET, TLS):
- Логирует ошибку
- Ждет 10 минут
- Увеличивает счетчик ошибок
- Продолжает цикл

### 10.3 Ошибка 403 Forbidden
Специальная обработка для блокировки:
- Логирует блокировку
- Ждет 15 минут
- Принудительно обновляет сессию
- Увеличивает счетчик ошибок

### 10.4 Общие Ошибки
Для всех остальных ошибок:
- Экспоненциальная задержка: `2^consecutiveErrors` минут (максимум 60 минут)
- Увеличивает счетчик ошибок

## 11. Уведомления Telegram

### 11.1 Функция sendTelegramMessage
```javascript
const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML'
  })
})
```

### 11.2 Типы Уведомлений
- Успешное бронирование
- Критические ошибки
- Статус работы бота

## 12. Утилитарные Функции

### 12.1 Логирование
```javascript
function log(message) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}
```

### 12.2 Задержки
- `sleep(s)` - Задержка в секундах
- `randomDelay(min, max)` - Случайная задержка в диапазоне

### 12.3 Обработка Cookies
- `extractRelevantCookies()` - Извлекает необходимые cookies
- `parseCookies()` - Парсит строку cookies в объект

## 13. Схема Работы

```
Старт → Инициализация → Вход в систему → Проверка дат → 
Найдена дата? → Да → Проверка времени → Найдено время? → 
Да → Бронирование → Успешно? → Да → Уведомление → Завершение
                                  ↓ Нет
                              Повтор цикла
```

## 14. Особенности Реализации

### 14.1 Антидетекция
- Ротация User-Agent
- Случайные задержки
- Имитация реального браузера

### 14.2 Надежность
- Circuit breaker для предотвращения спама
- Экспоненциальные задержки при ошибках
- Автоматическое обновление сессии

### 14.3 Мониторинг
- Подробное логирование всех операций
- Telegram уведомления о важных событиях
- Отслеживание состояния сессии

Этот бот обеспечивает автоматическое и надежное бронирование визовых интервью с минимальным вмешательством пользователя.