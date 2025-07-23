import { Controller, Get } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('/bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  // @Get('/start')
  // async runBot() {
  //   return this.botService.runOnce();
  // }

  // @Get('/stop')
  // async stopBot() {
  //   return this.botService.stopBot();
  // }
}
