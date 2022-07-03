import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CentroidData } from '../interfaces'
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) { }

  private url = 'http://localhost:5000';

  public getCentroids(split?: string, start?: string, end?: string): Observable<CentroidData[]> {
    if (start != undefined && end != undefined) {
      return this.http.get<CentroidData[]>(this.url + '/getCentroids?start=' + start + '&end=' + end + '&split=' + split);
    }
    return this.http.get<CentroidData[]>(this.url + '/getCentroids');
  }

  public getClusterGraph(cid: number, split?: string) {
    if (cid != undefined && split != undefined) {
      return this.http.get(this.url + '/getClusterGraph?split=' + split + '&cid=' + cid);
    }
    return this.http.get(this.url + '/getClusterGraph');
  }

  public getCluster(cid: number, start: string, end: string) {
    if (start != undefined && end != undefined && cid != undefined) {
      return this.http.get(this.url + '/getClusterDots?start=' + start + '&end=' + end + '&cid=' + cid);
    }
    return this.http.get(this.url + '/getClusterDots');
  }
}
