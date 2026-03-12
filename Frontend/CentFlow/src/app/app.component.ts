import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import * as d3 from 'd3';
import { grid } from 'ldrs';
import { finalize } from 'rxjs/operators';
import { AppService } from 'src/app/service/app.service';
import { DialogComponent } from './dialog/dialog.component';
import { CentroidData } from './interfaces';
import { toCentroidFeatureCollection, toTrajectoryLineFeatureCollection } from './map/map-geojson';
import { createMapAdapter, type MapAdapter } from './map/map-adapter';
import { DEFAULT_MAP_RENDER_MODE, type MapRenderMode } from './map/render-mode';
import { TrajectoryWebGLLayer } from './map/trajectory-webgl-layer';
import { PrivacyPolicyDialogComponent } from './privacy-policy-dialog/privacy-policy-dialog.component';
import { ApiService } from './service/api.service';

grid.register();

const DOTS_SOURCE_ID = 'centflow-centroids-source';
const DOTS_LAYER_ID = 'centflow-centroids-layer';
const TRAJECTORY_LINE_SOURCE_ID = 'centflow-trajectories-line-source';
const TRAJECTORY_LINE_LAYER_ID = 'centflow-trajectories-line-layer';
const TRAJECTORY_CUSTOM_LAYER_ID = 'centflow-trajectories-custom-layer';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLDivElement>;

  title = 'CentFlow';

  constructor(
    private readonly ds: ApiService,
    private readonly aS: AppService,
    public readonly dialog: MatDialog,
  ) {}

  private map!: MapAdapter;
  private overlayGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private overlayCanvas!: d3.Selection<
    HTMLCanvasElement,
    unknown,
    null,
    undefined
  >;
  private removeViewListener?: () => void;
  private readonly nativeLayerCleanups: Array<() => void> = [];
  private readonly trajectoryLayer = new TrajectoryWebGLLayer(
    TRAJECTORY_CUSTOM_LAYER_ID,
  );
  private currentCentroids: CentroidData[] = [];
  private maxTrajWidth = 12;
  renderer: any;
  trajectories: CentroidData[][] = [];
  renderMode: MapRenderMode = DEFAULT_MAP_RENDER_MODE;
  mapScale = 'linear';
  intervalScale = 'month';
  minDate: Date = new Date('2019-01-01');
  maxDate: Date = new Date('2020-12-31');
  range = new FormGroup({
    start: new FormControl(),
    end: new FormControl(),
  });
  isLoading = true;

  private positionTooltip(
    tooltip: any,
    event: MouseEvent | PointerEvent,
    offset = 20,
  ) {
    const tooltipNode = tooltip.node();
    const tooltipWidth = tooltipNode?.offsetWidth ?? 0;
    const tooltipHeight = tooltipNode?.offsetHeight ?? 0;
    const maxLeft = Math.max(window.innerWidth - tooltipWidth - 8, 8);
    const maxTop = Math.max(window.innerHeight - tooltipHeight - 8, 8);
    const preferredLeft = event.clientX + offset;
    const preferredTop = event.clientY + offset;
    const fallbackLeft = event.clientX - tooltipWidth - offset;
    const fallbackTop = event.clientY - tooltipHeight - offset;
    const left = Math.max(
      8,
      Math.min(
        preferredLeft <= maxLeft ? preferredLeft : fallbackLeft,
        maxLeft,
      ),
    );
    const top = Math.max(
      8,
      Math.min(preferredTop <= maxTop ? preferredTop : fallbackTop, maxTop),
    );

    tooltip.style('left', `${left}px`).style('top', `${top}px`);
  }

  ngAfterViewInit() {
    this.initializeMap();
  }

  ngOnDestroy() {
    this.removeViewListener?.();
    this.clearNativeLayers();
    this.map?.destroy();
  }

  private initializeMap() {
    this.showProgress();

    this.map = createMapAdapter(this.mapContainer.nativeElement, {
      center: { lat: 0, lon: 80 },
      zoom: 4,
      minZoom: 0,
      maxZoom: 14,
      zoomSnap: 1,
      scaleControlPosition: 'bottom-left',
    });

    this.overlayCanvas = d3
      .select(this.map.getCanvasLayer())
      .style('z-index', '300');
    this.overlayGroup = d3
      .select(this.map.getSvgLayer())
      .style('z-index', '301')
      .append('g');

    const context = this.overlayCanvas.node()?.getContext('2d');
    if (!context) {
      this.hideProgress();
      return;
    }

    this.aS.setContext(context);
    this.aS.setCanvas(this.overlayCanvas);
    this.aS.setMap(this.map);
    this.removeViewListener = this.map.onViewChange(() => {
      if (this.renderMode === 'legacy-overlay') {
        this.redrawLegacyOverlays();
      }
    });

    const start = '2020-01-01';
    const end = '2020-07-31';
    this.range.setValue({ start, end });
    this.ds
      .getCentroids(this.intervalScale, start, end)
      .pipe(finalize(() => this.hideProgress()))
      .subscribe((cents) => this.applyMapData(cents));
  }

  private applyMapData(cents: CentroidData[]) {
    this.currentCentroids = cents;
    this.aS.setData(cents);
    this.trajectories = this.buildTrajectories(cents);
    this.aS.setTrajectories(this.trajectories);

    if (this.renderMode === 'native-gpu') {
      this.renderNativeMap(cents);
      return;
    }

    this.renderLegacyMap(cents);
  }

  private buildTrajectories(cents: CentroidData[]) {
    const grouped = new Map<number, CentroidData[]>();
    for (const centroid of cents) {
      const existing = grouped.get(centroid.cid);
      if (existing) {
        existing.push(centroid);
      } else {
        grouped.set(centroid.cid, [centroid]);
      }
    }
    return Array.from(grouped.values());
  }

  private renderLegacyMap(cents: CentroidData[]) {
    this.clearNativeLayers();
    this.setLegacyOverlayVisibility(true);
    this.dots(cents);
    this.createArrow(cents);
  }

  private renderNativeMap(cents: CentroidData[]) {
    this.clearLegacyOverlays();
    this.setLegacyOverlayVisibility(false);
    this.setupNativeLayers(cents);
  }

  private setLegacyOverlayVisibility(isVisible: boolean) {
    const display = isVisible ? 'block' : 'none';
    this.overlayCanvas.style('display', display);
    d3.select(this.map.getSvgLayer()).style('display', display);
  }

  private clearLegacyOverlays() {
    this.overlayGroup.selectAll('*').remove();
    const canvasNode = this.overlayCanvas.node();
    const context = canvasNode?.getContext('2d');
    if (context && canvasNode) {
      context.clearRect(0, 0, canvasNode.width, canvasNode.height);
    }
  }

  private setupNativeLayers(cents: CentroidData[]) {
    const trajectories = this.trajectories;
    this.map.addOrUpdateGeoJsonSource(
      DOTS_SOURCE_ID,
      toCentroidFeatureCollection(cents),
    );
    this.map.addOrUpdateGeoJsonSource(
      TRAJECTORY_LINE_SOURCE_ID,
      toTrajectoryLineFeatureCollection(trajectories),
    );
    this.trajectoryLayer.setTrajectories(
      trajectories,
      this.mapScale as 'linear' | 'sqrt' | 'log',
      this.maxTrajWidth,
    );

    this.map.addCustomLayer(this.trajectoryLayer);
    this.map.addLayer({
      id: TRAJECTORY_LINE_LAYER_ID,
      type: 'line',
      source: TRAJECTORY_LINE_SOURCE_ID,
      paint: {
        'line-color': '#000000',
        'line-width': 3,
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
    });
    this.map.addLayer({
      id: DOTS_LAYER_ID,
      type: 'circle',
      source: DOTS_SOURCE_ID,
      paint: {
        'circle-radius': 4,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#000000',
        'circle-stroke-width': 1,
      },
    });

    this.bindNativePointInteractions();
    this.map.triggerRepaint();
  }

  private bindNativePointInteractions() {
    while (this.nativeLayerCleanups.length > 0) {
      this.nativeLayerCleanups.pop()?.();
    }

    const dotTip = d3
      .select('#tooltip')
      .style('visibility', 'hidden')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background-color', 'white')
      .style('border', 'solid')
      .style('border-width', '1px')
      .style('border-radius', '5px')
      .style('padding', '10px')
      .style('opacity', '0.7')
      .style('z-index', '10000');

    this.nativeLayerCleanups.push(
      this.map.onLayerEvent('mousemove', DOTS_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties) {
          return;
        }

        dotTip
          .style('visibility', 'visible')
          .html(
            'CID: ' +
              feature.properties['cid'] +
              '<br>' +
              'Total Fishing Hours: ' +
              Math.round(Number(feature.properties['tfh']) * 100) / 100 +
              '<br>' +
              'Start Date: ' +
              this.dateToStr(new Date(String(feature.properties['startdate']))) +
              '<br>' +
              'End Date: ' +
              this.dateToStr(new Date(String(feature.properties['enddate']))),
          );
        this.positionTooltip(dotTip, event.originalEvent as MouseEvent);
      }),
    );
    this.nativeLayerCleanups.push(
      this.map.onLayerEvent('mouseleave', DOTS_LAYER_ID, () => {
        dotTip.style('visibility', 'hidden');
      }),
    );
    this.nativeLayerCleanups.push(
      this.map.onLayerEvent('click', DOTS_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        if (!feature?.properties) {
          return;
        }

        const centroid: CentroidData = {
          cid: Number(feature.properties['cid']),
          lat: Number(feature.properties['lat']),
          lon: Number(feature.properties['lon']),
          startdate: String(feature.properties['startdate']),
          enddate: String(feature.properties['enddate']),
          tfh: Number(feature.properties['tfh']),
        };
        this.startDialog(centroid, this.currentCentroids);
      }),
    );
  }

  private clearNativeLayers() {
    while (this.nativeLayerCleanups.length > 0) {
      this.nativeLayerCleanups.pop()?.();
    }
    this.map?.removeLayer(DOTS_LAYER_ID);
    this.map?.removeLayer(TRAJECTORY_LINE_LAYER_ID);
    this.map?.removeCustomLayer(TRAJECTORY_CUSTOM_LAYER_ID);
    this.map?.removeSource(DOTS_SOURCE_ID);
    this.map?.removeSource(TRAJECTORY_LINE_SOURCE_ID);
  }

  private redrawLegacyOverlays() {
    this.map.syncOverlaySize();

    if (this.trajectories.length !== 0 && this.renderer) {
      this.renderer(this.trajectories);
    }

    this.overlayGroup
      .selectAll<SVGCircleElement, CentroidData>('circle')
      .attr('cx', (d) => this.map.project(d.lat, d.lon).x)
      .attr('cy', (d) => this.map.project(d.lat, d.lon).y);
  }

  dots(cents: CentroidData[]) {
    const dotTip = d3
      .select('#tooltip')
      .style('visibility', 'hidden')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background-color', 'white')
      .style('border', 'solid')
      .style('border-width', '1px')
      .style('border-radius', '5px')
      .style('padding', '10px')
      .style('opacity', '0.7')
      .style('z-index', '10000');

    const dots = this.overlayGroup
      .selectAll<SVGCircleElement, CentroidData>('circle')
      .data(cents)
      .join('circle')
      .attr('pointer-events', 'painted')
      .attr('cx', (d) => this.map.project(d.lat, d.lon).x)
      .attr('cy', (d) => this.map.project(d.lat, d.lon).y)
      .attr('r', 4)
      .style('fill', 'white')
      .style('stroke', 'black');

    dots
      .on('click', (_, d) => this.startDialog(d, cents))
      .on('pointermove', (event: PointerEvent, d) => {
        dotTip
          .style('visibility', 'visible')
          .html(
            'CID: ' +
              d.cid +
              '<br>' +
              'Total Fishing Hours: ' +
              Math.round(d.tfh * 100) / 100 +
              '<br>' +
              'Start Date: ' +
              this.dateToStr(new Date(d.startdate)) +
              '<br>' +
              'End Date: ' +
              this.dateToStr(new Date(d.enddate)),
          );
        this.positionTooltip(dotTip, event);
      })
      .on('pointerout', () => {
        dotTip.style('visibility', 'hidden');
      });
  }

  createArrow(cents: CentroidData[]) {
    const canvas = this.aS.getCanvas();
    const context = this.aS.getContext();
    const map = this.aS.getMap() as MapAdapter;
    const component = this;

    function clearContext() {
      const width = canvas.node()?.width ?? 0;
      const height = canvas.node()?.height ?? 0;
      context.clearRect(0, 0, width, height);
    }

    function drawTrajectory(traj: CentroidData[]) {
      const drawContext = component.aS.getContext();
      if (traj.length <= 1) {
        return;
      }

      const valExt = d3.extent(traj, (d) => d.tfh) as [number, number];
      const pointArray: Array<
        [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }]
      > = [];
      drawContext.lineJoin = 'round';
      drawContext.lineCap = 'round';

      for (let i = 0; i < traj.length; i += 1) {
        let points: Array<{ x: number; y: number }> | undefined;
        let nextPoint = { x: 0, y: 0 };
        let previousPoint = { x: 0, y: 0 };
        const currentPoint = map.project(traj[i].lat, traj[i].lon);

        if (i === 0) {
          nextPoint = map.project(traj[i + 1].lat, traj[i + 1].lon);
          points = component.findPoints(
            traj[i].tfh,
            valExt,
            currentPoint,
            undefined,
            nextPoint,
          );
          points.push(currentPoint);
          pointArray.push(points as typeof pointArray[number]);

          drawContext.lineWidth = 3;
          drawContext.strokeStyle = '#ffb800';
          drawContext.globalAlpha = 0.75;
          drawContext.beginPath();
          drawContext.moveTo(points[1].x, points[1].y);
          drawContext.lineTo(points[0].x, points[0].y);
        } else if (i === traj.length - 1) {
          previousPoint = map.project(traj[i - 1].lat, traj[i - 1].lon);
          points = component.findPoints(
            traj[i].tfh,
            valExt,
            currentPoint,
            previousPoint,
          );
          points.push(currentPoint);
          pointArray.push(points as typeof pointArray[number]);
          drawContext.lineTo(points[0].x, points[0].y);
        } else {
          nextPoint = map.project(traj[i + 1].lat, traj[i + 1].lon);
          previousPoint = map.project(traj[i - 1].lat, traj[i - 1].lon);
          points = component.findPoints(
            traj[i].tfh,
            valExt,
            currentPoint,
            previousPoint,
            nextPoint,
          );
          points.push(currentPoint);
          pointArray.push(points as typeof pointArray[number]);
          drawContext.lineTo(points[0].x, points[0].y);
        }
      }

      for (let i = traj.length - 1; i > -1; i -= 1) {
        if (i === 0) {
          drawContext.lineTo(pointArray[0][1].x, pointArray[0][1].y);
          drawContext.stroke();
          drawContext.fillStyle = '#ffa800';
          drawContext.fill();
          drawContext.closePath();
          drawContext.globalAlpha = 1;
        } else {
          drawContext.lineTo(pointArray[i][1].x, pointArray[i][1].y);
        }
      }

      for (let i = 0; i < traj.length; i += 1) {
        if (i === 1) {
          drawContext.lineWidth = 3;
          drawContext.strokeStyle = 'black';
          drawContext.beginPath();
          drawContext.moveTo(pointArray[i - 1][2].x, pointArray[i - 1][2].y);
          drawContext.lineTo(pointArray[i][2].x, pointArray[i][2].y);
        } else {
          drawContext.lineTo(pointArray[i][2].x, pointArray[i][2].y);
        }
      }
      drawContext.stroke();
      drawContext.closePath();

      component.drawArrowHead(
        drawContext,
        pointArray[traj.length - 1][2],
        pointArray[traj.length - 2][2],
        valExt,
      );
    }

    function renderTrajectoriesSync(data: CentroidData[][]) {
      clearContext();
      for (const trajectory of data) {
        drawTrajectory(trajectory);
      }
    }

    this.renderer = renderTrajectoriesSync;
    this.renderer(this.trajectories);
    this.aS.setRenderer(this.renderer);
  }

  private drawArrowHead(
    context: CanvasRenderingContext2D,
    finalPoint: { x: number; y: number },
    previousPoint: { x: number; y: number },
    ext: [number, number],
  ) {
    const directionX = finalPoint.x - previousPoint.x;
    const directionY = finalPoint.y - previousPoint.y;
    const directionLength = Math.hypot(directionX, directionY);

    if (directionLength < 0.001) {
      return;
    }

    const unitX = directionX / directionLength;
    const unitY = directionY / directionLength;
    const [baseLeft, baseRight] = this.findPoints(ext[1], ext, finalPoint, previousPoint);
    const baseWidth = Math.hypot(
      baseLeft.x - baseRight.x,
      baseLeft.y - baseRight.y,
    );
    const headLength = Math.max(baseWidth * 0.7, 6);
    const tip = {
      x: finalPoint.x + unitX * headLength,
      y: finalPoint.y + unitY * headLength,
    };

    context.fillStyle = 'black';
    context.globalAlpha = 1;
    context.beginPath();
    context.moveTo(baseLeft.x, baseLeft.y);
    context.lineTo(baseRight.x, baseRight.y);
    context.lineTo(tip.x, tip.y);
    context.closePath();
    context.fill();
  }

  findPoints(
    val: number,
    ext: [number, number],
    p2: { x: number; y: number },
    p1?: { x: number; y: number },
    p3?: { x: number; y: number },
  ) {
    const dP1 = { x: 0, y: 0 };
    const dP2 = { x: 0, y: 0 };

    let widthScale;
    if (this.mapScale === 'log') {
      widthScale = d3.scaleSymlog().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    } else if (this.mapScale === 'sqrt') {
      widthScale = d3.scaleSqrt().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    } else {
      widthScale = d3.scaleLinear().domain([0, ext[1]]).range([0, this.maxTrajWidth]);
    }

    if (p1 !== undefined && p3 !== undefined) {
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
      const v2 = { x: p2.x - p3.x, y: p2.y - p3.y };
      const lV1 = 1.0 / Math.hypot(v1.x, v1.y);
      const lV2 = 1.0 / Math.hypot(v2.x, v2.y);
      v1.x *= lV1;
      v1.y *= lV1;
      v2.x *= lV2;
      v2.y *= lV2;

      const rV1 = { x: -v1.y, y: v1.x };
      const rV2 = { x: -v2.y, y: v2.x };
      const pV = { x: rV1.x + rV2.x, y: rV1.y + rV2.y };
      const lPV = 1.0 / Math.hypot(pV.x, pV.y);
      pV.x *= lPV * widthScale(val);
      pV.y *= lPV * widthScale(val);

      dP1.x = p2.x - pV.x;
      dP1.y = p2.y - pV.y;
      dP2.x = p2.x + pV.x;
      dP2.y = p2.y + pV.y;
    } else if (p1 !== undefined) {
      const pS1 = -1 / ((p1.y - p2.y) / (p1.x - p2.x));
      const dx = widthScale(val) / Math.sqrt(1 + pS1 * pS1);
      const dy = pS1 * dx;

      if (p2.y > p1.y) {
        dP1.x = p2.x - dx;
        dP2.x = p2.x + dx;
        dP1.y = p2.y - dy;
        dP2.y = p2.y + dy;
      } else if (p2.y < p1.y) {
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
    } else if (p3 !== undefined) {
      const pS2 = -1 / ((p2.y - p3.y) / (p2.x - p3.x));
      const dx = widthScale(val) / Math.sqrt(1 + pS2 * pS2);
      const dy = pS2 * dx;

      if (p2.y > p3.y) {
        dP1.x = p2.x + dx;
        dP2.x = p2.x - dx;
        dP1.y = p2.y + dy;
        dP2.y = p2.y - dy;
      } else if (p2.y < p3.y) {
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

    return [dP1, dP2];
  }

  onChange(_: unknown) {
    const canvas = this.aS.getCanvas();
    const context = canvas.node()?.getContext('2d');
    this.showProgress();

    if (!context || !this.range.value.end) {
      this.hideProgress();
      return;
    }

    const start = new Date(Date.parse(this.range.value.start));
    const end = new Date(Date.parse(this.range.value.end));
    this.ds
      .getCentroids(this.intervalScale, this.dateToStr(start), this.dateToStr(end))
      .pipe(finalize(() => this.hideProgress()))
      .subscribe((cents) => {
        context.clearRect(0, 0, canvas.node()?.width ?? 0, canvas.node()?.height ?? 0);
        this.applyMapData(cents);
      });
  }

  onRenderModeChange(mode: MapRenderMode) {
    this.renderMode = mode;
    if (this.currentCentroids.length !== 0) {
      this.applyMapData(this.currentCentroids);
    }
  }

  startDialog(d: CentroidData, data: CentroidData[]) {
    this.dialog.open(DialogComponent, {
      maxWidth: '90vw',
      maxHeight: '90vh',
      data: {
        d,
        data,
        interval: this.intervalScale,
        rangeStart: this.range.value.start,
        rangeEnd: this.range.value.end,
        renderMode: this.renderMode,
      },
    });
  }

  openPrivacyPolicy(event: Event) {
    event.preventDefault();
    this.dialog.open(PrivacyPolicyDialogComponent, {
      maxWidth: '720px',
      width: '90vw',
    });
  }

  showProgress() {
    this.isLoading = true;
  }

  hideProgress() {
    this.isLoading = false;
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
