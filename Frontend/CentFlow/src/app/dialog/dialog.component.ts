import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DialogData } from '../interfaces';
import * as L from 'leaflet';
import * as d3 from 'd3';


@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss']
})
export class DialogComponent implements OnInit {

  constructor(@Inject(MAT_DIALOG_DATA) public data: DialogData) { }

  private map!: L.Map;

  ngOnInit(): void {
    const mapOptions = {
      zoom: 4,
      zoomDelta: 0.5,
      minZoom: 4,
      maxZoom: 9,
    };

    this.map = L.map('dMap', mapOptions).setView([0, 80]); // defaults to world view 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 9,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.svg().addTo(this.map);
    L.canvas().addTo(this.map);

    // // adds canvas element for a given data point
    // function draw(d: any) {
    //   let colorMap: any;
    //   // determining the color scaling based on user input
    //   if (that.mapScale == 'log') {
    //     colorMap = d3.scaleSymlog<string, number>();
    //   } else if (that.mapScale == 'sqrt') {
    //     colorMap = d3.scaleSqrt();
    //   } else if (that.mapScale == 'linear') {
    //     colorMap = d3.scaleLinear();
    //   }

    //   colorMap.domain([0, that.dMax]).range(["orange", "purple"]);
    //   const newY = that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y + 0.1;
    //   const newX = that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x;
    //   context.beginPath();
    //   context.fillStyle = colorMap(d.tfh);
    //   context.rect(newX, newY, that.detSize(d)[0], that.detSize(d)[1]);
    //   context.fill();
    //   context.closePath();
    // }

    // // removes all previous canvas elements
    // function clearContext() {
    //   context.clearRect(0, 0, canvas.attr("width"), canvas.attr("height"));
    // }

    // // rerender datapoints when the map moves or zooms.
    // function update() {
    //   if (that.loaded) {
    //     that.render(that.r_data);
    //   }
    // }
  }
}
