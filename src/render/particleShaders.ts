/**
 * Particle shaders, shipped with the lazy particle engine (the core renderer
 * compiles them on the first particle draw).
 *
 * Each particle is an instanced screen-facing quad (point sprites are capped
 * by the GPU, as low as 64 px on some phones) with premultiplied colors,
 * drawn as one of the built-in shapes or as an image of the atlas, and
 * rotated by its angle; the camera looks straight down, so world x/z are
 * screen x/y. The vertex stage also derives the confetti flip, which turns at
 * its own rate so a strip tumbles instead of only spinning, and the seed that
 * redraws bolts and arcs (14 times per second, different for each particle).
 * In sprite space (`q`) x runs along the particle's heading: the motion for
 * particles turned along it, screen up for upright ones.
 */
export const PARTICLE_VERTEX = `
attribute vec2 aCorner;
attribute vec3 aPos;
attribute float aSize;
attribute vec4 aColor;
attribute float aShape;
attribute float aAngle;
uniform mat4 uViewProj;
uniform float uPixelScale;
uniform vec2 uViewport;
uniform float uTime;
varying vec4 vColor;
varying float vShape;
varying vec3 vTurn;
varying vec2 vCoord;
varying float vSeed;
void main() {
	vec4 clip = uViewProj * vec4(aPos, 1.0);
	float pixels = max(1.0, aSize * uPixelScale / clip.w);
	clip.xy += aCorner * pixels / uViewport * clip.w;
	gl_Position = clip;
	vColor = aColor;
	vShape = aShape;
	vTurn = vec3(cos(aAngle), sin(aAngle), abs(cos(aAngle * 1.7 + 0.6)));
	vCoord = vec2(aCorner.x, -aCorner.y);
	vSeed = mod(floor(uTime * 14.0) + floor(fract(aAngle * 0.159155) * 211.0), 211.0);
}`

// Shapes: 0 soft glow, 1 spark (thin streak with a hot middle), 2 star (small
// core and four fading rays), 3 ring, 4 confetti (paper strip that narrows and
// darkens edge-on), 5 smoke (lumpy puff), 6 bolt (zigzag with a fork), 7 arc
// (three crackling filaments from the middle), 8 flame (teardrop, tip ahead),
// 9 snowflake, 10 heart, 11 diamond, 12 triangle, 13 cross; 16 and up are
// the cells of the image atlas (4 × 4, each image inset so mipmaps do not
// bleed into its neighbours). Shapes with a top point it along +q.x.
export const PARTICLE_FRAGMENT = `
precision mediump float;
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define HASHP highp
#else
#define HASHP mediump
#endif
varying vec4 vColor;
varying float vShape;
varying vec3 vTurn;
varying vec2 vCoord;
varying float vSeed;
uniform float uAdditive;
uniform sampler2D uAtlas;
float hash1(HASHP float n) {
	HASHP float v = sin(n * 12.9898 + 4.1414) * 43758.5453;
	return fract(v);
}
// Distance to a jagged line along x from x0 to x1: six segments whose inner
// joints move up to amp to either side; the ends stay on the axis.
float zigzag(vec2 p, float x0, float x1, float amp, float seed) {
	float outside = max(x0 - p.x, p.x - x1);
	if(outside > 0.0) return length(vec2(outside, p.y));
	float t = (p.x - x0) / (x1 - x0) * 6.0;
	float i = min(floor(t), 5.0);
	float y0 = i < 0.5 ? 0.0 : (hash1(i + seed * 7.0) * 2.0 - 1.0) * amp;
	float y1 = i > 4.5 ? 0.0 : (hash1(i + 1.0 + seed * 7.0) * 2.0 - 1.0) * amp;
	float slope = (y1 - y0) * 6.0 / (x1 - x0);
	return abs(p.y - mix(y0, y1, t - i)) / sqrt(1.0 + slope * slope);
}
float filament(float d, float width) {
	return max(1.0 - smoothstep(width * 0.3, width, d), exp(-d * d / (width * width * 2.5)) * 0.45);
}
// Signed distance to a heart with its tip at the origin and its top near y = 1.1.
float heart(vec2 p) {
	p.x = abs(p.x);
	if(p.x + p.y > 1.0) return length(p - vec2(0.25, 0.75)) - 0.353553;
	vec2 a = p - vec2(0.0, 1.0);
	vec2 b = p - 0.5 * max(p.x + p.y, 0.0);
	return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y);
}
vec2 turn(vec2 p, float angle) {
	float c = cos(angle), s = sin(angle);
	return vec2(p.x * c + p.y * s, p.y * c - p.x * s);
}
void main() {
	vec2 p = vCoord;
	vec2 q = vec2(p.x * vTurn.x + p.y * vTurn.y, p.y * vTurn.x - p.x * vTurn.y);
	float r2 = dot(p, p);
	float a = 0.0;
	float shade = 1.0;
	if(vShape > 15.5) {
		if(max(abs(q.x), abs(q.y)) > 1.0) discard;
		// Rounded: the interpolated index may land a hair below the whole number.
		float slot = floor(vShape - 15.5);
		float row = floor((slot + 0.5) / 4.0);
		vec2 cell = vec2(slot - row * 4.0, row);
		vec2 uv = vec2(0.5 + 0.5 * q.y, 0.5 - 0.5 * q.x);
		vec4 texel = texture2D(uAtlas, (cell + 0.0625 + uv * 0.875) * 0.25);
		if(texel.a <= 0.003) discard;
		vec4 image = vColor * texel;
		gl_FragColor = uAdditive > 0.5 ? vec4(image.rgb, 0.0) : image;
		return;
	}
	if(vShape < 0.5) {
		a = pow(max(0.0, 1.0 - r2), 1.5);
	} else if(vShape < 1.5) {
		float along = max(0.0, 1.0 - abs(q.x));
		float across = q.y * 6.0;
		a = along * sqrt(along) * max(0.0, 1.0 - across * across);
	} else if(vShape < 2.5) {
		float core = max(0.0, 1.0 - r2 * 5.0);
		float rays = max(0.0, 1.0 - abs(q.y) * 10.0) * (1.0 - abs(q.x)) + max(0.0, 1.0 - abs(q.x) * 10.0) * (1.0 - abs(q.y));
		a = min(1.0, core * core + rays);
	} else if(vShape < 3.5) {
		float band = max(0.0, 1.0 - abs(sqrt(r2) - 0.72) * 5.0);
		a = band * band;
	} else if(vShape < 4.5) {
		vec2 s = abs(q) / vec2(0.85, max(0.08, 0.5 * vTurn.z));
		a = 1.0 - smoothstep(0.8, 1.0, max(s.x, s.y));
		shade = 0.55 + 0.45 * vTurn.z;
	} else if(vShape < 5.5) {
		float angle = atan(q.y, q.x);
		float lumps = 0.78 + 0.22 * sin(angle * 3.0) * sin(angle * 5.0 + 1.3);
		a = pow(max(0.0, 1.0 - r2 / (lumps * lumps)), 1.4);
	} else if(vShape < 6.5) {
		float trunk = zigzag(q, -0.95, 0.95, 0.26, vSeed);
		float forkY = (hash1(3.0 + vSeed * 7.0) * 2.0 - 1.0) * 0.26;
		float side = hash1(vSeed + 0.5) < 0.5 ? -1.0 : 1.0;
		float fork = zigzag(turn(q - vec2(0.0, forkY), 0.6 * side), 0.0, 0.62, 0.12, vSeed + 31.0);
		float taper = 1.0 - smoothstep(0.6, 0.92, abs(q.x));
		a = max(filament(trunk, 0.07), filament(fork, 0.045) * 0.8) * taper;
	} else if(vShape < 7.5) {
		float d = 10.0;
		for(int k = 0; k < 3; k++) {
			float fk = float(k);
			float angle = vSeed * 0.37 + fk * 2.094 + (hash1(fk + vSeed * 3.0) - 0.5) * 1.2;
			float reach = 0.6 + 0.35 * hash1(fk + 11.0 + vSeed * 5.0);
			d = min(d, zigzag(turn(p, angle), 0.0, reach, 0.16, vSeed + fk * 13.0));
		}
		a = max(filament(d, 0.05), exp(-r2 * 30.0));
	} else if(vShape < 8.5) {
		// Round body behind, a tongue that sways toward the tip ahead; the core burns brighter.
		float up = q.x + 0.35;
		float side = q.y + 0.08 * sin(q.x * 7.0 + vSeed * 0.9) * max(0.0, up);
		float body = length(vec2(side, up)) - 0.48;
		float tongue = max(abs(side) - 0.48 * pow(clamp(1.0 - up / 1.28, 0.0, 1.0), 1.6), up - 1.28);
		float m = up < 0.0 ? body : min(body, tongue);
		a = 1.0 - smoothstep(-0.05, 0.02, m);
		shade = 0.6 + 0.4 * clamp(-m * 5.0, 0.0, 1.0);
	} else if(vShape < 9.5) {
		float radius = sqrt(r2);
		float angle = mod(atan(p.y, p.x) + 0.5236, 1.0472) - 0.5236;
		vec2 f = vec2(cos(angle), abs(sin(angle))) * radius;
		float arm = max(abs(f.y) - 0.055, f.x - 0.92);
		vec2 b = f - vec2(0.5, 0.0);
		float branch = max(abs(b.y - b.x * 0.9) / 1.345 - 0.045, max(-b.x, b.x - 0.28));
		float m = min(arm, branch);
		a = max(1.0 - smoothstep(0.0, 0.05, m), exp(-r2 * 8.0) * 0.35);
	} else if(vShape < 10.5) {
		float d = heart(vec2(q.y, q.x + 0.86) * 0.66) / 0.66;
		a = 1.0 - smoothstep(-0.04, 0.02, d);
		shade = 0.75 + 0.25 * clamp(-d * 4.0, 0.0, 1.0);
	} else if(vShape < 11.5) {
		float m = abs(q.y) / 0.62 + abs(q.x) / 0.95;
		a = 1.0 - smoothstep(0.9, 1.0, m);
		shade = q.x > 0.0 ? 1.0 : 0.72 + 0.28 * step(0.0, q.y);
	} else if(vShape < 12.5) {
		float m = max(-q.x - 0.475, q.x * 0.5 + abs(q.y) * 0.866 - 0.475);
		a = 1.0 - smoothstep(-0.03, 0.03, m);
	} else if(vShape < 13.5) {
		float m = min(max(abs(q.y) - 0.17, abs(q.x) - 0.78), max(abs(q.x) - 0.17, abs(q.y) - 0.78));
		a = max(1.0 - smoothstep(-0.03, 0.03, m), exp(-max(m, 0.0) * 22.0) * 0.3);
	}
	if(a <= 0.003) discard;
	vec4 c = vColor * a;
	c.rgb *= shade;
	gl_FragColor = uAdditive > 0.5 ? vec4(c.rgb, 0.0) : c;
}`
