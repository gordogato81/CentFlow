import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AppService {

  constructor() { }
  private context: any;

  public setContext(context: any) {
    this.context = context;
  }

  public getContext() {
    return this.context;
  }
}
