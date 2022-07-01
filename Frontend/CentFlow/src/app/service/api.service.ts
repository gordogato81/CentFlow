import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CentroidData } from '../interfaces'
@Injectable({
  providedIn: 'root'
})
export class ApiService {

  constructor(private http: HttpClient) { }


  public getCentroids(): Observable<CentroidData[]> {
    return this.http.get<CentroidData[]>('http://localhost:5000/getCentroids')
  }
}
