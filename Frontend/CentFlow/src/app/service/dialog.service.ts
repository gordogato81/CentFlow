import { Injectable } from '@angular/core';
import * as L from 'leaflet'; 
@Injectable({
  providedIn: 'root'
})
export class DialogService {

  constructor() { }

  context: any;
  canvas: any;
  map!: L.Map;
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
  
  public setMap(map: L.Map) {
    this.map = map;
  }

  public getMap() {
     return this.map;
  }
}
