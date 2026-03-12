import maplibregl, {
  type ControlPosition,
  type CustomLayerInterface,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  type QueryRenderedFeaturesOptions,
} from 'maplibre-gl';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

interface MapAdapterOptions {
  center: GeoPoint;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  zoomSnap?: number;
  scaleControlPosition?: ControlPosition;
}

const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
    },
  ],
} as const;

export class MapAdapter {
  private readonly map: MapLibreMap;
  private isReady = false;
  private readonly pendingReadyCallbacks: Array<() => void> = [];

  constructor(container: HTMLElement, options: MapAdapterOptions) {
    this.map = new maplibregl.Map({
      container,
      style: OSM_RASTER_STYLE as never,
      center: [options.center.lon, options.center.lat],
      zoom: options.zoom,
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      dragRotate: false,
      pitchWithRotate: false,
      zoomSnap: options.zoomSnap,
    });

    this.map.addControl(
      new maplibregl.ScaleControl(),
      options.scaleControlPosition ?? 'bottom-left',
    );
    this.map.on('load', () => {
      this.isReady = true;
      while (this.pendingReadyCallbacks.length > 0) {
        const callback = this.pendingReadyCallbacks.shift();
        callback?.();
      }
    });
  }

  getMap() {
    return this.map;
  }

  withMapReady(callback: () => void) {
    if (this.isReady || this.map.loaded()) {
      this.isReady = true;
      callback();
      return;
    }

    this.pendingReadyCallbacks.push(callback);
  }

  project(lat: number, lon: number): ScreenPoint {
    const point = this.map.project([lon, lat]);
    return { x: point.x, y: point.y };
  }

  unproject(x: number, y: number): GeoPoint {
    const point = this.map.unproject([x, y]);
    return { lat: point.lat, lon: point.lng };
  }

  fitBounds(points: GeoPoint[], padding = 24) {
    if (points.length === 0) {
      return;
    }

    const bounds = points.reduce(
      (acc, point) => ({
        west: Math.min(acc.west, point.lon),
        south: Math.min(acc.south, point.lat),
        east: Math.max(acc.east, point.lon),
        north: Math.max(acc.north, point.lat),
      }),
      {
        west: points[0].lon,
        south: points[0].lat,
        east: points[0].lon,
        north: points[0].lat,
      },
    );

    this.map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding },
    );
  }

  addOrUpdateGeoJsonSource(id: string, data: GeoJSON.GeoJSON) {
    this.withMapReady(() => {
      const existingSource = this.map.getSource(id) as GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(data);
        return;
      }

      this.map.addSource(id, {
        type: 'geojson',
        data,
      });
    });
  }

  removeSource(id: string) {
    this.withMapReady(() => {
      const source = this.map.getSource(id);
      if (source) {
        this.map.removeSource(id);
      }
    });
  }

  addLayer(layer: LayerSpecification, beforeId?: string) {
    this.withMapReady(() => {
      if (this.map.getLayer(layer.id)) {
        this.map.removeLayer(layer.id);
      }
      this.map.addLayer(layer, beforeId);
    });
  }

  removeLayer(id: string) {
    this.withMapReady(() => {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
      }
    });
  }

  addCustomLayer(layer: CustomLayerInterface, beforeId?: string) {
    this.withMapReady(() => {
      if (this.map.getLayer(layer.id)) {
        this.map.removeLayer(layer.id);
      }
      this.map.addLayer(layer, beforeId);
    });
  }

  removeCustomLayer(id: string) {
    this.removeLayer(id);
  }

  setPaintProperty(layerId: string, property: string, value: unknown) {
    this.withMapReady(() => {
      if (this.map.getLayer(layerId)) {
        this.map.setPaintProperty(layerId, property, value as never);
      }
    });
  }

  onLayerEvent<TEvent extends 'click' | 'mousemove' | 'mouseleave'>(
    eventName: TEvent,
    layerId: string,
    handler: (event: MapLayerMouseEvent) => void,
  ) {
    const boundHandler = handler as unknown as (event: MapMouseEvent) => void;
    this.withMapReady(() => {
      this.map.on(eventName, layerId, boundHandler);
    });

    return () => {
      if (this.map.getLayer(layerId)) {
        this.map.off(eventName, layerId, boundHandler);
      }
    };
  }

  queryRenderedFeatures(
    point: ScreenPoint,
    options?: QueryRenderedFeaturesOptions,
  ): MapGeoJSONFeature[] {
    return this.map.queryRenderedFeatures([point.x, point.y], options);
  }

  triggerRepaint() {
    this.map.triggerRepaint();
  }

  resize() {
    this.map.resize();
  }

  destroy() {
    this.map.remove();
  }
}

export function createMapAdapter(
  container: HTMLElement,
  options: MapAdapterOptions,
) {
  return new MapAdapter(container, options);
}
