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
}
