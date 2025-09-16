import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly loggerReq = new Logger('request');
  private readonly loggerRes = new Logger('response');

  public async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const body = req.body && Object.keys(req.body).length > 0 ? req.body : undefined;
    const auth = req.headers.authorization;

    this.loggerReq.log(
      `method ${req.method} path ${req.originalUrl}${
        body ? ' body ' + JSON.stringify(body) : ''
      }${
        auth ? ' auth ' + auth : ''
      }`
    );

    return next.handle().pipe(
      map((data) => {
        this.loggerRes.log(
          `method ${req.method} path ${req.originalUrl} response ${JSON.stringify(data)}`
        );
        return data;
      }),
      catchError((err) => {
        this.loggerRes.error(
          `method ${req.method} path ${req.originalUrl} error [${err.status}] ${err.message}`,
          err.stack
        );
        return throwError(() => err);
      })
    );
  }
}