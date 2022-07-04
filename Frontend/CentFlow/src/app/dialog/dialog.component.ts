import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { clustData, DialogData, graphData } from '../interfaces';
import * as L from 'leaflet';
import * as d3 from 'd3';
import { ApiService } from '../service/api.service';
import { DialogService } from '../service/dialog.service';

declare var renderQueue: any;

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss']
})
export class DialogComponent implements OnInit {

  constructor(@Inject(MAT_DIALOG_DATA) public data: DialogData, private ds: ApiService, private diaS: DialogService) { }

  map!: L.Map;
  dIntervalScale = 'week';
  mapScaleDialog = 'log';
  chartScaleDialog = 'linear'
  dMax = 0;
  canvas: any;
  context: any;
  renderer: any;
  cData: any = undefined;
  CID = this.data.d.cid;
  startDate = this.dateToStr(new Date(this.data.d.startdate));
  endDate = this.dateToStr(new Date(this.data.d.enddate));
  tfh = Math.round(this.data.d.tfh * 100) / 100;
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
    this.diaS.setMap(this.map);
    this.canvas = d3.select(this.map.getPanes().overlayPane).select('canvas').attr('z-index', 300)
    this.context = this.canvas.node().getContext('2d');
    this.diaS.setCanvas(this.canvas);
    this.diaS.setContext(this.context);
    this.drawGraph(this.data.d.cid, this.data.interval);
    this.createCluster(this.data.d.cid, this.data.d.startdate, this.data.d.enddate);


  }

  createCluster(cid: number, start: string, end: string) {
    const that = this;
    this.ds.getCluster(cid, start, end).subscribe((data: any) => {
      this.cData = data;
      this.dMax = d3.max(data, (d: clustData) => +d.tfh)!;
      this.renderer = new renderQueue(draw).clear(clearContext);
      this.renderer(this.cData);
      // this.draw(data);

      const latExt: any = d3.extent(data, (d: clustData) => +d.lat)!;
      const lonExt: any = d3.extent(data, (d: clustData) => +d.lon)!;
      const bounds = L.latLngBounds(L.latLng(latExt[0], lonExt[0]), L.latLng(latExt[1], lonExt[1]))
      this.map.fitBounds(bounds);
    });

    this.map.on('zoomend, moveend', update);

    function draw(d: clustData) {

      let colorMap: any;
      // determining the color scaling based on user input
      if (that.mapScaleDialog == 'log') {
        colorMap = d3.scaleSymlog<string, number>();
      } else if (that.mapScaleDialog == 'sqrt') {
        colorMap = d3.scaleSqrt();
      } else if (that.mapScaleDialog == 'linear') {
        colorMap = d3.scaleLinear();
      }
      colorMap.domain([0, that.dMax]).range(["orange", "purple"]);
      const newY = that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y + 0.1;
      const newX = that.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x;
      that.context.beginPath();
      that.context.fillStyle = colorMap(d.tfh);
      that.context.rect(newX, newY, that.detSize(d)[0], that.detSize(d)[1]);
      that.context.fill();
      that.context.closePath();
    }

    function clearContext() {
      that.context.clearRect(0, 0, that.canvas.attr("width"), that.canvas.attr("height"));
    }
    function update() {
      if (that.cData != undefined) {
        that.renderer(that.cData);
      }
    }
  }



  drawGraph(cid: number, interval: string) {
    const that = this;
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
        .on('click', (event, d) => clicked(d));
    })

    function clicked(d: graphData) {
      that.startDate = that.dateToStr(new Date(d.startdate));
      that.endDate = that.dateToStr(new Date(d.enddate));
      that.tfh = Math.round(d.tfh * 100) / 100;;
      that.createCluster(cid, d.startdate, d.enddate)
    }
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

  onChangeMapScale(event: any) {
    this.createCluster(this.CID, this.startDate, this.endDate);
  }

  onChangeChartScale(event: any) {
    this.drawGraph(this.data.d.cid, this.data.interval);
  }

  dateToStr(d: Date) {
    return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2)
  }

  // drawCluster(data: clustData[]) {
  //   const that = this;
  //   const dMax = d3.max(data, (d: clustData) => +d.tfh)

  //   this.context.clearRect(0, 0, this.canvas.attr("width"), this.canvas.attr("height"));
  //   let colorMap: any;
  //   // determining the color scaling based on user input
  //   if (this.mapScaleDialog == 'log') {
  //     colorMap = d3.scaleSymlog<string, number>();
  //   } else if (this.mapScaleDialog == 'sqrt') {
  //     colorMap = d3.scaleSqrt();
  //   } else if (this.mapScaleDialog == 'linear') {
  //     colorMap = d3.scaleLinear();
  //   }

  //   colorMap.domain([0, dMax]).range(["orange", "purple"]);
  //   data.forEach((d: clustData) => {
  //     const newY = this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).y + 0.1;
  //     const newX = this.map.latLngToLayerPoint(L.latLng(d.lat, d.lon)).x;
  //     this.context.beginPath();
  //     this.context.fillStyle = colorMap(d.tfh);
  //     this.context.rect(newX, newY, this.detSize(d)[0], this.detSize(d)[1]);
  //     this.context.fill();
  //     this.context.closePath();
  //   });
  //   this.map.on('zoomend moveend', update)
  //   function update() {
  //     that.drawCluster(data);
  //   }
  // }

}
