import type { CentroidData, clustData, hullData } from '../interfaces';

export function toCentroidFeatureCollection(cents: CentroidData[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: cents.map((cent) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [cent.lon, cent.lat],
      },
      properties: {
        cid: cent.cid,
        lat: cent.lat,
        lon: cent.lon,
        startdate: cent.startdate,
        enddate: cent.enddate,
        tfh: cent.tfh,
      },
    })),
  };
}

export function toClusterCellFeatureCollection(data: clustData[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: data.map((cell) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [cell.lon, cell.lat],
          [cell.lon + 0.1, cell.lat],
          [cell.lon + 0.1, cell.lat + 0.1],
          [cell.lon, cell.lat + 0.1],
          [cell.lon, cell.lat],
        ]],
      },
      properties: {
        lat: cell.lat,
        lon: cell.lon,
        tfh: cell.tfh,
      },
    })),
  };
}

export function toHullFeatureCollection(hulls: hullData[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const hull of hulls) {
    const parsed = JSON.parse(hull.hull);
    if (parsed.type === 'FeatureCollection') {
      for (const feature of parsed.features) {
        features.push({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            startdate: hull.startdate,
            enddate: hull.enddate,
          },
        });
      }
    } else if (parsed.type === 'Feature') {
      features.push({
        ...parsed,
        properties: {
          ...(parsed.properties ?? {}),
          startdate: hull.startdate,
          enddate: hull.enddate,
        },
      });
    } else if (parsed.type === 'Polygon' || parsed.type === 'MultiPolygon') {
      features.push({
        type: 'Feature',
        geometry: parsed,
        properties: {
          startdate: hull.startdate,
          enddate: hull.enddate,
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function toTrajectoryLineFeatureCollection(
  trajectories: CentroidData[][],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: trajectories
      .filter((trajectory) => trajectory.length > 1)
      .map((trajectory, index) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: trajectory.map((point) => [point.lon, point.lat]),
        },
        properties: {
          id: index,
        },
      })),
  };
}
