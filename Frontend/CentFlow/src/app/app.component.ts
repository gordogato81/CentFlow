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

export class AppComponent implements OnInit{
  title = 'CentFlow';

  constructor(private aS: AppService) {}

  private map!: L.Map;

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
      .attr("r", d => d.tfh/1000) //d.tfh/1000
      .style('fill', '#ffa800')
      .style('stroke', 'black');

    this.map.on('zoomend', updateOnZoom);
    this.map.on('moveend', updateOnPan);

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
      // const ctx = that.aS.getContext();
      // console.log(canvas);
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
        const traj = data.filter((x: any) => x.cid === clust);
        for (let i = 0; i < traj.length - 1; i++) {
          const cX = that.map.latLngToLayerPoint(L.latLng(traj[i].lat, traj[i].lon)).x,
            cY = that.map.latLngToLayerPoint(L.latLng(traj[i].lat, traj[i].lon)).y,
            nX = that.map.latLngToLayerPoint(L.latLng(traj[i+1].lat, traj[i+1].lon)).x,
            nY = that.map.latLngToLayerPoint(L.latLng(traj[i+1].lat, traj[i+1].lon)).y;
          context.lineWidth = 3;
          context.beginPath();
          context.moveTo(cX, cY);
          context.lineTo(nX, nY);
          context.closePath();
          context.stroke();
        }
      });
      context.save();
    }
  }
}
