import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CentroidData, clustData, graphData, hullData } from '../interfaces'
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) { }

  // private url = 'http://localhost:5002';
  private url = 'https://centflow.wittekindt.eu/api';

  public getCentroids(split?: string, start?: string, end?: string): Observable<CentroidData[]> {
    if (start != undefined && end != undefined) {
      return this.http.get<CentroidData[]>(this.url + '/getCentroids?start=' + start + '&end=' + end + '&split=' + split);
    }
    return this.http.get<CentroidData[]>(this.url + '/getCentroids');
  }

  public getClusterGraph(cid: number, split?: string) {
    if (cid != undefined && split != undefined) {
      return this.http.get<graphData[]>(this.url + '/getClusterGraph?split=' + split + '&cid=' + cid);
    }
    return this.http.get<graphData[]>(this.url + '/getClusterGraph');
  }

  public getCluster(cid: number, start: string, end: string) {
    if (start != undefined && end != undefined && cid != undefined) {
      return this.http.get<clustData[]>(this.url + '/getClusterDots?start=' + start + '&end=' + end + '&cid=' + cid);
    }
    return this.http.get<clustData[]>(this.url + '/getClusterDots');
  }

  public getClusterHulls(cid: number, start1: string, end1: string, start2: string, end2: string, split: string) {
    if (split!= undefined && cid != undefined) {
      return this.http.get<hullData[]>(this.url + '/getClusterHull?start1=' + start1 + '&end1=' + end1 + '&start2=' + start2 + '&end2=' + end2 + '&cid=' + cid + '&split=' + split);
    }
    return this.http.get<hullData[]>(this.url + '/getClusterHull');
  }
}
