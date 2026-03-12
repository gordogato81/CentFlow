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
import { DialogComponent } from './dialog/dialog.component';
import { CentroidData } from './interfaces';
import {
  toCentroidFeatureCollection,
  toTrajectoryLineFeatureCollection,
} from './map/map-geojson';
import { createMapAdapter, type MapAdapter } from './map/map-adapter';
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
    public readonly dialog: MatDialog,
  ) {}

  private map!: MapAdapter;
  private readonly nativeLayerCleanups: Array<() => void> = [];
  private readonly trajectoryLayer = new TrajectoryWebGLLayer(
    TRAJECTORY_CUSTOM_LAYER_ID,
  );
  private currentCentroids: CentroidData[] = [];
  private readonly maxTrajWidth = 12;
  private trajectories: CentroidData[][] = [];
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
    this.trajectories = this.buildTrajectories(cents);
    this.setupNativeLayers(cents);
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

  private setupNativeLayers(cents: CentroidData[]) {
    this.map.addOrUpdateGeoJsonSource(
      DOTS_SOURCE_ID,
      toCentroidFeatureCollection(cents),
    );
    this.map.addOrUpdateGeoJsonSource(
      TRAJECTORY_LINE_SOURCE_ID,
      toTrajectoryLineFeatureCollection(this.trajectories),
    );
    this.trajectoryLayer.setTrajectories(
      this.trajectories,
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

  onChange(_: unknown) {
    if (!this.range.value.end) {
      this.hideProgress();
      return;
    }

    this.showProgress();
    const start = new Date(Date.parse(this.range.value.start));
    const end = new Date(Date.parse(this.range.value.end));
    this.ds
      .getCentroids(this.intervalScale, this.dateToStr(start), this.dateToStr(end))
      .pipe(finalize(() => this.hideProgress()))
      .subscribe((cents) => this.applyMapData(cents));
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
