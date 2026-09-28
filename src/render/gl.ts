import type { ReadonlyQuat, ReadonlyVec3 } from '../engine/vector'
import type { ParticleAtlasSource } from './particleAtlas'

/**
 * Small WebGL renderer for dice. Works on WebGL2 and falls back to WebGL1
 * (GLSL 1.00 shaders, 16-bit indices, bump mapping only with derivatives).
 */

export interface GLMesh {
	readonly position: WebGLBuffer
	readonly normal: WebGLBuffer
	readonly uv: WebGLBuffer
	readonly index: WebGLBuffer
	readonly count: number
	readonly indexType: number
	/** Winding of outward faces (gl.CCW or gl.CW), measured from the normals. */
	readonly frontFace: number
}

export interface GLTexture {
	readonly texture: WebGLTexture
	readonly width: number
	readonly height: number
}

export interface SurfaceMaterial {
	readonly color: ReadonlyVec3
	readonly emissive: ReadonlyVec3
	readonly specular: ReadonlyVec3
	readonly diffuse?: GLTexture | undefined
	readonly diffuseLevel?: number
	/** Alpha-masked texture composited over `color` (theme type "color"). */
	readonly colorMask?: boolean
	readonly bump?: GLTexture | undefined
	readonly bumpLevel?: number
	readonly specularMap?: GLTexture | undefined
	readonly unlit?: boolean
	/** Custom body texture (triplanar), `skinScale` repetitions per world unit. */
	readonly skin?: GLTexture | undefined
	readonly skinScale?: number
	/** 0 normal, 1 multiply, 2 screen, 3 overlay. */
	readonly skinBlend?: number
	readonly skinOpacity?: number
	/** Contrasting outline drawn around the atlas labels (used with skins). */
	readonly outline?: ReadonlyVec3 | undefined
}

export interface DrawState {
	readonly position: ReadonlyVec3
	readonly rotation: ReadonlyQuat
	readonly scale: number
	readonly alpha: number
	readonly glow: ReadonlyVec3
	readonly glowStrength: number
	/** 1 = theme colors; lower values grey the die out (discarded dice). */
	readonly saturation: number
	/** Light the die emits (color × strength): the body looks lit from inside. */
	readonly emission?: ReadonlyVec3
}

export interface FrameSetup {
	readonly viewProjection: Float32Array
	readonly eye: ReadonlyVec3
	readonly lightDirection: ReadonlyVec3
	readonly directionalIntensity: number
	readonly hemisphericIntensity: number
}

const VERTEX = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uViewProj;
uniform mat3 uRot;
uniform vec3 uPos;
uniform float uScale;
uniform float uInflate;
varying vec3 vPos;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vObj;
varying vec3 vObjNormal;
void main() {
	vec3 world = uRot * (aPos * uScale + aNormal * uInflate) + uPos;
	vPos = world;
	vNormal = uRot * aNormal;
	vUv = aUv;
	vObj = aPos * uScale;
	vObjNormal = aNormal;
	gl_Position = uViewProj * vec4(world, 1.0);
}`

// Same composition as the v2 StandardMaterial + ColorTextureMaskPlugin:
// albedo = mix(themeColor, texture.rgb, texture.a) for "color" themes,
// clamp(diffuse light + emissive) * albedo + specular.
const FRAGMENT = `
precision highp float;
varying vec3 vPos;
varying vec3 vNormal;
varying vec2 vUv;
uniform sampler2D uDiffuse;
uniform sampler2D uBump;
uniform sampler2D uSpecularMap;
uniform float uHasDiffuse;
uniform float uColorMask;
uniform float uDiffuseLevel;
uniform float uHasBump;
uniform float uBumpLevel;
uniform float uHasSpecularMap;
uniform float uUnlit;
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform vec3 uSpecular;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform float uDirI;
uniform float uHemiI;
uniform float uAlpha;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform float uSaturation;
uniform vec3 uEmission;
uniform sampler2D uSkin;
uniform float uHasSkin;
uniform float uSkinScale;
uniform float uSkinBlend;
uniform float uSkinOpacity;
uniform vec3 uOutline;
uniform float uHasOutline;
uniform vec2 uDiffuseTexel;
varying vec3 vObj;
varying vec3 vObjNormal;
// Custom skin: the image wraps the body by triplanar projection in object space,
// so it follows the die instead of the face atlas layout.
vec3 skinColor() {
	vec3 w = abs(normalize(vObjNormal));
	w = w * w;
	w = w * w;
	w /= w.x + w.y + w.z;
	vec3 p = vObj * uSkinScale;
	return texture2D(uSkin, p.yz).rgb * w.x + texture2D(uSkin, p.zx).rgb * w.y + texture2D(uSkin, p.xy).rgb * w.z;
}
// Discarded dice lose saturation and a little light, so the kept ones stand out.
vec3 grade(vec3 color) {
	float luma = dot(color, vec3(0.299, 0.587, 0.114));
	return mix(vec3(luma), color, uSaturation) * mix(0.74, 1.0, uSaturation);
}
#ifdef DERIVATIVES
vec3 perturb(vec3 N, vec3 p, vec2 uv, vec3 m) {
	vec3 dp1 = dFdx(p);
	vec3 dp2 = dFdy(p);
	vec2 duv1 = dFdx(uv);
	vec2 duv2 = dFdy(uv);
	vec3 dp2perp = cross(dp2, N);
	vec3 dp1perp = cross(N, dp1);
	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
	float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
	return normalize(mat3(T * invmax, B * invmax, N) * m);
}
#endif
void main() {
	vec3 N = normalize(vNormal);
	vec3 body = uColor;
	if(uHasSkin > 0.5) {
		// Layers: the die color below, the image above with a blend mode and an opacity.
		vec3 skin = skinColor();
		vec3 layered = skin;
		if(uSkinBlend > 2.5) layered = mix(2.0 * body * skin, 1.0 - 2.0 * (1.0 - body) * (1.0 - skin), step(0.5, body));
		else if(uSkinBlend > 1.5) layered = 1.0 - (1.0 - body) * (1.0 - skin);
		else if(uSkinBlend > 0.5) layered = body * skin;
		body = mix(body, layered, uSkinOpacity);
	}
	vec3 albedo = body;
	if(uHasDiffuse > 0.5) {
		vec4 t = texture2D(uDiffuse, vUv);
		vec3 rgb = t.rgb * uDiffuseLevel;
		if(uColorMask > 0.5 && uHasOutline > 0.5) {
			// Busy skins: a thin contrasting outline keeps numbers and symbols readable.
			vec2 o = uDiffuseTexel * 2.5;
			float edge = max(
				max(texture2D(uDiffuse, vUv + vec2(o.x, o.y)).a, texture2D(uDiffuse, vUv - vec2(o.x, o.y)).a),
				max(texture2D(uDiffuse, vUv + vec2(o.x, -o.y)).a, texture2D(uDiffuse, vUv - vec2(o.x, -o.y)).a)
			);
			body = mix(body, uOutline, edge * 0.85);
		}
		albedo = uColorMask > 0.5 ? mix(body, rgb, t.a) : rgb * uColor;
	}
	if(uUnlit > 0.5) {
		vec3 shown = 1.0 - (1.0 - clamp(albedo, 0.0, 1.0)) * (1.0 - clamp(uEmission, 0.0, 1.0));
		gl_FragColor = vec4(grade(shown) + uGlow * uGlowStrength, uAlpha);
		return;
	}
#ifdef DERIVATIVES
	if(uHasBump > 0.5) {
		vec3 m = texture2D(uBump, vUv).xyz * 2.0 - 1.0;
		m.xy *= uBumpLevel;
		N = perturb(N, vPos, vUv, normalize(m));
	}
#endif
	vec3 L = normalize(-uLightDir);
	vec3 V = normalize(uEye - vPos);
	float diffuse = uDirI * max(dot(N, L), 0.0) + uHemiI * (0.5 + 0.5 * N.y);
	float spec = uDirI * pow(max(dot(N, normalize(L + V)), 0.0), 64.0)
		+ uHemiI * pow(max(dot(N, normalize(vec3(0.0, 1.0, 0.0) + V)), 0.0), 64.0);
	vec3 specular = uSpecular;
	if(uHasSpecularMap > 0.5) specular *= texture2D(uSpecularMap, vUv).rgb;
	vec3 color = clamp(vec3(diffuse) + uEmissive, 0.0, 1.0) * albedo + specular * spec;
	// Effect glow hugs the silhouette and keeps the face artwork legible.
	float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
	color += uGlow * uGlowStrength * (0.12 + 0.5 * rim);
	// Own light, screen-blended: dark bodies light up in the glow color, light
	// bodies keep their detail instead of burning to white; the edges shine most.
	vec3 own = clamp(uEmission * (0.8 + 0.7 * rim), 0.0, 1.0);
	color = 1.0 - (1.0 - clamp(color, 0.0, 1.0)) * (1.0 - own);
	gl_FragColor = vec4(grade(color), uAlpha);
}`

// Outline halo: inflated back faces in the effect color (HighlightLayer stand-in).
// Only back faces are drawn, so the die hides the halo except around its outline.
const HALO_FRAGMENT = `
precision mediump float;
uniform vec3 uGlow;
uniform float uAlpha;
void main() { gl_FragColor = vec4(uGlow * uAlpha, uAlpha); }`

const QUAD_VERTEX = `
attribute vec2 aCorner;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform vec2 uSize;
varying vec2 vCorner;
void main() {
	vCorner = aCorner;
	gl_Position = uViewProj * vec4(uCenter + vec3(aCorner.x * uSize.x, 0.0, -aCorner.y * uSize.y), 1.0);
}`

const SHADOW_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
uniform float uAlpha;
void main() {
	float a = uAlpha * smoothstep(1.0, 0.15, length(vCorner));
	gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`

// Expanding shock ring on the table (explosions, rerolls, criticals).
const RING_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
uniform float uAlpha;
uniform vec3 uColor;
void main() {
	float d = length(vCorner);
	float a = uAlpha * smoothstep(0.55, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
	gl_FragColor = vec4(uColor * a, a);
}`

// Light a glowing die casts on the table: a soft pool, brightest under the die.
const LIGHT_FRAGMENT = `
precision mediump float;
varying vec2 vCorner;
uniform float uAlpha;
uniform vec3 uColor;
void main() {
	float d = min(1.0, length(vCorner));
	float a = uAlpha * pow(1.0 - d, 1.6);
	gl_FragColor = vec4(uColor * a, a * 0.35);
}`

/** Floats per particle: x, y, z, size, premultiplied r, g, b, a, shape, angle. */
const PARTICLE_FLOATS = 10
/** Texture unit of the particle image atlas (surfaces use the lower ones). */
const ATLAS_UNIT = 7

/** Particle program sources, provided by the lazy particle engine. */
export interface ParticleShaders {
	readonly vertex: string
	readonly fragment: string
}

type AnyGL = WebGLRenderingContext | WebGL2RenderingContext

interface Program {
	readonly program: WebGLProgram
	readonly attributes: Record<string, number>
	readonly uniforms: Record<string, WebGLUniformLocation | null>
}

const toGLSL3 = (source: string, fragment: boolean): string => `#version 300 es
${fragment ? '#define DERIVATIVES\nout highp vec4 fragColor;\n' : ''}${source
	.replace(/\battribute\b/g, 'in')
	.replace(/\bvarying\b/g, fragment ? 'in' : 'out')
	.replace(/\btexture2D\b/g, 'texture')
	.replace(/\bgl_FragColor\b/g, 'fragColor')}`

export class DiceGL {
	readonly gl: AnyGL
	readonly webgl2: boolean
	// Everything below belongs to the current context and is rebuilt by #setup after a restore.
	#derivatives = false
	#uint32 = false
	#anisotropy: EXT_texture_filter_anisotropic | null = null
	/** Instanced drawing (WebGL2, or ANGLE_instanced_arrays on WebGL1); particles need it. */
	#instancing: {
		readonly divisor: (location: number, divisor: number) => void
		readonly draw: (mode: number, first: number, count: number, instances: number) => void
	} | null = null
	#surface!: Program
	#halo!: Program
	#shadow!: Program
	#ring!: Program
	#light!: Program
	/** Compiled on the first particle draw (the shaders come with the particle chunk). */
	#particle: Program | null = null
	#particleBuffer!: WebGLBuffer
	#particleBytes = 0
	/** Particle images (uploaded again when the atlas version changes). */
	#atlas: WebGLTexture | null = null
	#atlasSource: ParticleAtlasSource | null = null
	#atlasVersion = -1
	#quad!: WebGLBuffer
	#lost = false
	// Redundant state skipped between draws: frame uniforms per program, the
	// current surface material and the mesh bound for a program.
	#surfaceFrame: FrameSetup | null = null
	#haloFrame: FrameSetup | null = null
	#surfaceMaterial: SurfaceMaterial | null = null
	#boundMesh: GLMesh | null = null
	#boundProgram: Program | null = null
	readonly #rotation = new Float32Array(9)

	/** `onRestore` runs after a lost context comes back and the programs are rebuilt. */
	constructor(canvas: HTMLCanvasElement, antialias: boolean, onRestore?: () => void) {
		const attributes: WebGLContextAttributes = { alpha: true, antialias, premultipliedAlpha: true, preserveDrawingBuffer: false, depth: true }
		const webgl2 = canvas.getContext('webgl2', attributes)
		const gl = webgl2 ?? canvas.getContext('webgl', attributes) ?? canvas.getContext('experimental-webgl', attributes) as WebGLRenderingContext | null
		if(!gl) throw new Error('WebGL is unavailable in this browser.')
		this.gl = gl
		this.webgl2 = Boolean(webgl2)
		this.#setup()
		canvas.addEventListener('webglcontextlost', event => {
			event.preventDefault()
			this.#lost = true
		})
		canvas.addEventListener('webglcontextrestored', () => {
			this.#setup()
			this.#lost = false
			onRestore?.()
		})
	}

	/** Extensions, programs and buffers of the current context. */
	#setup(): void {
		const gl = this.gl
		this.#derivatives = this.webgl2 || Boolean(gl.getExtension('OES_standard_derivatives'))
		this.#uint32 = this.webgl2 || Boolean(gl.getExtension('OES_element_index_uint'))
		this.#anisotropy = gl.getExtension('EXT_texture_filter_anisotropic')
			?? gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') as EXT_texture_filter_anisotropic | null
		if(this.webgl2) {
			const gl2 = gl as WebGL2RenderingContext
			this.#instancing = {
				divisor: (location, divisor) => gl2.vertexAttribDivisor(location, divisor),
				draw: (mode, first, count, instances) => gl2.drawArraysInstanced(mode, first, count, instances)
			}
		} else {
			const extension = gl.getExtension('ANGLE_instanced_arrays')
			this.#instancing = extension
				? {
					divisor: (location, divisor) => extension.vertexAttribDivisorANGLE(location, divisor),
					draw: (mode, first, count, instances) => extension.drawArraysInstancedANGLE(mode, first, count, instances)
				}
				: null
		}
		this.#surface = this.#compile(VERTEX, FRAGMENT)
		this.#halo = this.#compile(VERTEX, HALO_FRAGMENT)
		this.#shadow = this.#compile(QUAD_VERTEX, SHADOW_FRAGMENT)
		this.#ring = this.#compile(QUAD_VERTEX, RING_FRAGMENT)
		this.#light = this.#compile(QUAD_VERTEX, LIGHT_FRAGMENT)
		this.#particle = null
		const particleBuffer = gl.createBuffer()
		if(!particleBuffer) throw new Error('Unable to create a WebGL buffer.')
		this.#particleBuffer = particleBuffer
		this.#particleBytes = 0
		this.#atlas = null
		this.#atlasSource = null
		this.#atlasVersion = -1
		this.#quad = this.#buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]))
		this.#surfaceFrame = null
		this.#haloFrame = null
		this.#surfaceMaterial = null
		this.#boundMesh = null
		this.#boundProgram = null
	}

	get lost(): boolean {
		return this.#lost || this.gl.isContextLost()
	}

	#compile(vertexSource: string, fragmentSource: string): Program {
		const gl = this.gl
		const build = (type: number, source: string): WebGLShader => {
			const shader = gl.createShader(type)
			if(!shader) throw new Error('Unable to create a WebGL shader.')
			const fragment = type === gl.FRAGMENT_SHADER
			const text = this.webgl2
				? toGLSL3(source, fragment)
				: `${fragment && this.#derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define DERIVATIVES\n' : ''}${source}`
			gl.shaderSource(shader, text)
			gl.compileShader(shader)
			if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader compilation failed: ${gl.getShaderInfoLog(shader) ?? ''}`)
			return shader
		}
		const program = gl.createProgram()
		if(!program) throw new Error('Unable to create a WebGL program.')
		gl.attachShader(program, build(gl.VERTEX_SHADER, vertexSource))
		gl.attachShader(program, build(gl.FRAGMENT_SHADER, fragmentSource))
		gl.linkProgram(program)
		if(!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program) ?? ''}`)
		const attributes: Record<string, number> = {}
		for(let i = 0; i < (gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number); i++) {
			const info = gl.getActiveAttrib(program, i)
			if(info) attributes[info.name] = gl.getAttribLocation(program, info.name)
		}
		const uniforms: Record<string, WebGLUniformLocation | null> = {}
		for(let i = 0; i < (gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number); i++) {
			const info = gl.getActiveUniform(program, i)
			if(info) uniforms[info.name] = gl.getUniformLocation(program, info.name)
		}
		return { program, attributes, uniforms }
	}

	#buffer(target: number, data: ArrayBufferView): WebGLBuffer {
		const gl = this.gl
		const buffer = gl.createBuffer()
		if(!buffer) throw new Error('Unable to create a WebGL buffer.')
		gl.bindBuffer(target, buffer)
		gl.bufferData(target, data as unknown as BufferSource, gl.STATIC_DRAW)
		this.#boundProgram = null
		return buffer
	}

	createMesh(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: ArrayLike<number>): GLMesh {
		const gl = this.gl
		const vertexCount = positions.length / 3
		const wide = vertexCount > 65535
		if(wide && !this.#uint32) throw new Error('Mesh exceeds 65535 vertices without OES_element_index_uint.')
		const indexData = wide ? new Uint32Array(indices) : new Uint16Array(indices)
		return {
			position: this.#buffer(gl.ARRAY_BUFFER, positions),
			normal: this.#buffer(gl.ARRAY_BUFFER, normals),
			uv: this.#buffer(gl.ARRAY_BUFFER, uvs),
			index: this.#buffer(gl.ELEMENT_ARRAY_BUFFER, indexData),
			count: indexData.length,
			indexType: wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
			frontFace: windingOf(positions, normals, indexData) >= 0 ? gl.CCW : gl.CW
		}
	}

	/** Uploads an image with Babylon's default invertY convention. */
	createTexture(source: TexImageSource, options: { readonly mipmap?: boolean; readonly clamp?: boolean } = {}): GLTexture {
		const gl = this.gl
		const texture = gl.createTexture()
		if(!texture) throw new Error('Unable to create a WebGL texture.')
		const width = 'width' in source ? Number(source.width) : 1
		const height = 'height' in source ? Number(source.height) : 1
		const powerOfTwo = (width & (width - 1)) === 0 && (height & (height - 1)) === 0
		const mipmap = (options.mipmap ?? true) && (this.webgl2 || powerOfTwo)
		// Binding a texture changes the unit the cached material relies on.
		this.#surfaceMaterial = null
		gl.bindTexture(gl.TEXTURE_2D, texture)
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
		if(mipmap) gl.generateMipmap(gl.TEXTURE_2D)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
		const wrap = options.clamp || !(this.webgl2 || powerOfTwo) ? gl.CLAMP_TO_EDGE : gl.REPEAT
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
		if(this.#anisotropy && mipmap) gl.texParameterf(gl.TEXTURE_2D, this.#anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, 8)
		return { texture, width, height }
	}

	deleteTexture(texture: GLTexture): void {
		this.#surfaceMaterial = null
		this.gl.deleteTexture(texture.texture)
	}

	deleteMesh(mesh: GLMesh): void {
		const gl = this.gl
		this.#boundProgram = null
		for(const buffer of [mesh.position, mesh.normal, mesh.uv, mesh.index]) gl.deleteBuffer(buffer)
	}

	beginFrame(width: number, height: number): void {
		const gl = this.gl
		gl.viewport(0, 0, width, height)
		gl.clearColor(0, 0, 0, 0)
		gl.depthMask(true)
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	}

	/** One flat quad per item on the table (shadows, rings and pools of light share it). */
	#drawQuads(frame: FrameSetup, program: Program, height: number, items: readonly { readonly x: number; readonly z: number; readonly size: number; readonly alpha: number; readonly color?: ReadonlyVec3 }[]): void {
		if(!items.length) return
		const gl = this.gl
		const { attributes, uniforms } = program
		gl.useProgram(program.program)
		gl.disable(gl.DEPTH_TEST)
		gl.disable(gl.CULL_FACE)
		gl.depthMask(false)
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
		gl.uniformMatrix4fv(uniforms.uViewProj ?? null, false, frame.viewProjection)
		this.#bindQuad(attributes.aCorner)
		for(const item of items) {
			gl.uniform3f(uniforms.uCenter ?? null, item.x, height, item.z)
			gl.uniform2f(uniforms.uSize ?? null, item.size, item.size)
			gl.uniform1f(uniforms.uAlpha ?? null, item.alpha)
			if(item.color) gl.uniform3f(uniforms.uColor ?? null, item.color[0], item.color[1], item.color[2])
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
		}
	}

	drawShadows(frame: FrameSetup, shadows: readonly { readonly x: number; readonly z: number; readonly size: number; readonly alpha: number }[]): void {
		this.#drawQuads(frame, this.#shadow, 0.002, shadows)
	}

	/** Pools of light cast on the table by glowing dice (drawn before the shadows). */
	drawLights(frame: FrameSetup, lights: readonly { readonly x: number; readonly z: number; readonly size: number; readonly alpha: number; readonly color: ReadonlyVec3 }[]): void {
		this.#drawQuads(frame, this.#light, 0.001, lights)
	}

	drawRings(frame: FrameSetup, rings: readonly { readonly x: number; readonly z: number; readonly size: number; readonly alpha: number; readonly color: ReadonlyVec3 }[]): void {
		this.#drawQuads(frame, this.#ring, 0.004, rings)
	}

	/**
	 * Draws `count` particles packed as x, y, z, size, r, g, b, a (premultiplied),
	 * shape, angle, as instanced quads (no point-size limit of the GPU).
	 * `pixelScale` converts a world size at depth w into pixels (viewport height / 2 / tan(fov / 2)).
	 */
	/** `time` (seconds) animates bolts and arcs; `atlas` holds the images of image particles. */
	drawParticles(frame: FrameSetup, data: Float32Array, count: number, additive: boolean, pixelScale: number, shaders: ParticleShaders, time = 0, atlas: ParticleAtlasSource | null = null): void {
		const instancing = this.#instancing
		if(count <= 0 || !instancing) return
		const gl = this.gl
		this.#particle ??= this.#compile(shaders.vertex, shaders.fragment)
		const { program, attributes, uniforms: u } = this.#particle
		gl.useProgram(program)
		gl.enable(gl.DEPTH_TEST)
		gl.depthMask(false)
		gl.disable(gl.CULL_FACE)
		gl.enable(gl.BLEND)
		if(additive) gl.blendFunc(gl.ONE, gl.ONE)
		else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
		gl.uniformMatrix4fv(u.uViewProj ?? null, false, frame.viewProjection)
		gl.uniform1f(u.uPixelScale ?? null, pixelScale)
		gl.uniform2f(u.uViewport ?? null, gl.drawingBufferWidth, gl.drawingBufferHeight)
		gl.uniform1f(u.uAdditive ?? null, additive ? 1 : 0)
		gl.uniform1f(u.uTime ?? null, time % 3600)
		this.#bindAtlas(atlas, u.uAtlas)
		this.#bindQuad(attributes.aCorner)
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#particleBuffer)
		const view = data.subarray(0, count * PARTICLE_FLOATS)
		if(view.byteLength > this.#particleBytes) {
			this.#particleBytes = data.byteLength
			gl.bufferData(gl.ARRAY_BUFFER, this.#particleBytes, gl.DYNAMIC_DRAW)
		}
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, view as unknown as BufferSource)
		const stride = PARTICLE_FLOATS * 4
		const locations: number[] = []
		for(const [name, size, offset] of PARTICLE_LAYOUT) {
			const location = attributes[name]
			if(location === undefined || location < 0) continue
			gl.enableVertexAttribArray(location)
			gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
			instancing.divisor(location, 1)
			locations.push(location)
		}
		instancing.draw(gl.TRIANGLE_STRIP, 0, 4, count)
		// Divisors are global attribute state: leave them as the other programs expect.
		for(const location of locations) {
			instancing.divisor(location, 0)
			gl.disableVertexAttribArray(location)
		}
	}

	/** Binds the particle image atlas on its own unit, uploading it when it changed. */
	#bindAtlas(atlas: ParticleAtlasSource | null, sampler: WebGLUniformLocation | null | undefined): void {
		const gl = this.gl
		gl.activeTexture(gl.TEXTURE0 + ATLAS_UNIT)
		if(atlas && (!this.#atlas || this.#atlasSource !== atlas || this.#atlasVersion !== atlas.version)) {
			this.#atlas ??= gl.createTexture()
			gl.bindTexture(gl.TEXTURE_2D, this.#atlas)
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.source)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
			gl.generateMipmap(gl.TEXTURE_2D)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
			this.#atlasSource = atlas
			this.#atlasVersion = atlas.version
		} else gl.bindTexture(gl.TEXTURE_2D, atlas ? this.#atlas : null)
		gl.uniform1i(sampler ?? null, ATLAS_UNIT)
		gl.activeTexture(gl.TEXTURE0)
	}

	drawSurface(frame: FrameSetup, mesh: GLMesh, material: SurfaceMaterial, state: DrawState): void {
		const gl = this.gl
		const surface = this.#surface
		const u = surface.uniforms
		gl.useProgram(surface.program)
		gl.enable(gl.DEPTH_TEST)
		gl.enable(gl.CULL_FACE)
		gl.frontFace(mesh.frontFace)
		gl.cullFace(gl.BACK)
		if(this.#surfaceFrame !== frame) {
			this.#surfaceFrame = frame
			gl.uniformMatrix4fv(u.uViewProj ?? null, false, frame.viewProjection)
			gl.uniform3f(u.uEye ?? null, frame.eye[0], frame.eye[1], frame.eye[2])
			gl.uniform3f(u.uLightDir ?? null, frame.lightDirection[0], frame.lightDirection[1], frame.lightDirection[2])
			gl.uniform1f(u.uDirI ?? null, frame.directionalIntensity)
			gl.uniform1f(u.uHemiI ?? null, frame.hemisphericIntensity)
			gl.uniform1f(u.uInflate ?? null, 0)
		}
		if(this.#surfaceMaterial !== material) {
			this.#surfaceMaterial = material
			gl.uniform3f(u.uColor ?? null, material.color[0], material.color[1], material.color[2])
			gl.uniform3f(u.uEmissive ?? null, material.emissive[0], material.emissive[1], material.emissive[2])
			gl.uniform3f(u.uSpecular ?? null, material.specular[0], material.specular[1], material.specular[2])
			gl.uniform1f(u.uUnlit ?? null, material.unlit ? 1 : 0)
			gl.uniform1f(u.uColorMask ?? null, material.colorMask ? 1 : 0)
			gl.uniform1f(u.uDiffuseLevel ?? null, material.diffuseLevel ?? 1)
			this.#bindTexture(0, material.diffuse, u.uDiffuse, u.uHasDiffuse)
			this.#bindTexture(1, this.#derivatives ? material.bump : undefined, u.uBump, u.uHasBump)
			gl.uniform1f(u.uBumpLevel ?? null, material.bumpLevel ?? 1)
			this.#bindTexture(2, material.specularMap, u.uSpecularMap, u.uHasSpecularMap)
			this.#bindTexture(3, material.skin, u.uSkin, u.uHasSkin)
			gl.uniform1f(u.uSkinScale ?? null, material.skinScale ?? 1)
			gl.uniform1f(u.uSkinBlend ?? null, material.skinBlend ?? 0)
			gl.uniform1f(u.uSkinOpacity ?? null, material.skinOpacity ?? 1)
			gl.uniform1f(u.uHasOutline ?? null, material.outline ? 1 : 0)
			const outline = material.outline ?? NO_EMISSION
			gl.uniform3f(u.uOutline ?? null, outline[0], outline[1], outline[2])
			gl.uniform2f(u.uDiffuseTexel ?? null, 1 / Math.max(1, material.diffuse?.width ?? 1024), 1 / Math.max(1, material.diffuse?.height ?? 1024))
		}
		gl.uniformMatrix3fv(u.uRot ?? null, false, writeRotation(this.#rotation, state.rotation))
		gl.uniform3f(u.uPos ?? null, state.position[0], state.position[1], state.position[2])
		gl.uniform1f(u.uScale ?? null, state.scale)
		gl.uniform1f(u.uAlpha ?? null, state.alpha)
		gl.uniform3f(u.uGlow ?? null, state.glow[0], state.glow[1], state.glow[2])
		gl.uniform1f(u.uGlowStrength ?? null, state.glowStrength)
		gl.uniform1f(u.uSaturation ?? null, state.saturation)
		const emission = state.emission ?? NO_EMISSION
		gl.uniform3f(u.uEmission ?? null, emission[0], emission[1], emission[2])
		this.#bindMesh(mesh, surface)
		if(state.alpha >= 0.999) {
			gl.disable(gl.BLEND)
			gl.depthMask(true)
			gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0)
			return
		}
		// Faded dice: a depth pre-pass keeps only the nearest surface, so the
		// die reads as one translucent solid instead of showing its inside.
		gl.disable(gl.BLEND)
		gl.colorMask(false, false, false, false)
		gl.depthMask(true)
		gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0)
		gl.colorMask(true, true, true, true)
		gl.depthMask(false)
		gl.depthFunc(gl.LEQUAL)
		gl.enable(gl.BLEND)
		gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
		gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0)
		gl.depthFunc(gl.LESS)
	}

	/**
	 * Soft outline in the effect color, drawn as inflated back faces. `grow`
	 * also scales the shell per layer, for flat bodies (coins) whose normals
	 * point up and down and would not widen the silhouette.
	 */
	drawHalo(frame: FrameSetup, mesh: GLMesh, state: DrawState, inflate: number, grow = 0, weight = 1): void {
		if(state.glowStrength <= 0.001) return
		const gl = this.gl
		const halo = this.#halo
		const u = halo.uniforms
		gl.useProgram(halo.program)
		gl.enable(gl.DEPTH_TEST)
		gl.enable(gl.CULL_FACE)
		gl.frontFace(mesh.frontFace)
		gl.cullFace(gl.FRONT)
		gl.depthMask(false)
		gl.enable(gl.BLEND)
		gl.blendFunc(gl.ONE, gl.ONE)
		if(this.#haloFrame !== frame) {
			this.#haloFrame = frame
			gl.uniformMatrix4fv(u.uViewProj ?? null, false, frame.viewProjection)
		}
		gl.uniformMatrix3fv(u.uRot ?? null, false, writeRotation(this.#rotation, state.rotation))
		gl.uniform3f(u.uPos ?? null, state.position[0], state.position[1], state.position[2])
		gl.uniform3f(u.uGlow ?? null, state.glow[0], state.glow[1], state.glow[2])
		this.#bindMesh(mesh, halo)
		for(let layer = 1; layer <= 3; layer++) {
			gl.uniform1f(u.uScale ?? null, state.scale * (1 + grow * layer))
			gl.uniform1f(u.uInflate ?? null, inflate * layer)
			gl.uniform1f(u.uAlpha ?? null, Math.min(1, state.glowStrength * HALO_SHARES[layer - 1]! * weight) * state.alpha)
			gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0)
		}
		gl.cullFace(gl.BACK)
	}

	#bindTexture(unit: number, texture: GLTexture | undefined, sampler: WebGLUniformLocation | null | undefined, flag: WebGLUniformLocation | null | undefined): void {
		const gl = this.gl
		gl.activeTexture(gl.TEXTURE0 + unit)
		gl.bindTexture(gl.TEXTURE_2D, texture?.texture ?? null)
		gl.uniform1i(sampler ?? null, unit)
		gl.uniform1f(flag ?? null, texture ? 1 : 0)
	}

	/** Vertex arrays of a mesh for a program; skipped when they are already bound (dice of a type share a mesh). */
	#bindMesh(mesh: GLMesh, program: Program): void {
		if(this.#boundMesh === mesh && this.#boundProgram === program) return
		const gl = this.gl
		const { attributes } = program
		const bind = (buffer: WebGLBuffer, location: number | undefined, size: number): void => {
			if(location === undefined || location < 0) return
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
			gl.enableVertexAttribArray(location)
			gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
		}
		bind(mesh.position, attributes.aPos, 3)
		bind(mesh.normal, attributes.aNormal, 3)
		bind(mesh.uv, attributes.aUv, 2)
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.index)
		this.#boundMesh = mesh
		this.#boundProgram = program
	}

	#bindQuad(location: number | undefined): void {
		const gl = this.gl
		this.#boundProgram = null
		if(location === undefined || location < 0) return
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad)
		gl.enableVertexAttribArray(location)
		gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
	}

	dispose(): void {
		const gl = this.gl
		for(const program of [this.#surface, this.#halo, this.#shadow, this.#ring, this.#light, this.#particle]) if(program) gl.deleteProgram(program.program)
		gl.deleteBuffer(this.#quad)
		gl.deleteBuffer(this.#particleBuffer)
		if(this.#atlas) gl.deleteTexture(this.#atlas)
		gl.getExtension('WEBGL_lose_context')?.loseContext()
	}
}

const NO_EMISSION: ReadonlyVec3 = [0, 0, 0]
/** Alpha share of each halo layer, inner to outer. */
const HALO_SHARES = [0.55, 0.3, 0.15]
/** Per-instance attributes of a particle: name, floats, byte offset. */
const PARTICLE_LAYOUT: readonly (readonly [string, number, number])[] = [['aPos', 3, 0], ['aSize', 1, 12], ['aColor', 4, 16], ['aShape', 1, 32], ['aAngle', 1, 36]]

/** Positive when the outward faces (per vertex normals) wind counter-clockwise. */
const windingOf = (positions: ArrayLike<number>, normals: ArrayLike<number>, indices: ArrayLike<number>): number => {
	let sum = 0
	for(let t = 0; t + 2 < indices.length; t += 3) {
		const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3
		const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!
		const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!
		sum += (uy * vz - uz * vy) * (normals[a]! + normals[b]! + normals[c]!)
			+ (uz * vx - ux * vz) * (normals[a + 1]! + normals[b + 1]! + normals[c + 1]!)
			+ (ux * vy - uy * vx) * (normals[a + 2]! + normals[b + 2]! + normals[c + 2]!)
	}
	return sum
}

/** Column-major 3×3 rotation of a quaternion, written into `out` (no allocation per draw). */
const writeRotation = (out: Float32Array, q: ReadonlyQuat): Float32Array => {
	const x = q[0], y = q[1], z = q[2], w = q[3]
	out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y + w * z); out[2] = 2 * (x * z - w * y)
	out[3] = 2 * (x * y - w * z); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z + w * x)
	out[6] = 2 * (x * z + w * y); out[7] = 2 * (y * z - w * x); out[8] = 1 - 2 * (x * x + y * y)
	return out
}

export const rotationMatrix = (q: ReadonlyQuat): Float32Array => writeRotation(new Float32Array(9), q)

export const perspective = (fovy: number, aspect: number, near: number, far: number): Float32Array => {
	const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far)
	return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0])
}

export const lookAt = (eye: ReadonlyVec3, center: ReadonlyVec3, up: ReadonlyVec3): Float32Array => {
	const n = (v: readonly number[]): number[] => {
		const l = Math.hypot(...v)
		return v.map(x => x / l)
	}
	const c = (a: readonly number[], b: readonly number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
	const d = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
	const z = n([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]])
	const x = n(c(up, z)), y = c(z, x)
	return new Float32Array([x[0]!, y[0]!, z[0]!, 0, x[1]!, y[1]!, z[1]!, 0, x[2]!, y[2]!, z[2]!, 0, -d(x, eye), -d(y, eye), -d(z, eye), 1])
}

export const multiply = (a: Float32Array, b: Float32Array): Float32Array => {
	const out = new Float32Array(16)
	for(let col = 0; col < 4; col++) for(let row = 0; row < 4; row++) {
		let sum = 0
		for(let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!
		out[col * 4 + row] = sum
	}
	return out
}
