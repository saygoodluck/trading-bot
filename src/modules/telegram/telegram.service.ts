import axios from 'axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramService {
  private readonly token = process.env.TELEGRAM_TOKEN;
  private readonly chatId = process.env.TELEGRAM_CHAT_ID;

  async sendMessage(text: string) {
    await axios.post(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      chat_id: this.chatId,
      text,
      parse_mode: 'Markdown',
    });
  }
}
