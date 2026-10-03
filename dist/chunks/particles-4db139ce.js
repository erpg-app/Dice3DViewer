import{PARTICLE_MOMENTS as T,p as C,l as H,c as z}from"../dice3dview.es.js";const I=(f,t,e)=>.299*f+.587*t+.114*e,q=f=>Math.round(Math.max(0,Math.min(1,f))*255).toString(16).padStart(2,"0"),E=(f,t)=>{const[e,a,i,n]=C(f)??[1,1,1,1],o=I(e,a,i),s=Math.max(.05,I(t[0],t[1],t[2])),r=h=>o<=s?h*o/s:h+(1-h)*(o-s)/Math.max(.001,1-s)*.75;return`#${q(r(t[0]))}${q(r(t[1]))}${q(r(t[2]))}${q(n)}`},F=new WeakMap,j=(f,t)=>{const e=t.size??1,a=t.moments??{};if(!t.color&&!t.shape&&e===1&&!Object.values(a).includes(false))return f;const i=JSON.stringify([t.color??"",t.shape??"",e,T.map(l=>a[l]!==false)]);let n=F.get(f);n||F.set(f,n=new Map);const o=n.get(i);if(o)return o;const s=t.color?C(t.color):null,r={};f.auraSeconds!==void 0&&(r.auraSeconds=f.auraSeconds),f.linkDistance!==void 0&&(r.linkDistance=f.linkDistance),f.linkSeconds!==void 0&&(r.linkSeconds=f.linkSeconds);for(const l of T){const c=f[l];!c||a[l]===false||(r[l]={...c,size:[c.size[0]*e,c.size[1]*e],...t.shape?{shape:t.shape}:{},...s?{colors:c.colors.map(m=>E(m,s)),...c.palette?{palette:c.palette.map(m=>E(m,s))}:{}}:{}})}const h=Object.freeze(r);return n.set(i,h),h},M=4,x=256,A=x/16,_=M*M;class J{source;version=0;#a;#i=new Map;#t=new Array(_).fill(null);#r=new Set;#o;constructor(t){this.source=document.createElement("canvas"),this.source.width=this.source.height=M*x;const e=this.source.getContext("2d");if(!e)throw new Error("Unable to create the particle image atlas.");this.#a=e,this.#o=t}prepare(t){const e=T.map(a=>t?.[a]?.image).filter(a=>!!a);this.#r=new Set(e);for(const a of e)this.slot(a)}slot(t){const e=this.#i.get(t);if(e!==void 0)return e;let a=this.#t.indexOf(null);if(a<0&&(a=this.#t.findIndex(n=>n!==null&&!this.#r.has(n))),a<0)return-1;const i=this.#t[a];return i&&this.#i.delete(i),this.#t[a]=t,this.#i.set(t,a),this.#c(a),H(t).then(n=>{this.#t[a]===t&&this.#h(a,n)}).catch(()=>{this.#t[a]===t&&this.#h(a,null)}),a}#c(t){const e=t%M*x,a=Math.floor(t/M)*x;this.#a.clearRect(e,a,x,x),this.version++}#h(t,e){const a=this.#a,i=t%M*x+A,n=Math.floor(t/M)*x+A,o=x-A*2;if(a.clearRect(i-A,n-A,x,x),e&&e.naturalWidth>0&&e.naturalHeight>0){const s=o/Math.max(e.naturalWidth,e.naturalHeight),r=e.naturalWidth*s,h=e.naturalHeight*s;a.drawImage(e,i+(o-r)/2,n+(o-h)/2,r,h)}else{const s=a.createRadialGradient(i+o/2,n+o/2,0,i+o/2,n+o/2,o/2);s.addColorStop(0,"rgba(255,255,255,1)"),s.addColorStop(1,"rgba(255,255,255,0)"),a.fillStyle=s,a.fillRect(i,n,o,o)}this.version++,this.#o()}}const X=`attribute vec2 aCorner;
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
}`,K=`precision mediump float;
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
}`,p=4e3,k=10,N=(f,t)=>f==="max"?t.value===t.sides:f==="min"?t.value===1:f.includes(t.value),L=[0,0,0],D={up:0,out:1,sphere:2,back:3},G={random:0,upright:1,motion:2},W=1,R=2,U={soft:0,spark:1,star:2,ring:3,confetti:4,smoke:5,bolt:6,arc:7,flame:8,snowflake:9,heart:10,diamond:11,triangle:12,cross:13},B=16,V=new Set(["spark","bolt"]),$=-Math.PI/2;class Q{#a=0;#i=new Float32Array(p);#t=new Float32Array(p);#r=new Float32Array(p);#o=new Float32Array(p);#c=new Float32Array(p);#h=new Float32Array(p);#d=new Float32Array(p);#m=new Float32Array(p);#f=new Float32Array(p);#x=new Float32Array(p);#l=new Float32Array(p);#g=new Float32Array(p);#s=new Float32Array(p*3);#p=new Uint16Array(p);#n=[];#y=new Map;#M=new WeakMap;#R=new WeakMap;#k=new Float32Array(p*k);#C=new Float32Array(p*k);#b=new Uint32Array(p);#O=(t,e)=>this.#t[t]-this.#t[e];#S=z("particles");#e=null;#u=1;#A=0;#T=new WeakMap;#q=new WeakMap;#P;constructor(t){this.#P=t}get count(){return this.#a}get auraSeconds(){return this.#e?.aura?Math.max(0,this.#e.auraSeconds??2.5):0}get linkSeconds(){return this.#e?.link?Math.max(0,this.#e.linkSeconds??2):0}get hasLink(){return!!this.#e?.link}get hasTrail(){return!!(this.#e?.trail||this.#e?.ground)}configure(t,e,a){this.#e=t,this.#u=Math.max(0,e),this.#S=z(`${a}:particles`),this.#q=new WeakMap,this.#a===0&&this.#n.length>48&&(this.#n.length=0,this.#y.clear())}clear(){this.#a=0}trail(t,e,a,i,n,o){const s=this.#e?.trail;if(!s||i<=0)return;const r=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]);this.#v(s,o,t,void 0,r,true)&&this.#w(this.#M,t,s,s.amount*this.#u*Math.min(1.5,r/6)*i,e,a,n*.55)}ground(t,e,a,i,n,o){const s=this.#e?.ground;if(!s||i<=0)return;const r=Math.sqrt(a[0]*a[0]+a[2]*a[2]);this.#v(s,o,t,void 0,r,true)&&this.#w(this.#R,t,s,s.amount*this.#u*(r*i),[e[0],.012,e[2]],a,n*.3,true)}aura(t,e,a,i,n,o,s=false){const r=this.#e?.aura;!r||a<=0||n<=0||!s&&!this.#v(r,o,t,void 0,void 0,true)||this.#w(this.#M,t,r,r.amount*this.#u*n*a,e,[0,0,0],i*.6)}link(t,e,a,i,n,o){const s=this.#e?.link;if(!s||i<=0||n<=0)return;const r=a[0]-e[0],h=a[2]-e[2],l=Math.sqrt(r*r+h*h);if(l<.001||l>Math.max(0,this.#e?.linkDistance??5)||!this.#v(s,o,t,void 0,void 0,true))return;const c=[(e[0]+a[0])/2,(e[1]+a[1])/2,(e[2]+a[2])/2];this.#w(this.#M,t,s,s.amount*this.#u*n*i,c,L,0,false,{gap:l,angle:Math.atan2(h,r)})}burst(t,e,a,i={}){const n=this.#e?.[t];if(!n||!i.always&&!this.#v(n,i.subject,i.key,i.force,void 0,false))return;const o=Math.round(n.amount*this.#u*Math.max(0,i.strength??1));o>0&&this.#F(this.#I(n),o,e,[0,0,0],a*(t==="impact"||t==="collision"?.35:.5),false)}#v(t,e,a,i,n,o){const s=t.when;if(!s)return true;if(s.minForce!==void 0&&i!==void 0&&i<s.minForce||s.minSpeed!==void 0&&n!==void 0&&n<s.minSpeed)return false;if(e&&(s.sides||s.faces!==void 0)){const r="sides"in e?[e]:e,h=s.faces;if(!r.some(l=>(!s.sides||s.sides.includes(l.sides))&&(h===void 0||N(h,l))))return false}if(s.chance!==void 0&&s.chance<1){if(o&&a){let r=this.#q.get(a);r||this.#q.set(a,r=new Map);let h=r.get(t);if(h===void 0&&r.set(t,h=this.#S.next()<s.chance),!h)return false}else if(this.#S.next()>=s.chance)return false}if(s.cooldown&&a&&!o){let r=this.#T.get(a);r||this.#T.set(a,r=new Map);const h=r.get(t);if(h!==void 0&&this.#A-h<s.cooldown)return false;r.set(t,this.#A)}return true}update(t){if(!(t<=0)){this.#A+=t;for(let e=0;e<this.#a;e++){const a=this.#d[e]+t;if(a>=this.#m[e]){this.#H(this.#a-1,e),this.#a--,e--;continue}this.#d[e]=a;const i=this.#n[this.#p[e]];let n=this.#o[e],o=this.#c[e]-i.gravity*t,s=this.#h[e];if(i.drag>0){const h=Math.max(0,1-i.drag*t);n*=h,o*=h,s*=h}if(i.swirl!==0){const h=i.swirl*t,l=Math.cos(h),c=Math.sin(h),m=n*l-s*c;s=n*c+s*l,n=m}let r=this.#t[e]+o*t;r<.012&&(r=.012,o<0&&(o*=-.25),n*=.7,s*=.7),this.#i[e]=this.#i[e]+n*t,this.#t[e]=r,this.#r[e]=this.#r[e]+s*t,this.#o[e]=n,this.#c[e]=o,this.#h[e]=s,i.orient===R&&n*n+s*s>.0025?this.#l[e]=Math.atan2(s,n):this.#l[e]=this.#l[e]+this.#g[e]*t}}}build(){let t=0,e=0,a=0;for(let i=0;i<this.#a;i++){const n=this.#n[this.#p[i]];n.additive?this.#z(this.#k,t*k,i,n)&&t++:this.#b[a++]=i}a>1&&this.#b.subarray(0,a).sort(this.#O);for(let i=0;i<a;i++){const n=this.#b[i];this.#z(this.#C,e*k,n,this.#n[this.#p[n]])&&e++}return{additive:this.#k,additiveCount:t,alpha:this.#C,alphaCount:e}}#z(t,e,a,i){const n=this.#d[a]/this.#m[a],o=i.stops,s=o.length/4-1,r=n*s,h=Math.min(s-1,Math.floor(r)),l=s>0?r-h:0,c=Math.max(0,h)*4,m=Math.min(s,h+1)*4;let g=o[c+3]+(o[m+3]-o[c+3])*l;if(g*=Math.min(1,n/.06),i.flicker>0&&(g*=1-i.flicker*.5*(1+Math.sin(this.#d[a]*26+this.#x[a]))),g<=.004)return false;let d,u,v;return i.palette.length?(d=this.#s[a*3],u=this.#s[a*3+1],v=this.#s[a*3+2]):(d=o[c]+(o[m]-o[c])*l,u=o[c+1]+(o[m+1]-o[c+1])*l,v=o[c+2]+(o[m+2]-o[c+2])*l),t[e]=this.#i[a],t[e+1]=this.#t[a],t[e+2]=this.#r[a],t[e+3]=this.#f[a]*(1+(i.grow-1)*n),t[e+4]=d*g,t[e+5]=u*g,t[e+6]=v*g,t[e+7]=g,t[e+8]=i.shape,t[e+9]=this.#l[a],true}#w(t,e,a,i,n,o,s,r=false,h){const l=(t.get(e)??0)+i,c=Math.floor(l);t.set(e,l-c),c>0&&this.#F(this.#I(a),c,n,o,s,r,h)}#I(t){const e=this.#y.get(t);if(e!==void 0&&(!t.image||this.#n[e].shape===this.#E(t.image)))return e;const a=t.colors.map(s=>C(s)??[1,1,1,1]),i=(t.palette??[]).map(s=>C(s)??[1,1,1,1]),n=t.shape??"soft",o={options:t,stops:Float32Array.from(a.length>1?a.flat():[...a[0],...a[0]]),palette:Float32Array.from(i.flatMap(s=>[s[0],s[1],s[2]])),additive:(t.blend??"add")==="add",direction:D[t.direction??"sphere"]??2,gravity:t.gravity??0,drag:t.drag??0,swirl:t.swirl??0,grow:t.grow??.3,flicker:t.flicker??0,shape:t.image?this.#E(t.image):U[n]??0,orient:G[t.orient??(!t.image&&V.has(n)?"motion":"random")]??0,spin:t.spin??0};return this.#n.push(o),this.#y.set(t,this.#n.length-1),this.#n.length-1}#E(t){const e=this.#P?.(t)??-1;return e>=0?B+e:0}#F(t,e,a,i,n,o,s){const r=this.#n[t],h=r.options,l=this.#S,c=Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2]),m=r.palette.length/3;for(let g=0;g<e;g++){let d=this.#a;d<p?this.#a++:d=Math.floor(l.next()*p),this.#i[d]=a[0]+(l.next()*2-1)*n,this.#t[d]=o?a[1]:Math.max(.012,a[1]+(l.next()*2-1)*n),this.#r[d]=a[2]+(l.next()*2-1)*n;const u=l.range(h.speed[0],h.speed[1]);let v,b,w;const y=l.next()*Math.PI*2;if(r.direction===0){const S=u*.45*l.next();v=Math.cos(y)*S,w=Math.sin(y)*S,b=u*(.6+.4*l.next())}else if(r.direction===1)v=Math.cos(y)*u,w=Math.sin(y)*u,b=u*.25*l.next();else if(r.direction===3&&c>.001)v=-i[0]/c*u+Math.cos(y)*u*.35,b=-i[1]/c*u+(l.next()*2-1)*u*.35,w=-i[2]/c*u+Math.sin(y)*u*.35;else{const S=l.next()*2-1,P=Math.sqrt(1-S*S);v=Math.cos(y)*P*u,b=S*u,w=Math.sin(y)*P*u}o&&(b=0),this.#o[d]=v,this.#c[d]=b,this.#h[d]=w,this.#d[d]=0,this.#m[d]=l.range(h.life[0],h.life[1]),this.#f[d]=l.range(h.size[0],h.size[1]),this.#x[d]=l.next()*Math.PI*2;const O=l.next()*Math.PI*2;if(this.#l[d]=r.orient===W?$:r.orient===R&&v*v+w*w>.0025?Math.atan2(w,v):O,this.#g[d]=r.spin*(.5+l.next())*(l.next()<.5?-1:1),s&&(this.#f[d]=this.#f[d]*s.gap,this.#l[d]=s.angle+(l.next()<.5?0:Math.PI)),m){const S=Math.floor(l.next()*m)*3;this.#s[d*3]=r.palette[S],this.#s[d*3+1]=r.palette[S+1],this.#s[d*3+2]=r.palette[S+2]}this.#p[d]=t}}#H(t,e){t!==e&&(this.#i[e]=this.#i[t],this.#t[e]=this.#t[t],this.#r[e]=this.#r[t],this.#o[e]=this.#o[t],this.#c[e]=this.#c[t],this.#h[e]=this.#h[t],this.#d[e]=this.#d[t],this.#m[e]=this.#m[t],this.#f[e]=this.#f[t],this.#x[e]=this.#x[t],this.#l[e]=this.#l[t],this.#g[e]=this.#g[t],this.#s[e*3]=this.#s[t*3],this.#s[e*3+1]=this.#s[t*3+1],this.#s[e*3+2]=this.#s[t*3+2],this.#p[e]=this.#p[t])}}export{B as IMAGE_SHAPE_BASE,_ as PARTICLE_ATLAS_SLOTS,p as PARTICLE_CAPACITY,K as PARTICLE_FRAGMENT,k as PARTICLE_STRIDE,X as PARTICLE_VERTEX,J as ParticleAtlas,Q as ParticleSystem,U as SHAPES,j as customizeEffect};
