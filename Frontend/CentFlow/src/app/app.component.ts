import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { AppService } from 'src/app/service/app.service';
import { DialogComponent } from './dialog/dialog.component';
import { MatDialog } from '@angular/material/dialog';

import * as d3 from 'd3';
import * as L from 'leaflet';

import fakeData from '../assets/fakeData.json';
import { ApiService } from './service/api.service';
import { CentroidData } from './interfaces';


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})

export class AppComponent implements OnInit {
  title = 'CentFlow';

  constructor(
    private ds: ApiService,
    private aS: AppService,
    public dialog: MatDialog
  ) { }

  private map!: L.Map;
  private maxTrajWidth = 15 // the maximum width the trajectory graph can have. 
  mapScale: string = 'log';
  intervalScale: string = 'week';
  minDate: Date = new Date('2012-01-01');
  maxDate: Date = new Date('2020-12-31');
  range = new FormGroup({
    start: new FormControl(),
    end: new FormControl(),
  });
  loaded = false;

  ngOnInit() {
    const that = this;
    const blBounds = L.latLng(-70, -10),
      trBounds = L.latLng(30, 160),
      bounds = L.latLngBounds(blBounds, trBounds);
    const mapOptions = {
      zoom: 4,
      zoomDelta: 0.5,
      minZoom: 4,
      maxZoom: 14,
      maxBounds: bounds
    };

    this.map = L.map('map', mapOptions).setView([0, 80]); // defaults to world view 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.svg().addTo(this.map);
    L.canvas().addTo(this.map);

    const svg = d3.select(this.map.getPanes().overlayPane).select('svg').attr('z-index', 301),
      g = svg.append("g");
    const canvas: any = d3.select(this.map.getPanes().overlayPane).select('canvas').attr('z-index', 300),
      context = canvas.node().getContext('2d');

    context.save();
    this.aS.setContext(context);
    this.aS.setCanvas(canvas);
    this.aS.setMap(this.map);
    const start = "2020-01-01";
    const end = "2020-01-31";
    this.range.setValue({ start: start, end: end });
    this.ds.getCentroids(this.intervalScale, start, end).subscribe((cents) => {
      this.loaded = true;
      this.aS.setData(cents);
      this.dots(cents);
      this.draw(cents);
    });

  }

  dots(cents: CentroidData[]) {
    const that = this;
    const map = this.aS.getMap();
    const g = d3.select(this.map.getPanes().overlayPane).select('svg').select('g');
    if (!g.selectAll('circle').empty()) g.selectAll('circle').remove();
    const dots = g.selectAll('dot')
      .data(cents)
      .join('circle')
      .attr("class", "leaflet-interactive")
      .attr('pointer-events', 'painted')
      .attr("cx", d => map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
      .attr("cy", d => map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y)
      .attr("r", d => 4) //d.tfh/1000
      .style('fill', 'white')
      .style('stroke', 'black');

    dots.on('click', (event, d) => this.startDialog(d));
    map.on('zoomend', zooming);
    map.on('moveend', panning);

    function zooming() {
      that.updateOnZoom()
    }

    function panning() {
      that.updateOnPan()
    }
  }

  updateOnZoom() {
    const cdata = this.aS.getData();
    const map = this.aS.getMap();
    const dots = d3.selectAll('circle');
    this.draw(cdata);
    dots.attr("cx", (d: any) => map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
      .attr("cy", (d: any) => map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y);
  }
  updateOnPan() {
    if (this.loaded) {
      const cdata = this.aS.getData();
      this.draw(cdata);
    }
  }
  draw(data: any) {
    const canvas = this.aS.getCanvas();
    const context = this.aS.getContext();
    const map = this.aS.getMap();
    const tMax: any = d3.max(data, (d: CentroidData) => d.tfh);
    context.clearRect(0, 0, canvas.width, canvas.height);
    // context.restore();
    let clusters = new Set();
    data.forEach((element: any) => {
      clusters.add(element['cid']);
    });
    clusters.forEach((clust: any) => { // O(C * 3P)
      const traj = data.filter((x: any) => x.cid === clust);
      if (traj.length > 1) {
        const valExt: any = d3.extent(traj, (d: any) => d.tfh);
        let pointArray = [];
        // drawing the line graph along the first side
        for (let i = 0; i < traj.length; i++) {
          let points = undefined, nP = L.point(0, 0), pP = L.point(0, 0);
          const cP = map.latLngToLayerPoint(L.latLng(traj[i].lat, traj[i].lon)); // Current point
          if (i == 0) { // First point
            nP = map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
            points = this.findPoints(traj[i].tfh, [0, tMax], cP, undefined, nP);
            points.push(cP);
            pointArray.push(points);

            context.lineWidth = 3;
            context.strokeStyle = '#ffb800'
            // context.strokeStyle = 'red'
            context.save();
            context.globalAlpha = 0.75;
            context.beginPath();
            context.moveTo(points[1].x, points[1].y);
            context.lineTo(points[0].x, points[0].y);
          } else if (i == traj.length - 1) { // Last point 
            pP = map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
            points = this.findPoints(traj[i].tfh, [0, tMax], cP, pP, undefined);
            points.push(cP);
            pointArray.push(points);
            context.lineTo(points[0].x, points[0].y);
          } else {
            nP = map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
            pP = map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
            points = this.findPoints(traj[i].tfh, [0, tMax], cP, pP, nP);
            points.push(cP);
            pointArray.push(points);
            context.lineTo(points[0].x, points[0].y);
          }
        }
        // iterating back accross the other side
        for (let i = traj.length - 1; i > -1; i--) {
          if (i == 0) { // last connection
            context.lineTo(pointArray[0][1].x, pointArray[0][1].y);
            context.stroke();
            context.fillStyle = '#ffa800';
            context.fill();
            context.closePath();
          } else if (i == traj.length - 1) { // Last line 
            context.lineTo(pointArray[i][1].x, pointArray[i][1].y);
          } else {
            context.lineTo(pointArray[i][1].x, pointArray[i][1].y);
          }
        }
        context.restore();
        for (let i = 0; i < traj.length; i++) {
          if (i == 1) {
            context.lineWidth = 3;
            context.strokeStyle = 'black'
            context.beginPath()
            context.moveTo(pointArray[i - 1][2].x, pointArray[i - 1][2].y);
            context.lineTo(pointArray[i][2].x, pointArray[i][2].y);
          } else {
            context.lineTo(pointArray[i][2].x, pointArray[i][2].y);
          }
        }
        context.stroke();
        context.closePath();

        //drawing triangle head
        const fP = pointArray[traj.length - 1][2]; // final point
        const pP = pointArray[traj.length - 2][2]; // second to last point
        const tP = this.findPoints(valExt[1], valExt, L.point(fP.x, fP.y), L.point(pP.x, pP.y), undefined);
        const t1 = tP[0],
          t2 = tP[1];
        const pST = -1 / ((t1.y - t2.y) / (t1.x - t2.x));
        const dT = Math.sqrt((t1.x - t2.x) ** 2 + (t1.y - t2.y) ** 2);
        const dx = ((dT / 2) / Math.sqrt(1 + (pST * pST)));
        const dy = pST * dx;
        let t3 = pointArray[traj.length - 1][2];
        if (fP.x > pP.x) {
          t3.x += dx;
          t3.y += dy;
        } else {
          t3.x -= dx;
          t3.y -= dy;
        }

        context.fillStyle = 'black';
        context.beginPath();
        context.moveTo(t1.x, t1.y);
        context.lineTo(t2.x, t2.y);
        context.lineTo(t3.x, t3.y);
        context.fill();
      }
    });
    context.save();
  }
  /**
   * determines the location of points that are orthogonal to up to three other points
   * @param val current tfh value
   * @param ext min max value of the cluster
   * @param p2 current point
   * @param p1 next point
   * @param p3 previous point
   * @returns 
   */
  findPoints(val: number, ext: [number, number], p2: L.Point, p1?: L.Point, p3?: L.Point) {
    // the points we want to determine
    let dP1 = { x: 0, y: 0 },
      dP2 = { x: 0, y: 0 };

    let widthScale;
    // determining the color scaling based on user input
    if (this.mapScale == 'log') {
      widthScale = d3.scaleSymlog().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    } else if (this.mapScale == 'sqrt') {
      widthScale = d3.scaleSqrt().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    } else {
      widthScale = d3.scaleLinear().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    }
    if (p1 != undefined && p3 != undefined) {
      // Determining the intersection of bisecting vectors to get the orthogonal vector
      // This method will not work when the distance between two centroids is zero. 
      // Normalizing the vectors
      let v1 = { x: (p1.x - p2.x), y: (p1.y - p2.y) },
        v2 = { x: (p2.x - p3.x), y: (p2.y - p3.y) };
      const lV1 = 1.0 / Math.hypot(v1.x, v1.y),
        lV2 = 1.0 / Math.hypot(v2.x, v2.y);
      v1.x *= lV1;
      v1.y *= lV1;
      v2.x *= lV2;
      v2.y *= lV2;

      // rotating the vectors by 90
      const rV1 = { x: -v1.y, y: v1.x },
        rV2 = { x: -v2.y, y: v2.x };

      // adding and normalizing into a single vector
      let pV = { x: rV1.x + rV2.x, y: rV1.y + rV2.y };
      const lPV = 1.0 / Math.hypot(pV.x, pV.y);
      pV.x *= lPV;
      pV.y *= lPV;

      // determining the points 
      pV.x *= widthScale(val);
      pV.y *= widthScale(val);

      dP1 = { x: p2.x - pV.x, y: p2.y - pV.y };
      dP2 = { x: p2.x + pV.x, y: p2.y + pV.y };
    } else if (p1 != undefined) { // determine the angle of the start of the trajectory
      const pS1 = -1 / ((p1.y - p2.y) / (p1.x - p2.x));
      const dx = (widthScale(val) / Math.sqrt(1 + (pS1 * pS1)));
      const dy = pS1 * dx;
      if (p2.y > p1.y) { // bottom
        dP1.x = p2.x - dx;
        dP2.x = p2.x + dx;
        dP1.y = p2.y - dy;
        dP2.y = p2.y + dy;
      } else if (p2.y < p1.y) { // top 
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
      } else {
        dP1.x = p2.x - dx;
        dP2.x = p2.x + dx;
        dP1.y = p2.y - dy;
        dP2.y = p2.y + dy;
      }

    } else if (p3 != undefined) { // determine the angle of the end of the trajectory
      const pS2 = -1 / ((p2.y - p3.y) / (p2.x - p3.x));
      const dx = (widthScale(val) / Math.sqrt(1 + (pS2 * pS2)));
      const dy = pS2 * dx;
      if (p2.y > p3.y) { // bottom
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
      } else if (p2.y < p3.y) { // top 
        dP1.x = p2.x - dx;
        dP2.x = p2.x + dx;
        dP1.y = p2.y - dy;
        dP2.y = p2.y + dy;
      } else {
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
      }
    }

    return [dP1, dP2]
  }

  onChange(event: any) {
    if (this.range.value.end) {
      const start = new Date(Date.parse(this.range.value.start));
      const end = new Date(Date.parse(this.range.value.end));
      this.ds.getCentroids(this.intervalScale, this.dateToStr(start), this.dateToStr(end)).subscribe(cents => {
        this.aS.setData(cents);
        this.dots(cents);
        this.draw(cents);
      })
    }
  }
  startDialog(d: any) {
    this.dialog.open(DialogComponent, {
      data: {
        d: d,
        interval: this.intervalScale,
        rangeStart: this.range.value.start,
        rangeEnd: this.range.value.end
      }
    })
  }

  dateToStr(d: Date) {
    return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2)
  }
}
