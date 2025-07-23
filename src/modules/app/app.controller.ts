import { All, Controller, Req } from '@nestjs/common';

@Controller()
export class AppController {

  @All()
  public healthCheck(@Req() req: Request): { request: any; data: string } {
    return {
      request: { method: req.method, body: req.body, headers: req.headers, url: req.url },
      data: "health check is ok!"
    };
  }
}
