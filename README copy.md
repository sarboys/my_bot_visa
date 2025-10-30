# US Visa Bot 🤖

An automated bot that monitors and reschedules US visa interview appointments to get you an earlier date.

## Features

- 🔄 Continuously monitors available appointment slots
- 📅 Automatically books earlier dates when found  
- 🎯 Configurable target and minimum date constraints
- 🚨 Exits successfully when target date is reached
- 📊 Detailed logging with timestamps
- 🔐 Secure authentication with environment variables

## How It Works

The bot logs into your account on https://ais.usvisa-info.com/ and checks for available appointment dates every few seconds. When it finds a date earlier than your current booking (and within your specified constraints), it automatically reschedules your appointment.

## Prerequisites

- Node.js 16+ 
- A valid US visa interview appointment
- Access to https://ais.usvisa-info.com/

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/us-visa-bot.git
cd us-visa-bot
```

2. Install dependencies:
```bash
npm install
```

## Configuration

Create a `.env` file in the project root with your credentials:

```env
EMAIL=your.email@example.com
PASSWORD=your_password
COUNTRY_CODE=your_country_code
SCHEDULE_ID=your_schedule_id
FACILITY_ID=your_facility_id
REFRESH_DELAY=3
MIN_DATE=2025-11-25
MAX_DATE=2025-12-15
DAYS_BEFORE_BOOKING=0

# Telegram Notifications (Optional)
# Main bot for errors and logs
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# Special bot for important events (found dates and successful bookings)
SPECIAL_BOT_TOKEN=your_special_bot_token
SPECIAL_CHAT_ID=your_special_chat_id
```

### Finding Your Configuration Values

| Variable | Description | How to Find |
|----------|-------------|-------------|
| `EMAIL` | Your login email | Your credentials for ais.usvisa-info.com |
| `PASSWORD` | Your login password | Your credentials for ais.usvisa-info.com |
| `COUNTRY_CODE` | Your country code | Found in URL: `https://ais.usvisa-info.com/en-{COUNTRY_CODE}/` <br>Examples: `br` (Brazil), `fr` (France), `de` (Germany) |
| `SCHEDULE_ID` | Your appointment schedule ID | Found in URL when rescheduling: <br>`https://ais.usvisa-info.com/en-{COUNTRY_CODE}/niv/schedule/{SCHEDULE_ID}/continue_actions` |
| `FACILITY_ID` | Your consulate facility ID | Found in network calls when selecting dates, or inspect the date selector dropdown <br>Example: Paris = `44` |
| `REFRESH_DELAY` | Seconds between checks | Optional, defaults to 3 seconds |
| `MIN_DATE` | Minimum acceptable date | Start date for appointment search (YYYY-MM-DD format) |
| `MAX_DATE` | Maximum target date | End date for appointment search (YYYY-MM-DD format) |
| `DAYS_BEFORE_BOOKING` | Days before booking | Number of days to add to MIN_DATE if needed (default: 0) |
| `TELEGRAM_BOT_TOKEN` | Main Telegram bot token | Create a bot via @BotFather and get the token for error/log notifications |
| `TELEGRAM_CHAT_ID` | Main Telegram chat ID | Your chat ID for receiving error/log notifications |
| `SPECIAL_BOT_TOKEN` | Special Telegram bot token | Create a second bot via @BotFather for important event notifications |
| `SPECIAL_CHAT_ID` | Special Telegram chat ID | Your chat ID for receiving found dates and booking success notifications |

## Usage

Run the bot:

```bash
node index.js
```

### Command Line Arguments

| Flag | Long Form | Required | Description |
|------|-----------|----------|-------------|
| `--dry-run` | `--dry-run` | ❌ | Only log what would be booked without actually booking |

### Examples

```bash
# Basic usage - search for appointments between MIN_DATE and MAX_DATE
node index.js

# Dry run mode - see what would be booked without actually booking
node index.js --dry-run

# Get help
node index.js --help
```

## How It Behaves

The bot will:
1. **Log in** to your account using provided credentials
2. **Check** for available dates every few seconds
3. **Compare** found dates against your constraints:
   - Must be within the date range (MIN_DATE to MAX_DATE)
   - Takes into account DAYS_BEFORE_BOOKING for minimum date calculation
   - Must be earlier than any current booking if one exists
4. **Book** the appointment automatically if conditions are met
5. **Continue** monitoring until target is reached or manually stopped

## Output Examples

```
[2023-07-16T10:30:00.000Z] === US Visa Bot Initialization ===
[2023-07-16T10:30:00.000Z] Email: your.email@example.com
[2023-07-16T10:30:00.000Z] Minimum acceptable date: 2025-11-25
[2023-07-16T10:30:00.000Z] Maximum target date: 2025-12-15
[2023-07-16T10:30:00.000Z] Search range: 2025-11-25 to 2025-12-15
[2023-07-16T10:30:01.000Z] Logging in
[2023-07-16T10:30:03.000Z] Found 3 available dates: 2025-11-20, 2025-12-01, 2025-12-20
[2023-07-16T10:30:03.000Z] date 2025-11-20 is before minimum date (2025-11-25)
[2023-07-16T10:30:03.000Z] date 2025-12-20 is after maximum date (2025-12-15)
[2023-07-16T10:30:06.000Z] booked time at 2025-12-01 09:00
```

## Safety Features

- ✅ **Read-only until booking** - Only books when better dates are found
- ✅ **Respects constraints** - Won't book outside your specified date range
- ✅ **Graceful exit** - Stops automatically when target is reached
- ✅ **Error recovery** - Automatically retries on network errors
- ✅ **Secure credentials** - Uses environment variables for sensitive data

## Telegram Notifications 📱

The bot supports Telegram notifications through two separate bots for different types of messages:

### Main Bot (Errors & Logs)
Receives notifications for:
- ❌ **Errors**: Socket hangup errors, authentication failures
- 📝 **Logs**: "No dates available" messages, connection issues

### Special Bot (Important Events)  
Receives notifications for:
- 📅 **Found Dates**: When available appointment dates are discovered
- ✅ **Successful Bookings**: When appointments are successfully booked
- 🧪 **Dry Run Results**: When running in test mode

### Setup Instructions

1. **Create Telegram Bots**:
   - Message @BotFather on Telegram
   - Create two bots using `/newbot` command
   - Save the bot tokens

2. **Get Your Chat ID**:
   - Message @userinfobot to get your chat ID
   - Or send a message to your bot and check `https://api.telegram.org/bot<TOKEN>/getUpdates`

3. **Configure Environment Variables**:
   ```env
   # Main bot for errors and logs
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=123456789
   
   # Special bot for important events
   SPECIAL_BOT_TOKEN=0987654321:ZYXwvuTSRqponMLKjihgFEDcba
   SPECIAL_CHAT_ID=987654321
   ```

### Message Examples

**Error Notification** (Main Bot):
```
🚨 Socket Hangup Error

Error: request to https://ais.usvisa-info.com/... failed
Reason: read ECONNRESET
Time: 2024-01-15 10:30:00
```

**Found Dates** (Special Bot):
```
📅 Available Dates Found

• 2025-11-28
• 2025-12-05
• 2025-12-12

Total: 3 dates found
```

**Successful Booking** (Special Bot):
```
🎉 APPOINTMENT SUCCESSFULLY BOOKED!

Date: 2025-12-01
Time: 09:00

Facility ID: 44
Schedule ID: 12345678
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the ISC License.

## Disclaimer

This bot is for educational purposes. Use responsibly and in accordance with the terms of service of the visa appointment system. The authors are not responsible for any misuse or consequences.
