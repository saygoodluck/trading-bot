import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class RunBotDto {
  @IsString() symbol!: string;
  @IsString() timeframe!: string; // e.g., '5m', '15m'
  @IsString() from!: string; // ISO
  @IsString() to!: string; // ISO
  @IsString() strategy!: string;
  @IsObject() @IsOptional() params?: Record<string, any>;
  @IsNumber() @IsOptional() feesBps?: number;
  @IsNumber() @IsOptional() slippageBps?: number; // reserved for future
  @IsNumber() @IsOptional() initialEquity?: number;
  @IsNumber() @IsOptional() limit: number = 50;
}
