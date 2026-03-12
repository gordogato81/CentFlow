import { Injectable } from '@angular/core';
import { graphData } from '../interfaces';
@Injectable({
  providedIn: 'root'
})
export class DialogService {

  constructor() { }

  context: any;
  canvas: any;
  map: any;
  gData: graphData[] = [];

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

  public setGData(grata: graphData[]) {
    this.gData = grata;
  }

  public getGData() {
    return this.gData;
  }
}
