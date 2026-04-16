import { useEffect, useRef } from 'react';

const fragmentShaderSource = `#version 300 es
precision highp float;

out vec4 O;
uniform float time;
uniform vec2 resolution;
uniform vec3 u_color;

#define FC gl_FragCoord.xy
#define R resolution
#define T (time + 660.)

float rnd(vec2 p) {
  p = fract(p * vec2(12.9898, 78.233));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(
    mix(rnd(i), rnd(i + vec2(1, 0)), u.x),
    mix(rnd(i + vec2(0, 1)), rnd(i + 1.), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float t = .0, a = 1.;
  for (int i = 0; i < 5; i++) {
    t += a * noise(p);
    p *= mat2(1, -1.2, .2, 1.2) * 2.;
    a *= .5;
  }
  return t;
}

void main() {
  vec2 uv = (FC - .5 * R) / R.y;
  vec3 col = vec3(1.);
  uv.x += .25;
  uv *= vec2(2., 1.);

  float n = fbm(uv * .28 - vec2(T * .01, 0.));
  n = noise(uv * 3. + n * 2.);

  col.r -= fbm(uv + vec2(0., T * .015) + n);
  col.g -= fbm(uv * 1.003 + vec2(0., T * .015) + n + .003);
  col.b -= fbm(uv * 1.006 + vec2(0., T * .015) + n + .006);

  col = mix(col, u_color, dot(col, vec3(.21, .71, .07)));
  col = mix(vec3(.08), col, min(time * .1, 1.));
  col = clamp(col, .08, 1.);
  O = vec4(col, 1.);
}`;

class Renderer {
  private readonly vertexSrc = `#version 300 es
precision highp float;
in vec4 position;
void main() {
  gl_Position = position;
}`;

  private readonly vertices = [-1, 1, -1, -1, 1, 1, 1, -1];
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext | null;

  private program: WebGLProgram | null = null;
  private vs: WebGLShader | null = null;
  private fs: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;
  private resolutionLocation: WebGLUniformLocation | null = null;
  private timeLocation: WebGLUniformLocation | null = null;
  private colorLocation: WebGLUniformLocation | null = null;
  private color: [number, number, number] = [0.19, 0.88, 0.48];

  constructor(canvas: HTMLCanvasElement, fragmentSource: string) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2');
    if (!this.gl) return;
    this.setup(fragmentSource);
    this.init();
  }

  updateColor(newColor: [number, number, number]) {
    this.color = newColor;
  }

  updateScale() {
    if (!this.gl) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, width, height);
  }

  private compile(shader: WebGLShader, source: string) {
    if (!this.gl) return;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error(`Shader compilation error: ${this.gl.getShaderInfoLog(shader)}`);
    }
  }

  reset() {
    if (!this.gl || !this.program) return;

    if (this.vs) {
      this.gl.detachShader(this.program, this.vs);
      this.gl.deleteShader(this.vs);
    }

    if (this.fs) {
      this.gl.detachShader(this.program, this.fs);
      this.gl.deleteShader(this.fs);
    }

    if (this.buffer) {
      this.gl.deleteBuffer(this.buffer);
    }

    this.gl.deleteProgram(this.program);
    this.program = null;
  }

  private setup(fragmentSource: string) {
    if (!this.gl) return;

    this.vs = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    this.program = this.gl.createProgram();

    if (!this.vs || !this.fs || !this.program) return;

    this.compile(this.vs, this.vertexSrc);
    this.compile(this.fs, fragmentSource);

    this.gl.attachShader(this.program, this.vs);
    this.gl.attachShader(this.program, this.fs);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error(`Program linking error: ${this.gl.getProgramInfoLog(this.program)}`);
    }
  }

  private init() {
    if (!this.gl || !this.program) return;

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.vertices), this.gl.STATIC_DRAW);

    const position = this.gl.getAttribLocation(this.program, 'position');
    this.gl.enableVertexAttribArray(position);
    this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);

    this.resolutionLocation = this.gl.getUniformLocation(this.program, 'resolution');
    this.timeLocation = this.gl.getUniformLocation(this.program, 'time');
    this.colorLocation = this.gl.getUniformLocation(this.program, 'u_color');
  }

  render(now = 0) {
    if (!this.gl || !this.program || !this.buffer) return;

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.useProgram(this.program);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.timeLocation, now * 1e-3);
    this.gl.uniform3fv(this.colorLocation, this.color);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
}

const hexToRgb = (hex: string): [number, number, number] | null => {
  const normalized = hex.trim();
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);

  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : null;
};

interface SmokeBackgroundProps {
  smokeColor?: string;
}

export function SmokeBackground({ smokeColor = '#30e07a' }: SmokeBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Renderer(canvas, fragmentShaderSource);
    rendererRef.current = renderer;

    const updateScale = () => renderer.updateScale();
    updateScale();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateScale)
      : null;

    resizeObserver?.observe(canvas);
    window.addEventListener('resize', updateScale);

    let animationFrameId = 0;
    const loop = (now: number) => {
      renderer.render(now);
      animationFrameId = window.requestAnimationFrame(loop);
    };

    animationFrameId = window.requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', updateScale);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrameId);
      renderer.reset();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const rgbColor = hexToRgb(smokeColor);
    if (rgbColor) {
      renderer.updateColor(rgbColor);
    }
  }, [smokeColor]);

  return (
    <section
      className="hero-container"
      aria-label="An animated smoky background for the sign in and sign up screen."
    >
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'linear-gradient(180deg, hsl(220 20% 11% / 0.82) 0%, hsl(220 18% 12% / 0.9) 52%, hsl(220 18% 10% / 0.96) 100%)',
        }}
      />
      <div
        className="absolute inset-0 z-[1] opacity-90"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, hsl(var(--primary) / 0.14), transparent 28%), radial-gradient(circle at 50% 105%, hsl(var(--primary) / 0.26), transparent 34%)',
        }}
      />
      <div className="absolute inset-0 z-[2] opacity-[0.58] mix-blend-screen">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      <div
        className="absolute inset-0 z-[3]"
        style={{
          background:
            'linear-gradient(180deg, hsl(220 20% 8% / 0.18) 0%, transparent 22%, transparent 72%, hsl(var(--background) / 0.38) 100%)',
        }}
      />
    </section>
  );
}

export const DefaultSmokeBackgroundDemo = () => <SmokeBackground />;

export const CustomizedSmokeBackgroundDemo = () => (
  <SmokeBackground smokeColor="#30e07a" />
);
