import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { clustData, DialogData, graphData } from '../interfaces';
import * as L from 'leaflet';
import * as d3 from 'd3';
import { ApiService } from '../service/api.service';


@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss']
})
export class DialogComponent implements OnInit {

  constructor(@Inject(MAT_DIALOG_DATA) public data: DialogData, private ds: ApiService,) { }

  map!: L.Map;
  dIntervalScale = 'week';
  mapScaleDialog = 'log';
  chartScaleDialog = 'linear'
  dMax = 0;
  canvas: any;
  context: any;
  ngOnInit(): void {
    const that = this;
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
    this.canvas= d3.select(this.map.getPanes().overlayPane).select('canvas').attr('z-index', 300)
    this.context = this.canvas.node().getContext('2d');

    this.drawGraph(this.data.d.cid, this.data.interval);
    this.createCluster(this.data.d.cid, this.data.d.startdate, this.data.d.enddate);
  }

  createCluster(cid: number, start: string, end: string) {
    this.ds.getCluster(cid, start, end).subscribe((data: any) => {
      this.drawCluster(data);
    });
  }

  drawCluster(data: clustData[]) {
    const that = this;
    const dMax = d3.max(data, (d: clustData) => +d.tfh)
    
    this.context.clearRect(0, 0, this.canvas.attr("width"), this.canvas.attr("height"));
    let colorMap: any;
    // determining the color scaling based on user input
    if (this.mapScaleDialog == 'log') {
      colorMap = d3.scaleSymlog<string, number>();
    } else if (this.mapScaleDialog == 'sqrt') {
      colorMap = d3.scaleSqrt();
    } else if (this.mapScaleDialog == 'linear') {
      colorMap = d3.scaleLinear();
    }

    colorMap.domain([0, dMax]).range(["orange", "purple"]);
    data.forEach((d: clustData) => {
      const newY = this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y + 0.1;
      const newX = this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x;
      this.context.beginPath();
      this.context.fillStyle = colorMap(d.tfh);
      this.context.rect(newX, newY, this.detSize(d)[0], this.detSize(d)[1]);
      this.context.fill();
      this.context.closePath();
    });
    this.map.on('zoomend moveend', update)
    function update() {
      that.drawCluster(data);
    }
  }

  drawGraph(cid: number, interval: string) {
    this.ds.getClusterGraph(cid, interval).subscribe((gdata: any) => {
      if (!d3.select('#dChart').select('svg').empty()) d3.select('#dChart').select('svg').remove(); //removes previous chart if it exists
      const grata: graphData[] = gdata!
      const margin = { top: 30, right: 30, bottom: 60, left: 60 };
      const graphContainer = document.getElementById('dChart')!;
      const width = graphContainer.offsetWidth - margin.left - margin.right,
        height = graphContainer.offsetHeight - margin.top - margin.bottom;
      const cMax: number = d3.max(grata, (d: graphData) => +d.tfh)!;
      let barDomain: string[] = []

      grata.forEach((element: graphData) => {
        barDomain.push(element.startdate)
      });
      const svg = d3.select('#dChart')
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
      // X axis
      let x = d3.scaleBand<string>()
        .range([0, width])
        .domain(grata.map(d => this.dateToStr(new Date(d.startdate))))
        .padding(0.2);

      svg.append("g")
        .attr("transform", `translate(0, ${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

      // Add Y axis
      let y: any;
      if (this.chartScaleDialog == 'log') {
        y = d3.scaleSymlog();
      } else if (this.chartScaleDialog == 'sqrt') {
        y = d3.scaleSqrt();
      } else {
        y = d3.scaleLinear();
      }

      y.domain([0, cMax])
        .range([height, 0]);

      svg.append("g")
        .call(d3.axisLeft(y));
      // Bars
      svg.selectAll("mybar")
        .data(grata)
        .join("rect")
        .attr("x", d => x(this.dateToStr(new Date(d.startdate)))!)
        .attr("y", d => y(d.tfh))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.tfh))
        .attr("fill", "purple")
    })
  }

  detSize(d: any) {
    const lat: number = parseFloat(d.lat);
    const lon: number = parseFloat(d.lon);
    const zoom = this.map.getZoom();
    let first, second;
    if (zoom == 2) {
      first = L.latLng(lat - 0.01, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else if (zoom == 3) {
      first = L.latLng(lat - 0.03, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else if (zoom == 4) {
      first = L.latLng(lat - 0.025, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else if (zoom == 5) {
      first = L.latLng(lat - 0.017, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else if (zoom == 6) {
      first = L.latLng(lat - 0.005, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else if (zoom == 7) {
      first = L.latLng(lat - 0.002, lon);
      second = L.latLng(lat + 0.1, lon + 0.1);
    } else {
      first = L.latLng(lat, lon); // -0.01 Removes horizontal streak artifact
      second = L.latLng(lat + 0.1, lon + 0.1);
    }

    let diffX = Math.abs(this.map.latLngToContainerPoint(first).x - this.map.latLngToContainerPoint(second).x);
    let diffY = Math.abs(this.map.latLngToContainerPoint(first).y - this.map.latLngToContainerPoint(second).y);
    diffX = diffX < 1 ? 1 : diffX;
    diffY = diffY < 1 ? 1 : diffY;
    const size: [number, number] = [diffX, diffY];
    return size
  }

  onChangeDialog(event: any) {

  }

  onChangeChartScale(event: any) {
    this.drawGraph(this.data.d.cid, this.data.interval);
  }

  dateToStr(d: Date) {
    return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2)
  }
}
