export class Risk {
  public sl: number;
  public tp: number;
  public rr: number;

  constructor(sl: number, tp: number, rr: number) {
    this.sl = sl;
    this.tp = tp;
    this.rr = rr;
  }
}
