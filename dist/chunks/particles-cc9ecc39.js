var V=l=>{let e=2166136261;for(let t=0;t<l.length;t++)e^=l.charCodeAt(t),e=Math.imul(e,16777619);return e>>>0},k=l=>{let e=V(l)||2654435769,t=()=>{e+=1831565813;let n=e;return n=Math.imul(n^n>>>15,n|1),n^=n+Math.imul(n^n>>>7,n|61),((n^n>>>14)>>>0)/4294967296};return{next:t,range:(n,i)=>n+(i-n)*t()}};var ae=Object.freeze(["sparkle","fire","arcane","frost","dust","confetti","electric","smoke","lava","storm","holy","shadow","poison","nature","cosmic","lightning","blizzard","hearts"]),ie=Object.freeze(["soft","spark","star","ring","confetti","smoke","bolt","arc","flame","snowflake","heart","diamond","triangle","cross"]),re=Object.freeze(["random","upright","motion"]),A=Object.freeze(["trail","ground","impact","collision","settle","aura","explode","critical","link"]),M=l=>{if(typeof l!="string"||!/^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(l))return null;let e=l.length===4?l.slice(1).split("").map(n=>n+n).join(""):l.slice(1),t=n=>parseInt(e.slice(n*2,n*2+2),16)/255;return[t(0),t(1),t(2),e.length===8?t(3):1]};var T=(l,e,t)=>.299*l+.587*e+.114*t,C=l=>Math.round(Math.max(0,Math.min(1,l))*255).toString(16).padStart(2,"0"),j=(l,e)=>{let[t,n,i,r]=M(l)??[1,1,1,1],o=T(t,n,i),a=Math.max(.05,T(e[0],e[1],e[2])),s=d=>o<=a?d*o/a:d+(1-d)*(o-a)/Math.max(.001,1-a)*.75;return`#${C(s(e[0]))}${C(s(e[1]))}${C(s(e[2]))}${C(r)}`},z=new WeakMap,G=(l,e)=>{let t=e.size??1,n=e.moments??{};if(!e.color&&!e.shape&&t===1&&!Object.values(n).includes(!1))return l;let i=JSON.stringify([e.color??"",e.shape??"",t,A.map(c=>n[c]!==!1)]),r=z.get(l);r||z.set(l,r=new Map);let o=r.get(i);if(o)return o;let a=e.color?M(e.color):null,s={};l.auraSeconds!==void 0&&(s.auraSeconds=l.auraSeconds),l.linkDistance!==void 0&&(s.linkDistance=l.linkDistance),l.linkSeconds!==void 0&&(s.linkSeconds=l.linkSeconds);for(let c of A){let u=l[c];!u||n[c]===!1||(s[c]={...u,size:[u.size[0]*t,u.size[1]*t],...e.shape?{shape:e.shape}:{},...a?{colors:u.colors.map(p=>j(p,a)),...u.palette?{palette:u.palette.map(p=>j(p,a))}:{}}:{}})}let d=Object.freeze(s);return r.set(i,d),d};var $=(l,e)=>{if(typeof document>"u")return new OffscreenCanvas(l,e);let t=document.createElement("canvas");return t.width=l,t.height=e,t},q=(l,e)=>l.getContext("2d",e),D=l=>"naturalWidth"in l?{width:l.naturalWidth,height:l.naturalHeight}:l;var F=l=>new Promise((e,t)=>{let n=new Image;n.crossOrigin="anonymous",n.decoding="async",n.onload=()=>e(n),n.onerror=()=>t(new Error(`Unable to load image '${l}'.`)),n.src=l});var P=4,g=256,E=g/16,L=P*P,O=class{source;version=0;#t;#o;#a=new Map;#n=new Array(L).fill(null);#l=new Set;#c;constructor(e,t=F){this.source=$(P*g,P*g);let n=q(this.source);if(!n)throw new Error("Unable to create the particle image atlas.");this.#t=n,this.#c=e,this.#o=t}prepare(e){let t=A.map(n=>e?.[n]?.image).filter(n=>!!n);this.#l=new Set(t);for(let n of t)this.slot(n)}slot(e){let t=this.#a.get(e);if(t!==void 0)return t;let n=this.#n.indexOf(null);if(n<0&&(n=this.#n.findIndex(r=>r!==null&&!this.#l.has(r))),n<0)return-1;let i=this.#n[n];return i&&this.#a.delete(i),this.#n[n]=e,this.#a.set(e,n),this.#u(n),this.#o(e).then(r=>{this.#n[n]===e&&this.#r(n,r)}).catch(()=>{this.#n[n]===e&&this.#r(n,null)}),n}#u(e){let t=e%P*g,n=Math.floor(e/P)*g;this.#t.clearRect(t,n,g,g),this.version++}#r(e,t){let n=this.#t,i=e%P*g+E,r=Math.floor(e/P)*g+E,o=g-E*2;n.clearRect(i-E,r-E,g,g);let a=t&&D(t);if(t&&a&&a.width>0&&a.height>0){let s=o/Math.max(a.width,a.height),d=a.width*s,c=a.height*s;n.drawImage(t,i+(o-d)/2,r+(o-c)/2,d,c)}else{let s=n.createRadialGradient(i+o/2,r+o/2,0,i+o/2,r+o/2,o/2);s.addColorStop(0,"rgba(255,255,255,1)"),s.addColorStop(1,"rgba(255,255,255,0)"),n.fillStyle=s,n.fillRect(i,r,o,o)}this.version++,this.#c()}};var B=`attribute vec2 aCorner;
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
}`,U=`precision mediump float;
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
}`;var h=4e3,R=10,W=(l,e)=>l==="max"?e.value===e.sides:l==="min"?e.value===1:l.includes(e.value),Y=[0,0,0],X={up:0,out:1,sphere:2,back:3},J={random:0,upright:1,motion:2},K=1,_=2,Q={soft:0,spark:1,star:2,ring:3,confetti:4,smoke:5,bolt:6,arc:7,flame:8,snowflake:9,heart:10,diamond:11,triangle:12,cross:13},Z=16,ee=new Set(["spark","bolt"]),te=-Math.PI/2,N=class{#t=0;#o=new Float32Array(h);#a=new Float32Array(h);#n=new Float32Array(h);#l=new Float32Array(h);#c=new Float32Array(h);#u=new Float32Array(h);#r=new Float32Array(h);#p=new Float32Array(h);#f=new Float32Array(h);#g=new Float32Array(h);#d=new Float32Array(h);#y=new Float32Array(h);#i=new Float32Array(h*3);#h=new Uint16Array(h);#s=[];#S=new Map;#P=new WeakMap;#z=new WeakMap;#E=new Float32Array(h*R);#C=new Float32Array(h*R);#w=new Uint32Array(h);#$=(e,t)=>this.#a[e]-this.#a[t];#x=k("particles");#e=null;#m=1;#M=0;#R=new WeakMap;#A=new WeakMap;#k;constructor(e){this.#k=e}get count(){return this.#t}get auraSeconds(){return this.#e?.aura?Math.max(0,this.#e.auraSeconds??2.5):0}get linkSeconds(){return this.#e?.link?Math.max(0,this.#e.linkSeconds??2):0}get hasLink(){return!!this.#e?.link}get hasTrail(){return!!(this.#e?.trail||this.#e?.ground)}configure(e,t,n){this.#e=e,this.#m=Math.max(0,t),this.#x=k(`${n}:particles`),this.#A=new WeakMap,this.#t===0&&this.#s.length>48&&(this.#s.length=0,this.#S.clear())}clear(){this.#t=0}trail(e,t,n,i,r,o){let a=this.#e?.trail;if(!a||i<=0)return;let s=Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]);this.#b(a,o,e,void 0,s,!0)&&this.#v(this.#P,e,a,a.amount*this.#m*Math.min(1.5,s/6)*i,t,n,r*.55)}ground(e,t,n,i,r,o){let a=this.#e?.ground;if(!a||i<=0)return;let s=Math.sqrt(n[0]*n[0]+n[2]*n[2]);this.#b(a,o,e,void 0,s,!0)&&this.#v(this.#z,e,a,a.amount*this.#m*(s*i),[t[0],.012,t[2]],n,r*.3,!0)}aura(e,t,n,i,r,o,a=!1){let s=this.#e?.aura;!s||n<=0||r<=0||!a&&!this.#b(s,o,e,void 0,void 0,!0)||this.#v(this.#P,e,s,s.amount*this.#m*r*n,t,[0,0,0],i*.6)}link(e,t,n,i,r,o){let a=this.#e?.link;if(!a||i<=0||r<=0)return;let s=n[0]-t[0],d=n[2]-t[2],c=Math.sqrt(s*s+d*d);if(c<.001||c>Math.max(0,this.#e?.linkDistance??5)||!this.#b(a,o,e,void 0,void 0,!0))return;let u=[(t[0]+n[0])/2,(t[1]+n[1])/2,(t[2]+n[2])/2];this.#v(this.#P,e,a,a.amount*this.#m*r*i,u,Y,0,!1,{gap:c,angle:Math.atan2(d,s)})}burst(e,t,n,i={}){let r=this.#e?.[e];if(!r||!i.always&&!this.#b(r,i.subject,i.key,i.force,void 0,!1))return;let o=Math.round(r.amount*this.#m*Math.max(0,i.strength??1));o>0&&this.#j(this.#I(r),o,t,[0,0,0],n*(e==="impact"||e==="collision"?.35:.5),!1)}#b(e,t,n,i,r,o){let a=e.when;if(!a)return!0;if(a.minForce!==void 0&&i!==void 0&&i<a.minForce||a.minSpeed!==void 0&&r!==void 0&&r<a.minSpeed)return!1;if(t&&(a.sides||a.faces!==void 0)){let s="sides"in t?[t]:t,d=a.faces;if(!s.some(c=>(!a.sides||a.sides.includes(c.sides))&&(d===void 0||W(d,c))))return!1}if(a.chance!==void 0&&a.chance<1){if(o&&n){let s=this.#A.get(n);s||this.#A.set(n,s=new Map);let d=s.get(e);if(d===void 0&&s.set(e,d=this.#x.next()<a.chance),!d)return!1}else if(this.#x.next()>=a.chance)return!1}if(a.cooldown&&n&&!o){let s=this.#R.get(n);s||this.#R.set(n,s=new Map);let d=s.get(e);if(d!==void 0&&this.#M-d<a.cooldown)return!1;s.set(e,this.#M)}return!0}update(e){if(!(e<=0)){this.#M+=e;for(let t=0;t<this.#t;t++){let n=this.#r[t]+e;if(n>=this.#p[t]){this.#q(this.#t-1,t),this.#t--,t--;continue}this.#r[t]=n;let i=this.#s[this.#h[t]],r=this.#l[t],o=this.#c[t]-i.gravity*e,a=this.#u[t];if(i.drag>0){let d=Math.max(0,1-i.drag*e);r*=d,o*=d,a*=d}if(i.swirl!==0){let d=i.swirl*e,c=Math.cos(d),u=Math.sin(d),p=r*c-a*u;a=r*u+a*c,r=p}let s=this.#a[t]+o*e;s<.012&&(s=.012,o<0&&(o*=-.25),r*=.7,a*=.7),this.#o[t]=this.#o[t]+r*e,this.#a[t]=s,this.#n[t]=this.#n[t]+a*e,this.#l[t]=r,this.#c[t]=o,this.#u[t]=a,i.orient===_&&r*r+a*a>.0025?this.#d[t]=Math.atan2(a,r):this.#d[t]=this.#d[t]+this.#y[t]*e}}}build(){let e=0,t=0,n=0;for(let i=0;i<this.#t;i++){let r=this.#s[this.#h[i]];r.additive?this.#O(this.#E,e*R,i,r)&&e++:this.#w[n++]=i}n>1&&this.#w.subarray(0,n).sort(this.#$);for(let i=0;i<n;i++){let r=this.#w[i];this.#O(this.#C,t*R,r,this.#s[this.#h[r]])&&t++}return{additive:this.#E,additiveCount:e,alpha:this.#C,alphaCount:t}}#O(e,t,n,i){let r=this.#r[n]/this.#p[n],o=i.stops,a=o.length/4-1,s=r*a,d=Math.min(a-1,Math.floor(s)),c=a>0?s-d:0,u=Math.max(0,d)*4,p=Math.min(a,d+1)*4,y=o[u+3]+(o[p+3]-o[u+3])*c;if(y*=Math.min(1,r/.06),i.flicker>0&&(y*=1-i.flicker*.5*(1+Math.sin(this.#r[n]*26+this.#g[n]))),y<=.004)return!1;let f,m,b;return i.palette.length?(f=this.#i[n*3],m=this.#i[n*3+1],b=this.#i[n*3+2]):(f=o[u]+(o[p]-o[u])*c,m=o[u+1]+(o[p+1]-o[u+1])*c,b=o[u+2]+(o[p+2]-o[u+2])*c),e[t]=this.#o[n],e[t+1]=this.#a[n],e[t+2]=this.#n[n],e[t+3]=this.#f[n]*(1+(i.grow-1)*r),e[t+4]=f*y,e[t+5]=m*y,e[t+6]=b*y,e[t+7]=y,e[t+8]=i.shape,e[t+9]=this.#d[n],!0}#v(e,t,n,i,r,o,a,s=!1,d){let c=(e.get(t)??0)+i,u=Math.floor(c);e.set(t,c-u),u>0&&this.#j(this.#I(n),u,r,o,a,s,d)}#I(e){let t=this.#S.get(e);if(t!==void 0&&(!e.image||this.#s[t].shape===this.#T(e.image)))return t;let n=e.colors.map(a=>M(a)??[1,1,1,1]),i=(e.palette??[]).map(a=>M(a)??[1,1,1,1]),r=e.shape??"soft",o={options:e,stops:Float32Array.from(n.length>1?n.flat():[...n[0],...n[0]]),palette:Float32Array.from(i.flatMap(a=>[a[0],a[1],a[2]])),additive:(e.blend??"add")==="add",direction:X[e.direction??"sphere"]??2,gravity:e.gravity??0,drag:e.drag??0,swirl:e.swirl??0,grow:e.grow??.3,flicker:e.flicker??0,shape:e.image?this.#T(e.image):Q[r]??0,orient:J[e.orient??(!e.image&&ee.has(r)?"motion":"random")]??0,spin:e.spin??0};return this.#s.push(o),this.#S.set(e,this.#s.length-1),this.#s.length-1}#T(e){let t=this.#k?.(e)??-1;return t>=0?Z+t:0}#j(e,t,n,i,r,o,a){let s=this.#s[e],d=s.options,c=this.#x,u=Math.sqrt(i[0]*i[0]+i[1]*i[1]+i[2]*i[2]),p=s.palette.length/3;for(let y=0;y<t;y++){let f=this.#t;f<h?this.#t++:f=Math.floor(c.next()*h),this.#o[f]=n[0]+(c.next()*2-1)*r,this.#a[f]=o?n[1]:Math.max(.012,n[1]+(c.next()*2-1)*r),this.#n[f]=n[2]+(c.next()*2-1)*r;let m=c.range(d.speed[0],d.speed[1]),b,w,v,S=c.next()*Math.PI*2;if(s.direction===0){let x=m*.45*c.next();b=Math.cos(S)*x,v=Math.sin(S)*x,w=m*(.6+.4*c.next())}else if(s.direction===1)b=Math.cos(S)*m,v=Math.sin(S)*m,w=m*.25*c.next();else if(s.direction===3&&u>.001)b=-i[0]/u*m+Math.cos(S)*m*.35,w=-i[1]/u*m+(c.next()*2-1)*m*.35,v=-i[2]/u*m+Math.sin(S)*m*.35;else{let x=c.next()*2-1,I=Math.sqrt(1-x*x);b=Math.cos(S)*I*m,w=x*m,v=Math.sin(S)*I*m}o&&(w=0),this.#l[f]=b,this.#c[f]=w,this.#u[f]=v,this.#r[f]=0,this.#p[f]=c.range(d.life[0],d.life[1]),this.#f[f]=c.range(d.size[0],d.size[1]),this.#g[f]=c.next()*Math.PI*2;let H=c.next()*Math.PI*2;if(this.#d[f]=s.orient===K?te:s.orient===_&&b*b+v*v>.0025?Math.atan2(v,b):H,this.#y[f]=s.spin*(.5+c.next())*(c.next()<.5?-1:1),a&&(this.#f[f]=this.#f[f]*a.gap,this.#d[f]=a.angle+(c.next()<.5?0:Math.PI)),p){let x=Math.floor(c.next()*p)*3;this.#i[f*3]=s.palette[x],this.#i[f*3+1]=s.palette[x+1],this.#i[f*3+2]=s.palette[x+2]}this.#h[f]=e}}#q(e,t){e!==t&&(this.#o[t]=this.#o[e],this.#a[t]=this.#a[e],this.#n[t]=this.#n[e],this.#l[t]=this.#l[e],this.#c[t]=this.#c[e],this.#u[t]=this.#u[e],this.#r[t]=this.#r[e],this.#p[t]=this.#p[e],this.#f[t]=this.#f[e],this.#g[t]=this.#g[e],this.#d[t]=this.#d[e],this.#y[t]=this.#y[e],this.#i[t*3]=this.#i[e*3],this.#i[t*3+1]=this.#i[e*3+1],this.#i[t*3+2]=this.#i[e*3+2],this.#h[t]=this.#h[e])}};export{Z as IMAGE_SHAPE_BASE,L as PARTICLE_ATLAS_SLOTS,h as PARTICLE_CAPACITY,U as PARTICLE_FRAGMENT,R as PARTICLE_STRIDE,B as PARTICLE_VERTEX,O as ParticleAtlas,N as ParticleSystem,Q as SHAPES,G as customizeEffect};
