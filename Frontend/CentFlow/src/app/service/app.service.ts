import { Injectable } from '@angular/core';
import { CentroidData } from '../interfaces';

@Injectable({
  providedIn: 'root'
})
export class AppService {

  constructor() { }
  private context: any;
  private canvas: any;
  private map: any;
  private cData: CentroidData[] = [];

  public setContext(context: any) {
    this.context = context;
  }

  public getContext() {
    return this.context;
  }

  public setCanvas(canvas: any) {
    this.canvas = canvas;
  }

  public getCanvas() {
    return this.canvas;
  }

  public setMap(map: any) {
    this.map = map;
  }

  public getMap() {
    return this.map;
  }

  public setData(cents: CentroidData[]) {
    this.cData = cents;
  }

  public getData() {
    return this.cData;
  }
}
