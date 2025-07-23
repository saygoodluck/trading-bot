import { Module } from '@nestjs/common';
import { TraderService } from './trader.service';

@Module({
  imports: [],
  controllers: [],
  providers: [TraderService],
  exports: [TraderService]
})
export class TraderModule {}
