#!/usr/bin/env node

import { program } from 'commander';
import { botCommand } from './commands/bot.js';

program
  .name('us-visa-bot')
  .description('Automated US visa appointment rescheduling bot')
  .version('0.0.1');

program
  .command('bot')
  .description('Monitor and reschedule visa appointments')
  .action(botCommand);

// Default command for backward compatibility
program
  .action(botCommand);

program.parse();
