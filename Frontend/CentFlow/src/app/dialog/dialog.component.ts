import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import * as d3 from 'd3';
import { ApiService } from '../service/api.service';
import { DialogData, clustData, graphData, hullData } from '../interfaces';
import {
  toClusterCellFeatureCollection,
  toHullFeatureCollection,
} from '../map/map-geojson';
import { createMapAdapter, type MapAdapter } from '../map/map-adapter';
import { renderTooltipLines } from '../tooltip.util';

const CLUSTER_SOURCE_ID = 'centflow-dialog-cluster-source';
const CLUSTER_LAYER_ID = 'centflow-dialog-cluster-layer';
const HULL_PREV_SOURCE_ID = 'centflow-dialog-hull-prev-source';
const HULL_PREV_FILL_LAYER_ID = 'centflow-dialog-hull-prev-fill';
const HULL_PREV_LINE_LAYER_ID = 'centflow-dialog-hull-prev-line';
const HULL_NEXT_SOURCE_ID = 'centflow-dialog-hull-next-source';
const HULL_NEXT_FILL_LAYER_ID = 'centflow-dialog-hull-next-fill';
const HULL_NEXT_LINE_LAYER_ID = 'centflow-dialog-hull-next-line';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.scss'],
  standalone: false,
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialogMap', { static: true })
  private readonly dialogMapElement!: ElementRef<HTMLDivElement>;

  @ViewChild('dialogContent', { static: true })
  private readonly dialogContentElement!: ElementRef<HTMLDivElement>;

  @ViewChild('dialogChart', { static: true })
  private readonly dialogChartElement!: ElementRef<HTMLDivElement>;

  @ViewChild('legend', { static: true })
  private readonly legendElement!: ElementRef<SVGSVGElement>;

  @ViewChild('tooltipViz', { static: true })
  private readonly tooltipElement!: ElementRef<HTMLDivElement>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: DialogData,
    private readonly ds: ApiService,
  ) {
    this.CID = this.data.d.cid;
    this.startDate = this.dateToStr(new Date(this.data.d.startdate));
    this.endDate = this.dateToStr(new Date(this.data.d.enddate));
    this.tfh = Math.round(this.data.d.tfh * 100) / 100;
  }

  private map!: MapAdapter;
  private graphEntries: graphData[] = [];
  dIntervalScale = 'week';
  mapScaleDialog = 'log';
  chartScaleDialog = 'linear';
  dMax = 0;
  tooltipViz: any;
  legend: any;
  cData: clustData[] | undefined;
  CID: number;
  startDate: string;
  endDate: string;
  tfh: number;

  private positionTooltip(
    tooltip: any,
    container: HTMLElement,
    event: MouseEvent | PointerEvent,
    offsetX = 16,
    offsetY = 16,
  ) {
    const [pointerX, pointerY] = d3.pointer(event, container);
    const tooltipNode = tooltip.node() as HTMLElement | null;
    const tooltipWidth = tooltipNode?.offsetWidth ?? 0;
    const tooltipHeight = tooltipNode?.offsetHeight ?? 0;
    const maxLeft = Math.max(container.clientWidth - tooltipWidth - 8, 0);
    const maxTop = Math.max(container.clientHeight - tooltipHeight - 8, 0);
    const left = Math.max(0, Math.min(pointerX + offsetX, maxLeft));
    const top = Math.max(0, Math.min(pointerY + offsetY, maxTop));

    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  }

  ngAfterViewInit(): void {
    this.initializeMap();
    this.initializeTooltip();
    this.dIntervalScale = this.data.interval;

    this.ds
      .getClusterGraph(this.data.d.cid, this.data.interval)
      .subscribe((gdata) => {
        this.graphEntries = gdata;
        this.drawGraph(this.data.d.cid, this.data.interval);
      });

    this.createCluster(
      this.data.d.cid,
      this.data.d.startdate,
      this.data.d.enddate,
    );
    this.createHull(
      this.data.d.cid,
      this.data.interval,
      this.data.d.startdate,
      this.data.d.enddate,
    );

    requestAnimationFrame(() => this.map.resize());
  }

  ngOnDestroy() {
    this.clearNativeLayers();
    this.map?.destroy();
  }

  private initializeMap() {
    this.map = createMapAdapter(this.dialogMapElement.nativeElement, {
      center: { lat: 0, lon: 80 },
      zoom: 4,
      minZoom: 3,
      maxZoom: 9,
      scaleControlPosition: 'top-right',
    });

    this.map.getMap().on('click', (event) => this.handleMapClick(event));
  }

  private initializeTooltip() {
    this.tooltipViz = d3
      .select(this.tooltipElement.nativeElement)
      .style('visibility', 'hidden')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('background-color', 'white')
      .style('border', 'solid')
      .style('border-width', '1px')
      .style('border-radius', '5px')
      .style('padding', '10px')
      .style('opacity', '0.7')
      .style('z-index', '9999');
  }

  private handleMapClick(event: any) {
    const feature = this.map.queryRenderedFeatures(
      {
        x: event.point.x,
        y: event.point.y,
      },
      { layers: [CLUSTER_LAYER_ID] },
    )[0];

    if (!feature?.properties) {
      this.tooltipViz.style('visibility', 'hidden');
      return;
    }

    this.tooltipViz
      .style('visibility', 'visible');
    renderTooltipLines(this.tooltipViz.node() as HTMLElement | null, [
      `Latitude: ${feature.properties['lat']}`,
      `Longitude: ${feature.properties['lon']}`,
      `Fishing Hours: ${
        Math.round(Number(feature.properties['tfh']) * 100) / 100
      }`,
    ]);
    this.positionTooltip(
      this.tooltipViz,
      this.dialogContentElement.nativeElement,
      event.originalEvent as MouseEvent,
    );
  }

  createHull(cid: number, split: string, start: string, end: string) {
    let start1: string;
    let start2: string;
    let end1: string;
    let end2: string;
    const st = new Date(start);
    const en = new Date(end);
    if (this.data.interval === 'week') {
      start1 = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth(), st.getDate() - 7),
      );
      start2 = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth(), st.getDate() + 7),
      );
      end1 = this.dateToStr(
        new Date(en.getFullYear(), en.getMonth(), en.getDate() - 7),
      );
      end2 = this.dateToStr(
        new Date(en.getFullYear(), en.getMonth(), en.getDate() + 7),
      );
    } else {
      start1 = this.dateToStr(new Date(st.getFullYear(), st.getMonth() - 1, 1));
      start2 = this.dateToStr(new Date(st.getFullYear(), st.getMonth() + 1, 1));
      end1 = this.dateToStr(new Date(en.getFullYear(), en.getMonth(), 0));
      end2 = this.dateToStr(new Date(en.getFullYear(), en.getMonth() + 2, 0));
    }

    this.ds
      .getClusterHulls(cid, start1, end1, start2, end2, split)
      .subscribe((hulls) => {
        if (hulls.length === 0) {
          this.applyNativeHulls([], []);
          return;
        }

        let previousHull: hullData[] = [];
        let nextHull: hullData[] = [];
        if (hulls.length > 1) {
          previousHull = [hulls[0]];
          nextHull = [hulls[1]];
        } else if (
          new Date(hulls[0].startdate).getTime() === new Date(start1).getTime()
        ) {
          previousHull = [hulls[0]];
        } else {
          nextHull = [hulls[0]];
        }

        this.applyNativeHulls(previousHull, nextHull);
      });
  }

  private applyNativeHulls(previousHull: hullData[], nextHull: hullData[]) {
    this.map.addOrUpdateGeoJsonSource(
      HULL_PREV_SOURCE_ID,
      toHullFeatureCollection(previousHull),
    );
    this.map.addOrUpdateGeoJsonSource(
      HULL_NEXT_SOURCE_ID,
      toHullFeatureCollection(nextHull),
    );

    this.map.addLayer({
      id: HULL_PREV_FILL_LAYER_ID,
      type: 'fill',
      source: HULL_PREV_SOURCE_ID,
      paint: {
        'fill-color': '#0000ff',
        'fill-opacity': 0.15,
      },
    });
    this.map.addLayer({
      id: HULL_PREV_LINE_LAYER_ID,
      type: 'line',
      source: HULL_PREV_SOURCE_ID,
      paint: {
        'line-color': '#0000ff',
        'line-opacity': 0.2,
        'line-width': 1,
      },
    });
    this.map.addLayer({
      id: HULL_NEXT_FILL_LAYER_ID,
      type: 'fill',
      source: HULL_NEXT_SOURCE_ID,
      paint: {
        'fill-color': '#008000',
        'fill-opacity': 0.15,
      },
    });
    this.map.addLayer({
      id: HULL_NEXT_LINE_LAYER_ID,
      type: 'line',
      source: HULL_NEXT_SOURCE_ID,
      paint: {
        'line-color': '#008000',
        'line-opacity': 0.2,
        'line-width': 1,
      },
    });
  }

  createCluster(cid: number, start: string, end: string) {
    const legendHeight = 10;
    const legendWidth = 345;
    this.legend = d3.select(this.legendElement.nativeElement);

    let colorScale: any;
    if (this.mapScaleDialog === 'log') {
      colorScale = d3.scaleSymlog<string, number>();
    } else if (this.mapScaleDialog === 'sqrt') {
      colorScale = d3.scaleSqrt();
    } else {
      colorScale = d3.scaleLinear();
    }

    this.legend.selectAll('*').remove();

    this.ds.getCluster(cid, start, end).subscribe((data) => {
      this.cData = data;
      this.dMax = d3.max(data, (d) => +d.tfh) ?? 0;

      this.applyNativeCluster(data);
      this.map.fitBounds(data.map((d) => ({ lat: d.lat, lon: d.lon })));

      colorScale.domain([0, this.dMax]).range([0, legendWidth - 1]);

      const coloraxis = d3.axisBottom(colorScale).ticks(5);

      this.legend
        .append('defs')
        .append('linearGradient')
        .attr('id', 'gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%')
        .selectAll('stop')
        .data([
          { offset: '0%', color: 'orange' },
          { offset: '100%', color: 'purple' },
        ])
        .join('stop')
        .attr('offset', (d: any) => d.offset)
        .attr('stop-color', (d: any) => d.color);

      this.legend
        .append('rect')
        .attr('x', 10)
        .attr('y', 18)
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#gradient)')
        .style('cursor', 'pointer');

      this.legend
        .append('g')
        .attr('id', 'legendAxis')
        .attr('transform', 'translate(10, 25)')
        .call(coloraxis)
        .call((g: any) => g.select('.domain').remove())
        .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');

      this.legend
        .append('text')
        .attr('x', 60)
        .attr('y', 13)
        .text('Apparent Fishing Activity in Hours');
    });
  }

  private applyNativeCluster(data: clustData[]) {
    this.map.addOrUpdateGeoJsonSource(
      CLUSTER_SOURCE_ID,
      toClusterCellFeatureCollection(data),
    );
    this.map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'fill',
      source: CLUSTER_SOURCE_ID,
      paint: {
        'fill-color': this.buildClusterColorExpression() as ExpressionSpecification,
        'fill-opacity': 1,
      },
    });
  }

  private buildClusterColorExpression() {
    const maxValue = Math.max(this.dMax, 1);

    if (this.mapScaleDialog === 'log') {
      return [
        'interpolate',
        ['linear'],
        ['ln', ['+', ['get', 'tfh'], 1]],
        0,
        'orange',
        Math.log(maxValue + 1),
        'purple',
      ];
    }

    if (this.mapScaleDialog === 'sqrt') {
      return [
        'interpolate',
        ['linear'],
        ['sqrt', ['get', 'tfh']],
        0,
        'orange',
        Math.sqrt(maxValue),
        'purple',
      ];
    }

    return [
      'interpolate',
      ['linear'],
      ['get', 'tfh'],
      0,
      'orange',
      maxValue,
      'purple',
    ];
  }

  private clearNativeLayers() {
    this.map?.removeLayer(CLUSTER_LAYER_ID);
    this.map?.removeLayer(HULL_PREV_FILL_LAYER_ID);
    this.map?.removeLayer(HULL_PREV_LINE_LAYER_ID);
    this.map?.removeLayer(HULL_NEXT_FILL_LAYER_ID);
    this.map?.removeLayer(HULL_NEXT_LINE_LAYER_ID);
    this.map?.removeSource(CLUSTER_SOURCE_ID);
    this.map?.removeSource(HULL_PREV_SOURCE_ID);
    this.map?.removeSource(HULL_NEXT_SOURCE_ID);
  }

  drawGraph(cid: number, interval: string) {
    if (!d3.select('#dChart').select('svg').empty()) {
      d3.select('#dChart').select('svg').remove();
    }
    if (!d3.select('#graphtooltip').empty()) {
      d3.select('#graphtooltip').remove();
    }

    const grata = this.graphEntries;
    const margin = { top: 30, right: 30, bottom: 60, left: 60 };
    const graphContainer = this.dialogChartElement.nativeElement;
    const width = graphContainer.offsetWidth - margin.left - margin.right;
    const height = graphContainer.offsetHeight - margin.top - margin.bottom;
    const cMax: number = d3.max(grata, (d) => +d.tfh) ?? 0;

    const svg = d3
      .select(graphContainer)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const tooltip = d3
      .select(graphContainer)
      .append('div')
      .attr('id', 'graphtooltip')
      .style('position', 'absolute')
      .style('pointer-events', 'none')
      .style('z-index', '9999')
      .style('visibility', 'hidden')
      .style('opacity', '0.8')
      .style('background-color', 'white')
      .style('border', 'solid')
      .style('border-width', '1px')
      .style('border-radius', '5px')
      .style('padding', '10px');

    const x = d3
      .scaleBand<string>()
      .range([0, width])
      .domain(grata.map((d) => this.dateToStr(new Date(d.startdate))))
      .padding(0.2);

    svg
      .append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'translate(-10,0)rotate(-45)')
      .style('text-anchor', 'end');

    let y: any;
    if (this.chartScaleDialog === 'log') {
      y = d3.scaleSymlog();
    } else if (this.chartScaleDialog === 'sqrt') {
      y = d3.scaleSqrt();
    } else {
      y = d3.scaleLinear();
    }
    y.domain([0, cMax]).range([height, 0]);

    svg.append('g').call(d3.axisLeft(y));

    let startPrev: string;
    let startNext: string;
    const st = new Date(this.startDate);
    if (interval === 'week') {
      startPrev = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth(), st.getDate() - 7),
      );
      startNext = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth(), st.getDate() + 7),
      );
    } else {
      startPrev = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth() - 1, 1),
      );
      startNext = this.dateToStr(
        new Date(st.getFullYear(), st.getMonth() + 1, 1),
      );
    }

    svg
      .selectAll('mybar')
      .data(grata)
      .join('rect')
      .attr('x', (d) => x(this.dateToStr(new Date(d.startdate))) ?? 0)
      .attr('y', (d) => y(d.tfh))
      .attr('width', x.bandwidth())
      .attr('height', (d) => height - y(d.tfh))
      .attr('fill', (d) => {
        const cDate = this.dateToStr(new Date(d.startdate));
        if (cDate === this.dateToStr(new Date(this.startDate))) {
          return 'grey';
        }
        if (cDate === startPrev) {
          return 'blue';
        }
        if (cDate === startNext) {
          return 'green';
        }
        return 'purple';
      })
      .style('cursor', 'pointer')
      .on('pointermove', (event: PointerEvent, d) => {
        tooltip
          .style('visibility', 'visible');
        renderTooltipLines(tooltip.node() as HTMLElement | null, [
          `Start Date: ${this.dateToStr(new Date(d.startdate))}`,
          `End Date: ${this.dateToStr(new Date(d.enddate))}`,
          `Total Fishing Hours: ${Math.round(d.tfh * 100) / 100}`,
        ]);
        this.positionTooltip(tooltip, graphContainer, event);
      })
      .on('pointerout', () => {
        tooltip.style('visibility', 'hidden');
      })
      .on('click', (_, d) => {
        this.startDate = this.dateToStr(new Date(d.startdate));
        this.endDate = this.dateToStr(new Date(d.enddate));
        this.tfh = Math.round(d.tfh * 100) / 100;
        this.drawGraph(cid, this.dIntervalScale);
        this.createCluster(cid, d.startdate, d.enddate);
        this.createHull(this.data.d.cid, this.dIntervalScale, d.startdate, d.enddate);
      });
  }

  onChangeMapScale(_: unknown) {
    if (this.cData === undefined) {
      this.createCluster(this.CID, this.startDate, this.endDate);
      return;
    }

    this.map.setPaintProperty(
      CLUSTER_LAYER_ID,
      'fill-color',
      this.buildClusterColorExpression() as ExpressionSpecification,
    );
  }

  onChangeChartScale(_: unknown) {
    this.drawGraph(this.data.d.cid, this.data.interval);
  }

  onWindowResize() {
    this.map.resize();
    this.onChangeChartScale(null);
  }

  dateToStr(d: Date) {
    return (
      d.getFullYear() +
      '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) +
      '-' +
      ('0' + d.getDate()).slice(-2)
    );
  }
}
