import { IStream } from './stream.interface';
import { Candle } from '../../common/types';
import WebSocket from 'ws';

export type KlineHandler = (bar: Candle) => void;

export class BinanceStreamService implements IStream {
  private ws?: WebSocket;

  connectKlines(symbol: string, timeframe: string, onCloseBar: KlineHandler) {
    const url = this.makeUrl(symbol, timeframe);
    this.ws = new WebSocket(url);

    let ping: NodeJS.Timeout | undefined;

    this.ws.on('open', () => {
      // Heartbeat — чтобы соединение не засыпало у провайдера/прокси.
      ping = setInterval(() => {
        try {
          this.ws?.ping();
        } catch (_) {}
      }, 30_000);
      console.log('[WS] open', url);
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        // У Binance kline-пакет лежит в msg.k
        const k = msg?.k;
        if (!k) return;
        if (k.x !== true) return; // берем только закрытую свечу
        const bar: Candle = {
          timestamp: k.T, // close time (ms)
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v)
        };
        onCloseBar(bar);
      } catch (e) {
        console.error('[WS] parse error', e);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[WS] error', err);
    });

    this.ws.on('close', (code, reason) => {
      if (ping) clearInterval(ping);
      console.log('[WS] close', code, reason.toString());
      // тут можно повесить авто-реconnect с backoff, если нужно
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.ws = undefined;
  }

  private makeUrl(symbol: string, timeframe: string) {
    const stream = `${symbol.replace('/', '').toLowerCase()}@kline_${timeframe}`;
    return `wss://testnet.binance.vision/ws/${stream}`;
  }
}
