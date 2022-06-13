import { Component, OnInit } from '@angular/core';
import * as d3 from 'd3';
import * as L from 'leaflet';

import { AppService } from 'src/services/app.service';

import fakeData from '../assets/fakeData.json';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})

export class AppComponent implements OnInit {
  title = 'CentFlow';

  constructor(private aS: AppService) { }

  private map!: L.Map;
  private maxTrajWidth = 30 // the maximum width the trajectory graph can have. 

  ngOnInit() {
    const that = this;
    const blBounds = L.latLng(-50, -10),
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
      maxZoom: 9,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.svg().addTo(this.map);
    L.canvas().addTo(this.map);

    let svg = d3.select(this.map.getPanes().overlayPane).select('svg'),
      g = svg.append("g");
    let canvas: any = d3.select(this.map.getPanes().overlayPane).select('canvas').attr('z-index', 300),
      context = canvas.node().getContext('2d');

    context.save();
    const dots = g.selectAll('dot')
      .data(fakeData)
      .join('circle')
      .attr("cx", d => this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
      .attr("cy", d => this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y)
      .attr("r", d => 5) //d.tfh/1000
      .style('fill', 'white')
      .style('stroke', 'black');

    this.map.on('zoomend', updateOnZoom);
    this.map.on('moveend', updateOnPan);
    console.log(that.map.latLngToLayerPoint(L.latLng(fakeData[5].lat, fakeData[5].lon)));
    console.log(that.map.latLngToLayerPoint(L.latLng(fakeData[6].lat, fakeData[6].lon)));
    console.log(that.map.latLngToLayerPoint(L.latLng(fakeData[7].lat, fakeData[7].lon)));
    console.log(that.map.latLngToLayerPoint(L.latLng(fakeData[8].lat, fakeData[8].lon)));


    draw(fakeData);

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
      draw(fakeData);
      dots.attr("cx", d => that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x)
        .attr("cy", d => that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y);
    }
    function updateOnPan() {
      draw(fakeData);
    }

    function draw(data: any) {
      context.restore();
      let clusters = new Set();
      data.forEach((element: any) => {
        clusters.add(element['cid']);
      });
      clusters.forEach((clust: any) => {
        const traj = data.filter((x: any) => x.cid === clust),
          valExt: any = d3.extent(traj, (d: any) => d.tfh);
        // console.log(valExt);
        for (let i = 0; i < traj.length; i++) {
          let points = undefined, nP = L.point(0, 0), pP = L.point(0, 0);
          const cP = that.map.latLngToLayerPoint(L.latLng(traj[i].lat, traj[i].lon)); // Current point

          if (i == 0) {
            nP = that.map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
            points = findPoints(traj[i].tfh, valExt, cP, undefined, nP);
          } else if (i == traj.length - 1) {
            pP = that.map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
            points = findPoints(traj[i].tfh, valExt, cP, pP);
          } else {
            nP = that.map.latLngToLayerPoint(L.latLng(traj[i + 1].lat, traj[i + 1].lon)); // Next point
            pP = that.map.latLngToLayerPoint(L.latLng(traj[i - 1].lat, traj[i - 1].lon)); // Previous point
            points = findPoints(traj[i].tfh, valExt, cP, pP, nP);
          }

          if (i < traj.length - 1) {
            context.lineWidth = 3;
            context.strokeStyle = 'black'
            context.beginPath();
            context.moveTo(cP.x, cP.y);
            context.lineTo(nP.x, nP.y);
            context.closePath();
            context.stroke();
          }

          // first line
          context.lineWidth = 3;
          context.strokeStyle = 'blue'
          context.beginPath();
          context.moveTo(cP.x, cP.y);
          context.lineTo(points[0].x, points[0].y);
          context.closePath();
          context.stroke();

          // // second line
          context.lineWidth = 3;
          context.strokeStyle = 'red'
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(cP.x, cP.y);
          context.lineTo(points[1].x, points[1].y);
          context.closePath();
          context.stroke();
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
        // ============== Orthogonal Midpoint ===================+
        // Determining the midpoints
        const mP1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
          mP2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        // Determining the perpendicular slopes ->  -1/slope
        const pS1 = -1 / ((p2.y - p1.y) / (p2.x - p1.x)),
          pS2 = -1 / ((p3.y - p2.y) / (p3.x - p2.x));
        // Determining the intersection of the slopes
        const j = (pS1 * (mP1.x - mP2.x) - mP1.y + mP2.y) / (pS1 - pS2);
        // point of intersection
        const iP = { x: p2.x + j, y: p2.y + j * ((pS1 + pS2) / 2) };
        // determining intersecting slope
        const iS = (p2.y - iP.y) / (p2.x - iP.x);
        // ============== Orthogonal Midpoint ===================+

        // ================ Using Triangle Incenter ==============
        // // determining the distance of all points
        // const a1 = p1.x - p2.x,
        //   b1 = p1.y - p2.y,
        //   a2 = p2.x - p3.x,
        //   b2 = p2.y - p3.y,
        //   a3 = p3.x - p1.x,
        //   b3 = p3.y - p1.y;
        // const d1 = Math.sqrt(a1 * a1 + b1 * b1),
        //   d2 = Math.sqrt(a2 * a2 + b2 * b2),
        //   d3 = Math.sqrt(a3 * a3 + b3 * b3);

        // // point of intersection
        // const iP = {
        //   x: (d1 * p1.x + d2 * p2.x + d3 * p3.x) / (d1 + d2 + d3),
        //   y: (d1 * p1.y + d2 * p2.y + d3 * p3.y) / (d1 + d2 + d3)
        // };
        // // determining intersecting slope
        // const iS = -1 / (p2.y - iP.y) / (p2.x - iP.x);
        // ================ Using Triangle Incenter ==============


        // determining y-intercept
        // const iY = iP.y - iS * iP.x

        if (iS == 0) { // if the slope is horizontal
          console.log("Hello")
          dP1.x = p2.x - widthScale(val);
          dP2.x = p2.x + widthScale(val);
          dP1.y = p2.y; // + widthScale(val)
          dP2.y = p2.y; // - widthScale(val)
        } else if (!isFinite(iS)) { // if the slope is vertical
          dP1.x = p2.x; // + widthScale(val)
          dP2.x = p2.x; // - widthScale(val)
          dP1.y = p2.y - widthScale(val);
          dP2.y = p2.y + widthScale(val);
        } else {
          const dx = (widthScale(val) / Math.sqrt(1 + (iS * iS)));
          const dy = iS * dx;
          dP1.x = p2.x + dx;
          dP2.x = p2.x - dx;
          dP1.y = p2.y + dy;
          dP2.y = p2.y - dy;
        }
      } else if (p1 != undefined) { // determine the angle of the start of the trajectory
        const pS1 = -1 / ((p2.y - p1.y) / (p2.x - p1.x));
        const dx = (widthScale(val) / Math.sqrt(1 + (pS1 * pS1)));
        const dy = pS1 * dx;
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
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
}
