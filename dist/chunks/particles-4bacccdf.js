var Y=d=>{let e=2166136261;for(let t=0;t<d.length;t++)e^=d.charCodeAt(t),e=Math.imul(e,16777619);return e>>>0},T=d=>{let e=Y(d)||2654435769,t=()=>{e+=1831565813;let n=e;return n=Math.imul(n^n>>>15,n|1),n^=n+Math.imul(n^n>>>7,n|61),((n^n>>>14)>>>0)/4294967296};return{next:t,range:(n,a)=>n+(a-n)*t()}};var ce=Object.freeze(["sparkle","fire","arcane","frost","dust","confetti","electric","smoke","lava","storm","holy","shadow","poison","nature","cosmic","lightning","blizzard","hearts","sakura","bubbles","vortex","meteor","crystal","moonlight"]),de=Object.freeze(["soft","spark","star","ring","confetti","smoke","bolt","arc","flame","snowflake","heart","diamond","triangle","cross","bubble","petal","shard","moon","comet","drop"]),he=Object.freeze(["random","upright","motion"]),C=Object.freeze(["trail","ground","impact","collision","settle","aura","explode","critical","link"]),ue=Object.freeze(["volume","ring","shell"]),fe=Object.freeze(["steady","pulse","flicker","heartbeat","rainbow"]),me=Object.freeze(["none","pop","twirl"]);var O=(d,e)=>{let t=d?.[e];return t?Array.isArray(t)?t:[t]:[]},k=d=>{if(typeof d!="string"||!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(d))return null;let e=d.length===4?d.slice(1).split("").map(n=>n+n).join(""):d.slice(1),t=n=>parseInt(e.slice(n*2,n*2+2),16)/255;return[t(0),t(1),t(2),e.length===8?t(3):1]};var D=(d,e,t)=>.299*d+.587*e+.114*t,q=d=>Math.round(Math.max(0,Math.min(1,d))*255).toString(16).padStart(2,"0"),L=(d,e)=>{let[t,n,a,s]=k(d)??[1,1,1,1],o=D(t,n,a),i=Math.max(.05,D(e[0],e[1],e[2])),r=l=>o<=i?l*o/i:l+(1-l)*(o-i)/Math.max(.001,1-i)*.75;return`#${q(r(e[0]))}${q(r(e[1]))}${q(r(e[2]))}${q(s)}`},F=new WeakMap,X=(d,e)=>{let t=e.size??1,n=e.moments??{};if(!e.color&&!e.shape&&t===1&&!Object.values(n).includes(!1))return d;let a=JSON.stringify([e.color??"",e.shape??"",t,C.map(c=>n[c]!==!1)]),s=F.get(d);s||F.set(d,s=new Map);let o=s.get(a);if(o)return o;let i=e.color?k(e.color):null,r={};d.auraSeconds!==void 0&&(r.auraSeconds=d.auraSeconds),d.linkDistance!==void 0&&(r.linkDistance=d.linkDistance),d.linkSeconds!==void 0&&(r.linkSeconds=d.linkSeconds);for(let c of C){let u=O(d,c);if(!u.length||n[c]===!1)continue;let b=u.map(f=>({...f,size:[f.size[0]*t,f.size[1]*t],...e.shape?{shape:e.shape}:{},...i?{colors:f.colors.map(g=>L(g,i)),...f.palette?{palette:f.palette.map(g=>L(g,i))}:{}}:{}}));r[c]=b.length===1?b[0]:b}let l=Object.freeze(r);return s.set(a,l),l};var _=(d,e)=>{if(typeof document>"u")return new OffscreenCanvas(d,e);let t=document.createElement("canvas");return t.width=d,t.height=e,t},N=(d,e)=>d.getContext("2d",e),H=d=>"naturalWidth"in d?{width:d.naturalWidth,height:d.naturalHeight}:d;var V=d=>new Promise((e,t)=>{let n=new Image;n.crossOrigin="anonymous",n.decoding="async",n.onload=()=>e(n),n.onerror=()=>t(new Error(`Unable to load image '${d}'.`)),n.src=d});var P=4,x=256,R=x/16,G=P*P,$=class{source;version=0;#n;#r;#t=new Map;#e=new Array(G).fill(null);#o=new Set;#c;constructor(e,t=V){this.source=_(P*x,P*x);let n=N(this.source);if(!n)throw new Error("Unable to create the particle image atlas.");this.#n=n,this.#c=e,this.#r=t}prepare(e){let t=e?C.flatMap(n=>O(e,n).map(a=>a.image)).filter(n=>!!n):[];this.#o=new Set(t);for(let n of t)this.slot(n)}slot(e){let t=this.#t.get(e);if(t!==void 0)return t;let n=this.#e.indexOf(null);if(n<0&&(n=this.#e.findIndex(s=>s!==null&&!this.#o.has(s))),n<0)return-1;let a=this.#e[n];return a&&this.#t.delete(a),this.#e[n]=e,this.#t.set(e,n),this.#d(n),this.#r(e).then(s=>{this.#e[n]===e&&this.#a(n,s)}).catch(()=>{this.#e[n]===e&&this.#a(n,null)}),n}#d(e){let t=e%P*x,n=Math.floor(e/P)*x;this.#n.clearRect(t,n,x,x),this.version++}#a(e,t){let n=this.#n,a=e%P*x+R,s=Math.floor(e/P)*x+R,o=x-R*2;n.clearRect(a-R,s-R,x,x);let i=t&&H(t);if(t&&i&&i.width>0&&i.height>0){let r=o/Math.max(i.width,i.height),l=i.width*r,c=i.height*r;n.drawImage(t,a+(o-l)/2,s+(o-c)/2,l,c)}else{let r=n.createRadialGradient(a+o/2,s+o/2,0,a+o/2,s+o/2,o/2);r.addColorStop(0,"rgba(255,255,255,1)"),r.addColorStop(1,"rgba(255,255,255,0)"),n.fillStyle=r,n.fillRect(a,s,o,o)}this.version++,this.#c()}};var J=`attribute vec2 aCorner;
attribute vec3 aPos;
attribute float aSize;
attribute vec4 aColor;
attribute float aShape;
attribute float aAngle;
attribute vec2 aExtra;
uniform mat4 uViewProj;
uniform float uPixelScale;
uniform vec2 uViewport;
uniform float uTime;
varying vec4 vColor;
varying float vShape;
varying vec3 vTurn;
varying vec2 vCoord;
varying float vSeed;
varying vec3 vFx;
void main() {
vec4 clip = uViewProj * vec4(aPos, 1.0);
float stretch = max(1.0, aExtra.x);
float pixels = max(1.0, aSize * uPixelScale / clip.w);
clip.xy += aCorner * pixels * stretch / uViewport * clip.w;
gl_Position = clip;
vColor = aColor;
vShape = aShape;
vTurn = vec3(cos(aAngle), sin(aAngle), abs(cos(aAngle * 1.7 + 0.6)));
vCoord = vec2(aCorner.x, -aCorner.y);
vSeed = mod(floor(uTime * 14.0) + floor(fract(aAngle * 0.159155) * 211.0), 211.0);
vFx = vec3(stretch, aExtra.y, 2.0 / pixels);
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
varying vec3 vFx;
uniform float uAdditive;
uniform sampler2D uAtlas;
float hash1(HASHP float n) {
HASHP float v = sin(n * 12.9898 + 4.1414) * 43758.5453;
return fract(v);
}
// Distance to a jagged line along x from x0 to x1: eight segments whose inner
// joints move up to amp to either side; the ends stay on the axis.
float zigzag(vec2 p, float x0, float x1, float amp, float seed) {
float outside = max(x0 - p.x, p.x - x1);
if(outside > 0.0) return length(vec2(outside, p.y));
float t = (p.x - x0) / (x1 - x0) * 8.0;
float i = min(floor(t), 7.0);
float y0 = i < 0.5 ? 0.0 : (hash1(i + seed * 7.0) * 2.0 - 1.0) * amp;
float y1 = i > 6.5 ? 0.0 : (hash1(i + 1.0 + seed * 7.0) * 2.0 - 1.0) * amp;
float slope = (y1 - y0) * 8.0 / (x1 - x0);
return abs(p.y - mix(y0, y1, t - i)) / sqrt(1.0 + slope * slope);
}
// x: the thin core of a filament, y: the glow around it.
vec2 filament(float d, float core, float glow) {
return vec2(1.0 - smoothstep(core * 0.45, core, d), exp(-d / glow));
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
vec2 q = vec2(p.x * vTurn.x + p.y * vTurn.y, (p.y * vTurn.x - p.x * vTurn.y) * vFx.x);
float r2 = dot(q, q);
float a = 0.0;
float shade = 1.0;
float hot = 0.0;
if(vShape > 31.5) {
if(max(abs(q.x), abs(q.y)) > 1.0) discard;
// Rounded: the interpolated index may land a hair below the whole number.
float slot = floor(vShape - 31.5);
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
a = min(1.0, core * core + rays + 0.22 * pow(max(0.0, 1.0 - r2), 3.0));
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
// About two pixels of white core whatever the length, inside a soft colored glow.
float core = clamp(vFx.z * 2.0, 0.01, 0.06);
float glow = clamp(vFx.z * 7.0, 0.035, 0.14);
float trunk = zigzag(q, -0.95, 0.95, 0.2, vSeed);
float side = hash1(vSeed + 0.5) < 0.5 ? -1.0 : 1.0;
float at = hash1(vSeed + 2.5) * 0.5 - 0.45;
float fork = zigzag(turn(q - vec2(at, 0.0), 0.55 * side), 0.0, 0.5, 0.1, vSeed + 31.0);
float twig = zigzag(turn(q - vec2(at + 0.45, 0.0), -0.7 * side), 0.0, 0.3, 0.07, vSeed + 57.0);
float taper = 1.0 - smoothstep(0.7, 0.95, abs(q.x));
vec2 stem = filament(trunk, core, glow);
vec2 branch = max(filament(fork, core * 0.7, glow * 0.6), filament(twig, core * 0.6, glow * 0.5)) * 0.75;
vec2 line = max(stem, branch) * taper;
a = max(line.x, line.y * 0.6);
hot = line.x;
} else if(vShape < 7.5) {
float core = clamp(vFx.z * 1.3, 0.008, 0.05);
float glow = clamp(vFx.z * 5.0, 0.03, 0.1);
float d = 10.0;
for(int k = 0; k < 3; k++) {
float fk = float(k);
float angle = vSeed * 0.37 + fk * 2.094 + (hash1(fk + vSeed * 3.0) - 0.5) * 1.2;
float reach = 0.6 + 0.35 * hash1(fk + 11.0 + vSeed * 5.0);
d = min(d, zigzag(turn(q, angle), 0.0, reach, 0.16, vSeed + fk * 13.0));
}
vec2 line = filament(d, core, glow) * (1.0 - smoothstep(0.6, 1.0, sqrt(r2)));
float spot = exp(-r2 * 30.0);
a = max(max(line.x, line.y * 0.55), spot);
hot = max(line.x, spot * 0.7);
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
float angle = mod(atan(q.y, q.x) + 0.5236, 1.0472) - 0.5236;
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
} else if(vShape < 14.5) {
float radius = sqrt(r2);
float rim = max(0.0, 1.0 - abs(radius - 0.82) * 9.0);
float shine = exp(-dot(q - vec2(0.36, -0.36), q - vec2(0.36, -0.36)) * 26.0);
a = max(max(rim * rim, shine), 0.14 * (1.0 - smoothstep(0.78, 0.86, radius)));
hot = shine;
} else if(vShape < 15.5) {
// Two circles overlapping: pointed at both ends, a crease along the middle.
float m = max(length(q - vec2(0.0, 0.62)), length(q + vec2(0.0, 0.62))) - 1.06;
a = 1.0 - smoothstep(-0.05, 0.02, m);
shade = 0.72 + 0.28 * smoothstep(0.0, 0.1, abs(q.y)) - 0.12 * q.x;
} else if(vShape < 16.5) {
float span = min(q.x + 0.9, (0.95 - q.x) / 0.85);
float m = max(q.y - 0.3 * span, -q.y - 0.18 * span);
a = 1.0 - smoothstep(-0.03, 0.02, m);
shade = q.y > 0.0 ? 1.0 : 0.58;
} else if(vShape < 17.5) {
float m = max(sqrt(r2) - 0.85, 0.7 - length(q - vec2(0.36, 0.0)));
a = 1.0 - smoothstep(-0.04, 0.02, m);
} else if(vShape < 18.5) {
vec2 h = q - vec2(0.62, 0.0);
float head = exp(-dot(h, h) * 22.0);
float back = clamp((0.62 - q.x) / 1.6, 0.0, 1.0);
float width = 0.16 * (1.0 - back) + 0.015;
float tail = q.x < 0.62 ? pow(1.0 - back, 1.6) * max(0.0, 1.0 - q.y * q.y / (width * width)) : 0.0;
a = max(head, tail * 0.8);
hot = head * head;
} else if(vShape < 19.5) {
// Round end behind (falling first), tip ahead.
float up = q.x + 0.38;
float m = up < 0.0 ? length(vec2(q.y, up)) - 0.46 : abs(q.y) - 0.46 * pow(clamp(1.0 - up / 1.3, 0.0, 1.0), 1.25);
a = 1.0 - smoothstep(-0.05, 0.02, m);
vec2 g = q - vec2(-0.42, -0.16);
hot = exp(-dot(g, g) * 40.0) * 0.8;
shade = 0.8 + 0.2 * clamp(-m * 4.0, 0.0, 1.0);
}
if(a <= 0.003) discard;
vec4 c = vColor * a;
c.rgb *= shade;
// Heat lights the dense middle of the sprite white.
hot = clamp(max(hot, vFx.y * a * a), 0.0, 1.0);
c.rgb += (vec3(c.a) - c.rgb) * hot;
gl_FragColor = uAdditive > 0.5 ? vec4(c.rgb, 0.0) : c;
}`;var m=4e3,I=12,Q=(d,e)=>d==="max"?e.value===e.sides:d==="min"?e.value===1:d.includes(e.value),Z=[],ee={volume:0,ring:1,shell:2},j=[0,0,0],te={up:0,out:1,sphere:2,back:3},ne={random:0,upright:1,motion:2},ae=1,B=2,ie={soft:0,spark:1,star:2,ring:3,confetti:4,smoke:5,bolt:6,arc:7,flame:8,snowflake:9,heart:10,diamond:11,triangle:12,cross:13,bubble:14,petal:15,shard:16,moon:17,comet:18,drop:19},re=32,se=new Set(["spark","bolt","comet","drop"]),oe=-Math.PI/2,U=class{#n=0;#r=new Float32Array(m);#t=new Float32Array(m);#e=new Float32Array(m);#o=new Float32Array(m);#c=new Float32Array(m);#d=new Float32Array(m);#a=new Float32Array(m);#b=new Float32Array(m);#u=new Float32Array(m);#g=new Float32Array(m);#h=new Float32Array(m);#x=new Float32Array(m);#v=new Float32Array(m);#S=new Float32Array(m);#w=new Float32Array(m);#i=new Float32Array(m*3);#f=new Uint16Array(m);#s=[];#E=new Map;#C=new WeakMap;#R=new Float32Array(m*I);#q=new Float32Array(m*I);#A=new Uint32Array(m);#L=(e,t)=>this.#t[e]-this.#t[t];#P=T("particles");#m=null;#p=1;#O=0;#I=new WeakMap;#k=new WeakMap;#T;constructor(e){this.#T=e}get count(){return this.#n}get auraSeconds(){return this.#l("aura").length?Math.max(0,this.#m.auraSeconds??2.5):0}get linkSeconds(){return this.hasLink?Math.max(0,this.#m.linkSeconds??2):0}get hasLink(){return this.#l("link").length>0}get hasTrail(){return this.#l("trail").length>0||this.#l("ground").length>0}#l(e){return this.#m?O(this.#m,e):Z}configure(e,t,n){this.#m=e,this.#p=Math.max(0,t),this.#P=T(`${n}:particles`),this.#k=new WeakMap,this.#n===0&&this.#s.length>48&&(this.#s.length=0,this.#E.clear())}clear(){this.#n=0}trail(e,t,n,a,s,o){if(a<=0)return;let i=Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);for(let r of this.#l("trail"))this.#y(r,o,e,void 0,i,!0)&&this.#M(e,r,r.amount*this.#p*Math.min(1.5,i/6)*a,t,n,s*.55)}ground(e,t,n,a,s,o){if(a<=0)return;let i=Math.sqrt(n[0]*n[0]+n[2]*n[2]);for(let r of this.#l("ground"))this.#y(r,o,e,void 0,i,!0)&&this.#M(e,r,r.amount*this.#p*(i*a),[t[0],.012,t[2]],n,s*.3,!0)}aura(e,t,n,a,s,o,i=!1){if(!(n<=0||s<=0))for(let r of this.#l("aura"))!i&&!this.#y(r,o,e,void 0,void 0,!0)||this.#M(e,r,r.amount*this.#p*s*n,t,j,a*.6)}link(e,t,n,a,s,o){let i=this.#l("link");if(!i.length||a<=0||s<=0)return;let r=n[0]-t[0],l=n[2]-t[2],c=Math.sqrt(r*r+l*l);if(c<.001||c>Math.max(0,this.#m?.linkDistance??5))return;let u=[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2],b={gap:c,angle:Math.atan2(l,r)};for(let f of i)this.#y(f,o,e,void 0,void 0,!0)&&this.#M(e,f,f.amount*this.#p*s*a,u,j,0,!1,b)}burst(e,t,n,a={}){for(let s of this.#l(e)){if(!a.always&&!this.#y(s,a.subject,a.key,a.force,void 0,!1))continue;let o=Math.round(s.amount*this.#p*Math.max(0,a.strength??1));o>0&&this.#D(this.#j(s),o,t,j,n*(e==="impact"||e==="collision"?.35:.5),!1)}}#y(e,t,n,a,s,o){let i=e.when;if(!i)return!0;if(i.minForce!==void 0&&a!==void 0&&a<i.minForce||i.minSpeed!==void 0&&s!==void 0&&s<i.minSpeed)return!1;if(t&&(i.sides||i.faces!==void 0)){let r="sides"in t?[t]:t,l=i.faces;if(!r.some(c=>(!i.sides||i.sides.includes(c.sides))&&(l===void 0||Q(l,c))))return!1}if(i.chance!==void 0&&i.chance<1){if(o&&n){let r=this.#k.get(n);r||this.#k.set(n,r=new Map);let l=r.get(e);if(l===void 0&&r.set(e,l=this.#P.next()<i.chance),!l)return!1}else if(this.#P.next()>=i.chance)return!1}if(i.cooldown&&n&&!o){let r=this.#I.get(n);r||this.#I.set(n,r=new Map);let l=r.get(e);if(l!==void 0&&this.#O-l<i.cooldown)return!1;r.set(e,this.#O)}return!0}update(e){if(!(e<=0)){this.#O+=e;for(let t=0;t<this.#n;t++){let n=this.#a[t]+e;if(n<0){this.#a[t]=n;continue}if(n>=this.#b[t]){this.#F(this.#n-1,t),this.#n--,t--;continue}this.#a[t]=n;let a=this.#s[this.#f[t]],s=this.#o[t],o=this.#c[t]-a.gravity*e,i=this.#d[t];if(a.drag>0){let l=Math.max(0,1-a.drag*e);s*=l,o*=l,i*=l}if(a.attract!==0){let l=a.attract*e;s+=(this.#v[t]-this.#r[t])*l,o+=(this.#S[t]-this.#t[t])*l,i+=(this.#w[t]-this.#e[t])*l}if(a.turbulence!==0){let l=a.turbulence*e,c=this.#g[t];s+=Math.sin(n*3.1+c)*l,o+=Math.sin(n*2.3+c*1.7)*l*.5,i+=Math.cos(n*2.7+c*2.3)*l}if(a.swirl!==0){let l=a.swirl*e,c=Math.cos(l),u=Math.sin(l),b=s*c-i*u;i=s*u+i*c,s=b}let r=this.#t[t]+o*e;r<.012&&(r=.012,o<0&&(o*=-a.bounce),s*=.7,i*=.7),this.#r[t]=this.#r[t]+s*e,this.#t[t]=r,this.#e[t]=this.#e[t]+i*e,this.#o[t]=s,this.#c[t]=o,this.#d[t]=i,a.orient===B&&s*s+i*i>.0025?this.#h[t]=Math.atan2(i,s):this.#h[t]=this.#h[t]+this.#x[t]*e}}}build(){let e=0,t=0,n=0;for(let a=0;a<this.#n;a++){let s=this.#s[this.#f[a]];s.additive?this.#$(this.#R,e*I,a,s)&&e++:this.#A[n++]=a}n>1&&this.#A.subarray(0,n).sort(this.#L);for(let a=0;a<n;a++){let s=this.#A[a];this.#$(this.#q,t*I,s,this.#s[this.#f[s]])&&t++}return{additive:this.#R,additiveCount:e,alpha:this.#q,alphaCount:t}}#$(e,t,n,a){if(this.#a[n]<0)return!1;let s=this.#a[n]/this.#b[n],o=a.stops,i=o.length/4-1,r=s*i,l=Math.min(i-1,Math.floor(r)),c=i>0?r-l:0,u=Math.max(0,l)*4,b=Math.min(i,l+1)*4,f=o[u+3]+(o[b+3]-o[u+3])*c;if(f*=Math.min(1,s/.06),a.flicker>0&&(f*=1-a.flicker*.5*(1+Math.sin(this.#a[n]*26+this.#g[n]))),f<=.004)return!1;let g,M,h;a.palette.length?(g=this.#i[n*3],M=this.#i[n*3+1],h=this.#i[n*3+2]):(g=o[u]+(o[b]-o[u])*c,M=o[u+1]+(o[b+1]-o[u+1])*c,h=o[u+2]+(o[b+2]-o[u+2])*c),e[t]=this.#r[n],e[t+1]=this.#t[n],e[t+2]=this.#e[n],e[t+3]=this.#u[n]*(1+(a.grow-1)*s),e[t+4]=g*f,e[t+5]=M*f,e[t+6]=h*f,e[t+7]=f,e[t+8]=a.shape,e[t+9]=this.#h[n];let p=this.#o[n],v=this.#d[n];return e[t+10]=a.stretch>0?1+Math.min(7,a.stretch*Math.sqrt(p*p+v*v)):1,e[t+11]=a.heat,!0}#M(e,t,n,a,s,o,i=!1,r){let l=this.#C.get(e);l||this.#C.set(e,l=new Map);let c=(l.get(t)??0)+n,u=Math.floor(c);l.set(t,c-u),u>0&&this.#D(this.#j(t),u,a,s,o,i,r)}#j(e){let t=this.#E.get(e);if(t!==void 0&&(!e.image||this.#s[t].shape===this.#z(e.image)))return t;let n=e.colors.map(i=>k(i)??[1,1,1,1]),a=(e.palette??[]).map(i=>k(i)??[1,1,1,1]),s=e.shape??"soft",o={options:e,stops:Float32Array.from(n.length>1?n.flat():[...n[0],...n[0]]),palette:Float32Array.from(a.flatMap(i=>[i[0],i[1],i[2]])),additive:(e.blend??"add")==="add",direction:te[e.direction??"sphere"]??2,gravity:e.gravity??0,drag:e.drag??0,swirl:e.swirl??0,grow:e.grow??.3,flicker:e.flicker??0,shape:e.image?this.#z(e.image):ie[s]??0,orient:ne[e.orient??(!e.image&&se.has(s)||e.stretch?"motion":"random")]??0,spin:e.spin??0,turbulence:e.turbulence??0,attract:e.attract??0,stretch:e.stretch??0,bounce:e.bounce??.25,heat:e.heat??0,spawn:ee[e.spawn??"volume"]??0,spread:e.spread??1};return this.#s.push(o),this.#E.set(e,this.#s.length-1),this.#s.length-1}#z(e){let t=this.#T?.(e)??-1;return t>=0?re+t:0}#D(e,t,n,a,s,o,i){let r=this.#s[e],l=r.options,c=this.#P,u=Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]),b=r.palette.length/3,f=l.delay,g=r.spawn?Math.max(s,.2)*2.6*r.spread:s*r.spread;for(let M=0;M<t;M++){let h=this.#n;if(h<m?this.#n++:h=Math.floor(c.next()*m),r.spawn&&!i){let y=c.next()*Math.PI*2,A=r.spawn===2?c.next()*2-1:0,z=Math.sqrt(1-A*A);this.#r[h]=n[0]+Math.cos(y)*z*g,this.#t[h]=o?n[1]:Math.max(.012,n[1]+A*g),this.#e[h]=n[2]+Math.sin(y)*z*g}else this.#r[h]=n[0]+(c.next()*2-1)*g,this.#t[h]=o?n[1]:Math.max(.012,n[1]+(c.next()*2-1)*g),this.#e[h]=n[2]+(c.next()*2-1)*g;this.#v[h]=n[0],this.#S[h]=n[1],this.#w[h]=n[2];let p=c.range(l.speed[0],l.speed[1]),v,E,S,w=c.next()*Math.PI*2;if(r.direction===0){let y=p*.45*c.next();v=Math.cos(w)*y,S=Math.sin(w)*y,E=p*(.6+.4*c.next())}else if(r.direction===1)v=Math.cos(w)*p,S=Math.sin(w)*p,E=p*.25*c.next();else if(r.direction===3&&u>.001)v=-a[0]/u*p+Math.cos(w)*p*.35,E=-a[1]/u*p+(c.next()*2-1)*p*.35,S=-a[2]/u*p+Math.sin(w)*p*.35;else{let y=c.next()*2-1,A=Math.sqrt(1-y*y);v=Math.cos(w)*A*p,E=y*p,S=Math.sin(w)*A*p}o&&(E=0),this.#o[h]=v,this.#c[h]=E,this.#d[h]=S,this.#a[h]=f?-c.range(f[0],f[1]):0,this.#b[h]=c.range(l.life[0],l.life[1]),this.#u[h]=c.range(l.size[0],l.size[1]),this.#g[h]=c.next()*Math.PI*2;let W=c.next()*Math.PI*2;if(this.#h[h]=r.orient===ae?oe:r.orient===B&&v*v+S*S>.0025?Math.atan2(S,v):W,this.#x[h]=r.spin*(.5+c.next())*(c.next()<.5?-1:1),i&&(this.#u[h]=this.#u[h]*i.gap,this.#h[h]=i.angle+(c.next()<.5?0:Math.PI)),b){let y=Math.floor(c.next()*b)*3;this.#i[h*3]=r.palette[y],this.#i[h*3+1]=r.palette[y+1],this.#i[h*3+2]=r.palette[y+2]}this.#f[h]=e}}#F(e,t){e!==t&&(this.#r[t]=this.#r[e],this.#t[t]=this.#t[e],this.#e[t]=this.#e[e],this.#o[t]=this.#o[e],this.#c[t]=this.#c[e],this.#d[t]=this.#d[e],this.#a[t]=this.#a[e],this.#b[t]=this.#b[e],this.#u[t]=this.#u[e],this.#g[t]=this.#g[e],this.#h[t]=this.#h[e],this.#x[t]=this.#x[e],this.#v[t]=this.#v[e],this.#S[t]=this.#S[e],this.#w[t]=this.#w[e],this.#i[t*3]=this.#i[e*3],this.#i[t*3+1]=this.#i[e*3+1],this.#i[t*3+2]=this.#i[e*3+2],this.#f[t]=this.#f[e])}};export{re as IMAGE_SHAPE_BASE,G as PARTICLE_ATLAS_SLOTS,m as PARTICLE_CAPACITY,K as PARTICLE_FRAGMENT,I as PARTICLE_STRIDE,J as PARTICLE_VERTEX,$ as ParticleAtlas,U as ParticleSystem,ie as SHAPES,X as customizeEffect};
