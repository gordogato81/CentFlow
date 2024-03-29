export interface DialogData {
  d: CentroidData,
  data: CentroidData[]
  interval: string,
  rangeStart: string,
  rangeEnd: string
}

export interface CentroidData {
  cid: number,
  lat: number,
  lon: number,
  startdate: string,
  enddate: string,
  tfh: number
}

export interface graphData {
  enddate: string,
  startdate: string,
  tfh: number
}

export interface clustData {
  lat: number,
  lon: number,
  tfh: number
}

export interface hullData {
  enddate: string,
  hull: any,
  startdate: string
}