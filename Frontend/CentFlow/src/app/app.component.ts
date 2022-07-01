import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { AppService } from 'src/app/service/app.service';
import { DialogComponent } from './dialog/dialog.component';
import { MatDialog } from '@angular/material/dialog';

import * as d3 from 'd3';
import * as L from 'leaflet';

import fakeData from '../assets/fakeData.json';
import { ApiService } from './service/api.service';


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
  mapScale: string = 'linear';
  intervalScale: string = 'month';
  minDate: Date = new Date('2012-01-01');
  maxDate: Date = new Date('2020-12-31');
  range = new FormGroup({
    start: new FormControl(),
    end: new FormControl(),
  });
  ngOnInit() {
    const that = this;
    const blBounds = L.latLng(-50, -10),
      trBounds = L.latLng(30, 160),
      bounds = L.latLngBounds(blBounds, trBounds);
    const mapOptions = {
      zoom: 4,
      zoomDelta: 0.5,
      minZoom: 4,
      maxZoom: 9,
      maxBounds: bounds
    };

    this.map = L.map('map', mapOptions).setView([0, 80]); // defaults to world view 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 9,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.svg().addTo(this.map);
    L.canvas().addTo(this.map);

    let svg = d3.select(this.map.getPanes().overlayPane).select('svg').attr('z-index', 301),
      g = svg.append("g");
    let canvas: any = d3.select(this.map.getPanes().overlayPane).select('canvas').attr('z-index', 300),
      context = canvas.node().getContext('2d');

    context.save();

    this.ds.getCentroids().subscribe((cents) => {
      console.log(cents.length)
      const dots = g.selectAll('dot')
        .data(cents)
        .join('circle')
        .attr("class", "leaflet-interactive")
        .attr('pointer-events', 'painted')
        .attr("cx", d => this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
        .attr("cy", d => this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y)
        .attr("r", d => 5) //d.tfh/1000
        .style('fill', 'white')
        .style('stroke', 'black');

      dots.on('click', (event, d) => that.startDialog(d));
      this.map.on('zoomend', updateOnZoom);
      this.map.on('moveend', updateOnPan);


      draw(cents);
      // Transforming svg locations to leaflet coordinates
      const transform = d3.geoTransform({
        point: function (x, y) {
          const point = that.map.latLngToLayerPoint([y, x]);
          this.stream.point(point.x, point.y);
        },
      });

      // Adding transformation to the path
      const path = d3.geoPath().projection(transform);

      function updateOnZoom() {
        draw(cents);
        dots.attr("cx", d => that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
          .attr("cy", d => that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y);
      }
      function updateOnPan() {
        draw(cents);
      }
    })




    function draw(data: any) {
      context.restore();
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
            const cP = that.map.latLngToLayerPoint(L.latLng(traj[i].lat, traj[i].lon)); // Current point
            if (i == 0) { // First point
              nP = that.map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
              points = findPoints(traj[i].tfh, valExt, cP, undefined, nP);
              points.push(cP);
              pointArray.push(points);

              context.lineWidth = 3;
              context.strokeStyle = '#ffb800'
              context.save();
              context.globalAlpha = 0.75;
              context.beginPath();
              context.moveTo(points[1].x, points[1].y);
              context.lineTo(points[0].x, points[0].y);
            } else if (i == traj.length - 1) { // Last point 
              pP = that.map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
              points = findPoints(traj[i].tfh, valExt, cP, pP);
              points.push(cP);
              pointArray.push(points);
              context.lineTo(points[0].x, points[0].y);
            } else {
              nP = that.map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
              pP = that.map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
              points = findPoints(traj[i].tfh, valExt, cP, pP, nP);
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
          const fP = pointArray[traj.length - 1][2];
          const pP = pointArray[traj.length - 2][2];
          const tP = findPoints(valExt[1], valExt, L.point(fP.x, fP.y), undefined, L.point(pP.x, pP.y));
          const t1 = tP[0],
            t2 = tP[1];
          const pST = -1 / ((t1.y - t2.y) / (t1.x - t2.x));
          const dT = Math.sqrt((t1.x - t2.x) ** 2 + (t1.y - t2.y) ** 2);
          const dx = ((dT / 2) / Math.sqrt(1 + (pST * pST)));
          const dy = pST * dx;
          let t3 = pointArray[traj.length - 1][2];
          t3.x -= dx;
          t3.y -= dy;
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

    function findPoints(val: number, ext: [number, number], p2: L.Point, p1?: L.Point, p3?: L.Point) {
      // the points we want to determine
      let dP1 = { x: 0, y: 0 },
        dP2 = { x: 0, y: 0 };

      const widthScale = d3.scaleLinear().domain([0, ext[1]]).range([0, that.maxTrajWidth]);

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
        const pS1 = -1 / ((p2.y - p1.y) / (p2.x - p1.x));
        const dx = (widthScale(val) / Math.sqrt(1 + (pS1 * pS1)));
        const dy = pS1 * dx;
        dP1.x = p2.x - dx;
        dP2.x = p2.x + dx;
        dP1.y = p2.y - dy;
        dP2.y = p2.y + dy;
      } else if (p3 != undefined) { // determine teh angle of the end of the trajectory
        const pS2 = -1 / ((p3.y - p2.y) / (p3.x - p2.x));
        const dx = (widthScale(val) / Math.sqrt(1 + (pS2 * pS2)));
        const dy = pS2 * dx;
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
      }

      return [dP1, dP2]
    }
  }
  onChange(event: any) {

  }
  startDialog(d: any) {
    this.dialog.open(DialogComponent, {
      data: {
        d: d
      }
    })
  }
}
