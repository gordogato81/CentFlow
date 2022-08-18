import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { CentroidData, clustData, DialogData, graphData, hullData } from '../interfaces';
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
  tooltipViz: any;
  legend: any;
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
      minZoom: 3,
      maxZoom: 9,
      wheelPxPerZoomLevel: 120,
    };

    this.map = L.map('dMap', mapOptions).setView([0, 80]); // defaults to world view 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 9,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    L.svg().addTo(this.map);
    L.canvas({pane:'shadowPane'}).addTo(this.map);
    this.diaS.setMap(this.map);
    this.canvas = d3.select(this.map.getPanes().shadowPane).select('canvas');
    this.context = this.canvas.node().getContext('2d');
    this.diaS.setCanvas(this.canvas);
    this.diaS.setContext(this.context);
    this.dIntervalScale = this.data.interval;
    this.drawGraph(this.data.d.cid, this.data.interval);
    this.createCluster(this.data.d.cid, this.data.d.startdate, this.data.d.enddate);
    this.createHull(this.data.d.cid, this.data.interval, this.data.d.startdate, this.data.d.enddate);

    // initalizing tooltip
    this.tooltipViz = d3.select('#tooltipViz')
      .attr("class", "leaflet-interactive")
      .style('visibility', 'hidden')
      .style("position", "absolute")
      .style("background-color", "white")
      .style("border", "solid")
      .style("border-width", "1px")
      .style("border-radius", "5px")
      .style("padding", "10px")
      .style('opacity', 0.7)
      .style('z-index', 9999);
  }

  createHull(cid: number, split: string, start: string, end: string) {
    let start1: string, start2: string, end1: string, end2: string;
    const st = new Date(start);
    const en = new Date(end);
    if (this.data.interval == 'week') {
      start1 = this.dateToStr(new Date(st.getFullYear(), st.getMonth(), st.getDate() - 7));
      start2 = this.dateToStr(new Date(st.getFullYear(), st.getMonth(), st.getDate() + 7));
      end1 = this.dateToStr(new Date(en.getFullYear(), en.getMonth(), en.getDate() - 7));
      end2 = this.dateToStr(new Date(en.getFullYear(), en.getMonth(), en.getDate() + 7));
    } else {
      start1 = this.dateToStr(new Date(st.getFullYear(), st.getMonth() - 1, 1));
      start2 = this.dateToStr(new Date(st.getFullYear(), st.getMonth() + 1, 1));
      end1 = this.dateToStr(new Date(en.getFullYear(), en.getMonth(), 0));
      end2 = this.dateToStr(new Date(en.getFullYear(), en.getMonth() + 2, 0));
    }
    this.ds.getClusterHulls(cid, start1, end1, start2, end2, split).subscribe((hulls: hullData[]) => {
      if (hulls.length > 0) {
        if (hulls.length > 1) {
          this.drawHull(hulls, '');
        } else {
          if (new Date(hulls[0].startdate).getTime() == new Date(start1).getTime()) {
            this.drawHull(hulls, 'nP');
          } else {
            this.drawHull(hulls, 'pP');
          }
        }
      }

    });
  }
  drawHull(hulls: hullData[], no: string) {
    const map = this.diaS.getMap();

    // Transforming svg locations to leaflet coordinates
    const transform = d3.geoTransform({
      point: function (x, y) {
        const point = map.latLngToLayerPoint([y, x]);
        this.stream.point(point.x, point.y);
      },
    });
    let previousHull: hullData[] = [],
      nextHull: hullData[] = [];
    if (no == 'pP') {
      nextHull = [hulls[0]];
    } else if (no == 'nP') {
      previousHull = [hulls[0]];
    } else {
      previousHull = [hulls[0]];
      nextHull = [hulls[1]];
    }
    // const firstHull = [hulls[0]],
    //   secondHull = [hulls[1]];
    // Adding transformation to the path
    const path = d3.geoPath().projection(transform);
    const hullSVG = d3.select(map.getPanes().overlayPane).select('svg');
    if (!hullSVG.selectAll('g').empty()) hullSVG.selectAll('g').remove();//removes previous hull if it exists
    let firstPath = hullSVG.append('g').selectAll('path')
      .data(previousHull)
      .enter()
      .append('path')
      .attr('d', (d: hullData) => path(JSON.parse(d.hull)))
      .attr("class", "leaflet-interactive")
      .attr('pointer-events', 'painted')
      .style('fill', 'blue')
      .style('fill-opacity', 0.15)
      .attr('stroke', 'blue')
      .attr('stroke-opacity', 0.2);

    let secondPath = hullSVG.append('g').selectAll('path')
      .data(nextHull)
      .enter()
      .append('path')
      .attr('d', (d: hullData) => path(JSON.parse(d.hull)))
      .attr("class", "leaflet-interactive")
      .attr('pointer-events', 'painted')
      .style('fill', 'green')
      .style('fill-opacity', 0.15)
      .attr('stroke', 'green')
      .attr('stroke-opacity', 0.2);

    map.on('zoomend', update);

    function update() {
      firstPath.attr('d', (d: hullData) => path(JSON.parse(d.hull)));
      secondPath.attr('d', (d: hullData) => path(JSON.parse(d.hull)));
    }
  }
  createCluster(cid: number, start: string, end: string) {
    const that = this;
    const legendheight = 10;
    const legendwidth = 345;

    this.legend = d3.select('#legend');
    let colorMap: any;
    let colorScale: any;
    // determining the color scaling based on user input
    if (that.mapScaleDialog == 'log') {
      colorMap = d3.scaleSymlog<string, number>();
      colorScale = d3.scaleSymlog<string, number>();
    } else if (that.mapScaleDialog == 'sqrt') {
      colorMap = d3.scaleSqrt();
      colorScale = d3.scaleSqrt();
    } else if (that.mapScaleDialog == 'linear') {
      colorMap = d3.scaleLinear();
      colorScale = d3.scaleLinear();
    }
    colorMap.domain([0, that.dMax]).range(["orange", "purple"]);

    // >>> removing any previous legend DOM elements 
    if (!this.legend.selectAll('rect').empty()) this.legend.selectAll('rect').remove();
    if (!this.legend.selectAll('g').empty()) this.legend.selectAll('g').remove();
    if (!this.legend.selectAll('text').empty()) this.legend.selectAll('text').remove();
    // <<< 

    this.ds.getCluster(cid, start, end).subscribe((data: clustData[]) => {
      this.cData = data;
      this.dMax = d3.max(data, (d: clustData) => +d.tfh)!;
      this.renderer = new renderQueue(draw).clear(clearContext);
      this.renderer(this.cData);
      // this.draw(data);

      const latExt: any = d3.extent(data, (d: clustData) => +d.lat)!;
      const lonExt: any = d3.extent(data, (d: clustData) => +d.lon)!;
      const bounds = L.latLngBounds(L.latLng(latExt[0], lonExt[0]), L.latLng(latExt[1], lonExt[1]))
      this.map.fitBounds(bounds);
      colorScale.domain([0, this.dMax]).range([0, legendwidth - 1]);
      colorMap.domain([0, that.dMax]).range(["orange", "purple"]);

      const coloraxis = d3.axisBottom(colorScale).ticks(5);

      // >>> constructing legend
      this.legend.append("defs")
        .append('linearGradient')
        .attr("id", "gradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%") // horizontal gradient
        .attr("y2", "0%") // vertical gradient
        .selectAll('stop')
        .data([{ offset: "0%", color: "orange" },
        { offset: "100%", color: "purple" }])
        .join("stop")
        .attr("offset", (d: any) => d.offset)
        .attr("stop-color", (d: any) => d.color)

      const rect = this.legend
        .append("rect")
        .attr("x", 10)
        .attr("y", 18)
        .attr("width", legendwidth)
        .attr("height", legendheight)
        .style("fill", "url(#gradient)")
      // .style('opacity', 0.9);

      this.legend.append('g')
        .attr("id", "legendAxis")
        .attr("transform", "translate(10, 25)")
        .call(coloraxis)
        .call((g: any) => g.select(".domain")
          .remove())
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end");

      this.legend.append('text')
        .attr('x', 60)
        .attr('y', 13)
        // .attr("transform", "rotate(90)")
        .text('Apparent Fishing Activity in Hours')
      // <<<

      update()
    });


    this.map.on('zoomend, moveend', update);
    this.map.on('click', function (event: L.LeafletMouseEvent) {
      console.log(event);
      const data = that.cData;
      // + 0.1 to the latitude to change raster position from top left to bottom left of each raster rectangle
      const lat = that.truncate(Math.round((event.latlng.lat + 0.1) * 100) / 100);
      const lng = that.truncate(event.latlng.lng);


      if (!(data === undefined)) {
        const d: any = data.find((d: clustData) => d.lat == lat && d.lon == lng);
        if (!(d === undefined)) {
          that.tooltipViz
            .style('z-index', 9999)
            .style('visibility', 'visible')
            .style('left', event.originalEvent.pageX + 20 + "px")
            .style('top', event.originalEvent.pageY + 20 + "px")
            .html('Latitude: ' + d.lat + '<br>'
              + 'Longitude: ' + d.lon + '<br>'
              + 'Fishing Hours: ' + Math.round(d.tfh * 100) / 100);
        } else {
          that.tooltipViz.style('visibility', 'hidden');
        }
      }
    });

    function draw(d: clustData) {
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
      if (!d3.select('#graphtooltip').empty()) d3.select('#graphtooltip').remove(); //removes previous chart if it exists

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

      const tooltip = d3.select("#dChart")
        .append('div')
        .attr('id', 'graphtooltip')
        .style("position", "absolute")
        .style('z-index', 9999)
        .style('visibility', 'hidden')
        .style('opacity', 0.8)
        .style("background-color", "white")
        .style("border", "solid")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "10px");

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
      let startPrev: String, startNext: String;
      const st = new Date(this.startDate);
      if (this.data.interval == 'week') {
        startPrev = this.dateToStr(new Date(st.getFullYear(), st.getMonth(), st.getDate() - 7));
        startNext = this.dateToStr(new Date(st.getFullYear(), st.getMonth(), st.getDate() + 7));
      } else {
        startPrev = this.dateToStr(new Date(st.getFullYear(), st.getMonth() - 1, 1));
        startNext = this.dateToStr(new Date(st.getFullYear(), st.getMonth() + 1, 1));
      }
      svg.selectAll("mybar")
        .data(grata)
        .join("rect")
        .attr("x", d => x(this.dateToStr(new Date(d.startdate)))!)
        .attr("y", d => y(d.tfh))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.tfh))
        .attr("fill", d => {
          const cDate = this.dateToStr(new Date(d.startdate))
          // console.log(cDate)
          if (cDate == this.dateToStr(new Date(this.startDate))) {
            return 'grey'
          } else if (cDate == startPrev) {
            return 'blue'
          } else if (cDate == startNext) {
            return 'green'
          } else {
            return 'purple'
          }
        })
        .on('pointermove', (event, d) => mousemove(event, d))
        .on('pointerout', mouseleave)
        .on('click', (event, d) => clicked(d));

      // displays tooltip when the moouse moves
      function mousemove(event: PointerEvent, d: graphData) {
        tooltip
          .style('visibility', 'visible')
          .style('left', event.pageX + 20 + "px")
          .style('top', event.pageY + 20 + "px")
          .html('Start Date: ' + that.dateToStr(new Date(d.startdate)) + '<br>'
            + 'End Date: ' + that.dateToStr(new Date(d.enddate)) + '<br>'
            + 'Total Fishing Hours: ' + Math.round(d.tfh * 100) / 100);
      }

      // removes tooltip 
      function mouseleave() {
        if (tooltip) tooltip.style('visibility', 'hidden');
      }
    })

    function clicked(d: graphData) {
      that.startDate = that.dateToStr(new Date(d.startdate));
      that.endDate = that.dateToStr(new Date(d.enddate));
      that.tfh = Math.round(d.tfh * 100) / 100;
      that.drawGraph(cid, that.dIntervalScale)
      that.createCluster(cid, d.startdate, d.enddate);
      that.createHull(that.data.d.cid, that.dIntervalScale, d.startdate, d.enddate);
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

  onChangeMapScale(event: any) {
    this.createCluster(this.CID, this.startDate, this.endDate);
  }

  onChangeChartScale(event: any) {
    this.drawGraph(this.data.d.cid, this.data.interval);
  }

  dateToStr(d: Date) {
    return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2)
  }

  truncate(x: number) {
    if (x < 0) {
      x = Math.ceil((x - 0.1) * 10) / 10;
    } else if (x >= 0) {
      x = Math.floor(x * 10) / 10;
    }
    return x
  }

}
