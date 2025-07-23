import { Controller, Get } from '@nestjs/common';

@Controller('/telegram')
export class TelegramController {
  //todo run/stop bot from telegram

  @Get('/balance')
  async balance() {}
}
