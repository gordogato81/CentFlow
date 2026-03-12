import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CentroidData, clustData, graphData, hullData } from '../interfaces';
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) { }

  private readonly url = environment.apiBaseUrl;

  public getCentroids(split?: string, start?: string, end?: string): Observable<CentroidData[]> {
    let params = new HttpParams();
    if (start != undefined && end != undefined) {
      params = params.set('start', start).set('end', end);
      if (split != undefined) {
        params = params.set('split', split);
      }
    }
    return this.http.get<CentroidData[]>(`${this.url}/getCentroids`, { params });
  }

  public getClusterGraph(cid: number, split?: string) {
    let params = new HttpParams();
    if (cid != undefined && split != undefined) {
      params = params.set('split', split).set('cid', cid);
    }
    return this.http.get<graphData[]>(`${this.url}/getClusterGraph`, { params });
  }

  public getCluster(cid: number, start: string, end: string) {
    let params = new HttpParams();
    if (start != undefined && end != undefined && cid != undefined) {
      params = params.set('start', start).set('end', end).set('cid', cid);
    }
    return this.http.get<clustData[]>(`${this.url}/getClusterDots`, { params });
  }

  public getClusterHulls(cid: number, start1: string, end1: string, start2: string, end2: string, split: string) {
    let params = new HttpParams();
    if (split!= undefined && cid != undefined) {
      params = params
        .set('start1', start1)
        .set('end1', end1)
        .set('start2', start2)
        .set('end2', end2)
        .set('cid', cid)
        .set('split', split);
    }
    return this.http.get<hullData[]>(`${this.url}/getClusterHull`, { params });
  }
}
