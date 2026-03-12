import maplibregl, {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import * as d3 from 'd3';
import type { CentroidData } from '../interfaces';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

interface RibbonGeometry {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
}

interface ArrowGeometry {
  vertices: Float32Array;
  count: number;
}

const WORLD_COPIES = [-1, 0, 1] as const;

function buildWidthScale(
  mode: 'linear' | 'sqrt' | 'log',
  ext: [number, number],
  maxTrajWidth: number,
) {
  if (mode === 'log') {
    return d3.scaleSymlog().domain([0, ext[1]]).range([0, maxTrajWidth]);
  }
  if (mode === 'sqrt') {
    return d3.scaleSqrt().domain([0, ext[1]]).range([0, maxTrajWidth]);
  }
  return d3.scaleLinear().domain([0, ext[1]]).range([0, maxTrajWidth]);
}

function compileShader(gl: GL, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(gl: GL, vertexSource: string, fragmentSource: string) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Failed to create program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'Unknown program link error';
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteProgram(program);
    throw new Error(info);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

function isWebGL2(gl: GL): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

function toMercator(lon: number, lat: number) {
  const coord = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon, lat });
  return { x: coord.x, y: coord.y };
}

function extrapolateEndpoint(current: { x: number; y: number }, neighbor: { x: number; y: number }) {
  return {
    x: current.x + (current.x - neighbor.x),
    y: current.y + (current.y - neighbor.y),
  };
}

function buildRibbonGeometry(
  trajectories: CentroidData[][],
  mode: 'linear' | 'sqrt' | 'log',
  maxTrajWidth: number,
): RibbonGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const trajectory of trajectories) {
    if (trajectory.length < 2) {
      continue;
    }

    const tfhValues = trajectory.map((point) => point.tfh);
    const ext: [number, number] = [
      Math.min(...tfhValues),
      Math.max(...tfhValues),
    ];
    const widthScale = buildWidthScale(mode, ext, maxTrajWidth);
    const mercator = trajectory.map((point) => toMercator(point.lon, point.lat));

    for (const worldOffset of WORLD_COPIES) {
      for (let index = 0; index < trajectory.length; index += 1) {
        const baseCurrent = mercator[index];
        const basePrevious =
          index === 0
            ? extrapolateEndpoint(baseCurrent, mercator[index + 1])
            : mercator[index - 1];
        const baseNext =
          index === trajectory.length - 1
            ? extrapolateEndpoint(baseCurrent, mercator[index - 1])
            : mercator[index + 1];
        const current = {
          x: baseCurrent.x + worldOffset,
          y: baseCurrent.y,
        };
        const previous = {
          x: basePrevious.x + worldOffset,
          y: basePrevious.y,
        };
        const next = {
          x: baseNext.x + worldOffset,
          y: baseNext.y,
        };
        const halfWidth = widthScale(trajectory[index].tfh);

        vertices.push(
          previous.x,
          previous.y,
          current.x,
          current.y,
          next.x,
          next.y,
          -1,
          halfWidth,
        );
        vertices.push(
          previous.x,
          previous.y,
          current.x,
          current.y,
          next.x,
          next.y,
          1,
          halfWidth,
        );

        if (index < trajectory.length - 1) {
          indices.push(
            vertexOffset,
            vertexOffset + 1,
            vertexOffset + 2,
            vertexOffset + 1,
            vertexOffset + 3,
            vertexOffset + 2,
          );
        }
        vertexOffset += 2;
      }
    }
  }

  const indexArray =
    vertexOffset > 65535 && typeof Uint32Array !== 'undefined'
      ? new Uint32Array(indices)
      : new Uint16Array(indices);

  return {
    vertices: new Float32Array(vertices),
    indices: indexArray,
  };
}

function buildArrowGeometry(
  trajectories: CentroidData[][],
  mode: 'linear' | 'sqrt' | 'log',
  maxTrajWidth: number,
): ArrowGeometry {
  const vertices: number[] = [];

  for (const trajectory of trajectories) {
    if (trajectory.length < 2) {
      continue;
    }

    const tfhValues = trajectory.map((point) => point.tfh);
    const ext: [number, number] = [
      Math.min(...tfhValues),
      Math.max(...tfhValues),
    ];
    const widthScale = buildWidthScale(mode, ext, maxTrajWidth);
    const finalPoint = trajectory[trajectory.length - 1];
    const previousPoint = trajectory[trajectory.length - 2];
    const baseTip = toMercator(finalPoint.lon, finalPoint.lat);
    const basePrevious = toMercator(previousPoint.lon, previousPoint.lat);
    const halfWidth = widthScale(ext[1]);

    for (const worldOffset of WORLD_COPIES) {
      const tip = {
        x: baseTip.x + worldOffset,
        y: baseTip.y,
      };
      const previous = {
        x: basePrevious.x + worldOffset,
        y: basePrevious.y,
      };

      for (const role of [0, 1, 2]) {
        vertices.push(previous.x, previous.y, tip.x, tip.y, halfWidth, role);
      }
    }
  }

  return {
    vertices: new Float32Array(vertices),
    count: vertices.length / 6,
  };
}

const ribbonVertexBody = `
vec2 safeNormalize(vec2 value) {
  float magnitude = length(value);
  if (magnitude < 0.000001) {
    return vec2(0.0, 0.0);
  }
  return value / magnitude;
}

void main() {
  vec4 prevClip = u_matrix * vec4(a_prev, 0.0, 1.0);
  vec4 currClip = u_matrix * vec4(a_curr, 0.0, 1.0);
  vec4 nextClip = u_matrix * vec4(a_next, 0.0, 1.0);

  vec2 prevNdc = prevClip.xy / prevClip.w;
  vec2 currNdc = currClip.xy / currClip.w;
  vec2 nextNdc = nextClip.xy / nextClip.w;

  vec2 dirA = safeNormalize(currNdc - prevNdc);
  vec2 dirB = safeNormalize(nextNdc - currNdc);
  vec2 direction = safeNormalize(dirA + dirB);
  if (length(direction) < 0.0001) {
    direction = length(dirB) > 0.0 ? dirB : dirA;
  }

  vec2 normal = vec2(-direction.y, direction.x);
  vec2 pixelToNdc = vec2(2.0 / u_viewport.x, 2.0 / u_viewport.y);
  vec2 offsetNdc = normal * a_side * a_halfWidth * pixelToNdc;
  gl_Position = currClip + vec4(offsetNdc * currClip.w, 0.0, 0.0);
}
`;

const arrowVertexBody = `
vec2 safeNormalize(vec2 value) {
  float magnitude = length(value);
  if (magnitude < 0.000001) {
    return vec2(0.0, 0.0);
  }
  return value / magnitude;
}

void main() {
  vec4 prevClip = u_matrix * vec4(a_prev, 0.0, 1.0);
  vec4 tipClip = u_matrix * vec4(a_tip, 0.0, 1.0);
  vec2 prevNdc = prevClip.xy / prevClip.w;
  vec2 tipNdc = tipClip.xy / tipClip.w;
  vec2 direction = safeNormalize(tipNdc - prevNdc);
  vec2 normal = vec2(-direction.y, direction.x);
  float headLength = max(a_halfWidth * 1.4, 6.0);
  vec2 pixelToNdc = vec2(2.0 / u_viewport.x, 2.0 / u_viewport.y);
  vec2 offsetPx;

  if (a_role < 0.5) {
    offsetPx = normal * a_halfWidth;
  } else if (a_role < 1.5) {
    offsetPx = -normal * a_halfWidth;
  } else {
    offsetPx = direction * headLength;
  }

  vec2 offsetNdc = offsetPx * pixelToNdc;
  gl_Position = tipClip + vec4(offsetNdc * tipClip.w, 0.0, 0.0);
}
`;

function getRibbonVertexSource(gl: GL) {
  if (isWebGL2(gl)) {
    return `#version 300 es
in vec2 a_prev;
in vec2 a_curr;
in vec2 a_next;
in float a_side;
in float a_halfWidth;

uniform mat4 u_matrix;
uniform vec2 u_viewport;

${ribbonVertexBody}`;
  }

  return `
attribute vec2 a_prev;
attribute vec2 a_curr;
attribute vec2 a_next;
attribute float a_side;
attribute float a_halfWidth;

uniform mat4 u_matrix;
uniform vec2 u_viewport;

${ribbonVertexBody}`;
}

function getArrowVertexSource(gl: GL) {
  if (isWebGL2(gl)) {
    return `#version 300 es
in vec2 a_prev;
in vec2 a_tip;
in float a_halfWidth;
in float a_role;

uniform mat4 u_matrix;
uniform vec2 u_viewport;

${arrowVertexBody}`;
  }

  return `
attribute vec2 a_prev;
attribute vec2 a_tip;
attribute float a_halfWidth;
attribute float a_role;

uniform mat4 u_matrix;
uniform vec2 u_viewport;

${arrowVertexBody}`;
}

function getFragmentSource(gl: GL) {
  if (isWebGL2(gl)) {
    return `#version 300 es
precision mediump float;
uniform vec4 u_color;
out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;
  }

  return `
precision mediump float;
uniform vec4 u_color;

void main() {
  gl_FragColor = u_color;
}
`;
}

export class TrajectoryWebGLLayer implements CustomLayerInterface {
  id: string;
  type: 'custom' = 'custom';
  renderingMode: '2d' = '2d';

  private map?: MapLibreMap;
  private ribbonProgram: WebGLProgram | null = null;
  private arrowProgram: WebGLProgram | null = null;
  private ribbonVertexBuffer: WebGLBuffer | null = null;
  private ribbonIndexBuffer: WebGLBuffer | null = null;
  private arrowBuffer: WebGLBuffer | null = null;
  private ribbonGeometry: RibbonGeometry = {
    vertices: new Float32Array(),
    indices: new Uint16Array(),
  };
  private arrowGeometry: ArrowGeometry = {
    vertices: new Float32Array(),
    count: 0,
  };
  private dirty = true;
  private usesUint32Indices = false;

  constructor(id: string) {
    this.id = id;
  }

  setTrajectories(
    trajectories: CentroidData[][],
    mode: 'linear' | 'sqrt' | 'log',
    maxTrajWidth: number,
  ) {
    this.ribbonGeometry = buildRibbonGeometry(trajectories, mode, maxTrajWidth);
    this.arrowGeometry = buildArrowGeometry(trajectories, mode, maxTrajWidth);
    this.usesUint32Indices = this.ribbonGeometry.indices instanceof Uint32Array;
    this.dirty = true;
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, gl: GL) {
    this.map = map;
    this.ribbonProgram = createProgram(
      gl,
      getRibbonVertexSource(gl),
      getFragmentSource(gl),
    );
    this.arrowProgram = createProgram(
      gl,
      getArrowVertexSource(gl),
      getFragmentSource(gl),
    );
    this.ribbonVertexBuffer = gl.createBuffer();
    this.ribbonIndexBuffer = gl.createBuffer();
    this.arrowBuffer = gl.createBuffer();

    if (this.usesUint32Indices) {
      gl.getExtension('OES_element_index_uint');
    }
  }

  onRemove(_: MapLibreMap, gl: GL) {
    if (this.ribbonVertexBuffer) {
      gl.deleteBuffer(this.ribbonVertexBuffer);
    }
    if (this.ribbonIndexBuffer) {
      gl.deleteBuffer(this.ribbonIndexBuffer);
    }
    if (this.arrowBuffer) {
      gl.deleteBuffer(this.arrowBuffer);
    }
    if (this.ribbonProgram) {
      gl.deleteProgram(this.ribbonProgram);
    }
    if (this.arrowProgram) {
      gl.deleteProgram(this.arrowProgram);
    }
  }

  render(gl: GL, options: CustomRenderMethodInput) {
    if (
      !this.ribbonProgram ||
      !this.arrowProgram ||
      !this.ribbonVertexBuffer ||
      !this.ribbonIndexBuffer ||
      !this.arrowBuffer
    ) {
      return;
    }

    if (this.dirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.ribbonGeometry.vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.ribbonGeometry.indices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.arrowGeometry.vertices, gl.STATIC_DRAW);
      this.dirty = false;
    }

    const viewport = this.map?.getCanvas();
    const width = viewport?.width ?? 1;
    const height = viewport?.height ?? 1;

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);

    if (this.ribbonGeometry.indices.length > 0) {
      gl.useProgram(this.ribbonProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVertexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIndexBuffer);

      const stride = 8 * 4;
      const prevLocation = gl.getAttribLocation(this.ribbonProgram, 'a_prev');
      const currLocation = gl.getAttribLocation(this.ribbonProgram, 'a_curr');
      const nextLocation = gl.getAttribLocation(this.ribbonProgram, 'a_next');
      const sideLocation = gl.getAttribLocation(this.ribbonProgram, 'a_side');
      const widthLocation = gl.getAttribLocation(this.ribbonProgram, 'a_halfWidth');

      gl.enableVertexAttribArray(prevLocation);
      gl.vertexAttribPointer(prevLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(currLocation);
      gl.vertexAttribPointer(currLocation, 2, gl.FLOAT, false, stride, 2 * 4);
      gl.enableVertexAttribArray(nextLocation);
      gl.vertexAttribPointer(nextLocation, 2, gl.FLOAT, false, stride, 4 * 4);
      gl.enableVertexAttribArray(sideLocation);
      gl.vertexAttribPointer(sideLocation, 1, gl.FLOAT, false, stride, 6 * 4);
      gl.enableVertexAttribArray(widthLocation);
      gl.vertexAttribPointer(widthLocation, 1, gl.FLOAT, false, stride, 7 * 4);

      gl.uniformMatrix4fv(
        gl.getUniformLocation(this.ribbonProgram, 'u_matrix'),
        false,
        options.defaultProjectionData.mainMatrix,
      );
      gl.uniform2f(
        gl.getUniformLocation(this.ribbonProgram, 'u_viewport'),
        width,
        height,
      );
      gl.uniform4f(
        gl.getUniformLocation(this.ribbonProgram, 'u_color'),
        1,
        168 / 255,
        0,
        1,
      );

      gl.drawElements(
        gl.TRIANGLES,
        this.ribbonGeometry.indices.length,
        this.usesUint32Indices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        0,
      );
    }

    if (this.arrowGeometry.count > 0) {
      gl.useProgram(this.arrowProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.arrowBuffer);

      const stride = 6 * 4;
      const prevLocation = gl.getAttribLocation(this.arrowProgram, 'a_prev');
      const tipLocation = gl.getAttribLocation(this.arrowProgram, 'a_tip');
      const widthLocation = gl.getAttribLocation(this.arrowProgram, 'a_halfWidth');
      const roleLocation = gl.getAttribLocation(this.arrowProgram, 'a_role');

      gl.enableVertexAttribArray(prevLocation);
      gl.vertexAttribPointer(prevLocation, 2, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(tipLocation);
      gl.vertexAttribPointer(tipLocation, 2, gl.FLOAT, false, stride, 2 * 4);
      gl.enableVertexAttribArray(widthLocation);
      gl.vertexAttribPointer(widthLocation, 1, gl.FLOAT, false, stride, 4 * 4);
      gl.enableVertexAttribArray(roleLocation);
      gl.vertexAttribPointer(roleLocation, 1, gl.FLOAT, false, stride, 5 * 4);

      gl.uniformMatrix4fv(
        gl.getUniformLocation(this.arrowProgram, 'u_matrix'),
        false,
        options.defaultProjectionData.mainMatrix,
      );
      gl.uniform2f(
        gl.getUniformLocation(this.arrowProgram, 'u_viewport'),
        width,
        height,
      );
      gl.uniform4f(
        gl.getUniformLocation(this.arrowProgram, 'u_color'),
        0,
        0,
        0,
        1,
      );

      gl.drawArrays(gl.TRIANGLES, 0, this.arrowGeometry.count);
    }
  }
}
