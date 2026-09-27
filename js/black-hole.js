/* WebGL2 Schwarzschild null-geodesic renderer with procedural emitting dust.
 * Initial project reference: dgreenheck/webgpu-black-hole (MIT;
 * /lib/black-hole-LICENSE.txt). Camera and material presets are editable locally.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('black-hole');
  if (!canvas) return;
  const Config = window.BlackHoleConfig;
  if (!Config) throw new Error('BlackHoleConfig must load before the renderer');
  const stage = canvas.closest('.black-hole-stage');
  if (!stage) return;
  const hero = stage.closest('.horizon-hero') || stage;
  const header = document.querySelector('.site-header');
  const motionButton = document.getElementById('motion-toggle');
  const viewButton = document.getElementById('view-toggle');
  const viewSurface = document.getElementById('view-surface');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const touch = !finePointer.matches;
  const qualities = [
    { pixels: 850000, steps: 160, fps: 30, dpr: 1.25 },
    { pixels: 1500000, steps: 208, fps: 30, dpr: 1.5 },
    { pixels: 2400000, steps: 256, fps: 30, dpr: 1.75 },
    { pixels: 2400000, steps: 256, fps: 60, dpr: 1.75 }
  ];
  let config = Config.clone(Config.defaults);
  let views = config.views;
  // Eight subpixel positions: image-plane sampling, never random ray-path offsets.
  const jitter = new Float32Array([
    0, -1 / 6, -1 / 4, 1 / 6, 1 / 4, -7 / 18, -3 / 8, -1 / 18,
    1 / 8, 5 / 18, -1 / 8, -5 / 18, 3 / 8, 1 / 18, -7 / 16, 7 / 18
  ]);
  const vertexSource = `#version 300 es
    precision highp float;
    out vec2 vUV;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vUV = p;
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;
  const sceneSource = `#version 300 es
    precision highp float;
    precision highp sampler3D;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler3D uNoise;
    uniform vec2 uResolution, uJitter, uPointer, uOrbit, uBackground;
    uniform vec4 uView, uDisk, uMaterial, uCloudCycle;
    uniform float uRoll, uMobile, uTemperature, uFlow;
    uniform vec3 uCold, uWarm, uHot;
    uniform int uSteps;
    uniform bool uHDR;
    #define RS (uDisk.x)
    #define INNER (uDisk.y)
    #define OUTER (uDisk.z)
    const float PI = 3.141592653589793;
    const float SKY_BASE = 0.0018;
    const vec3 STRAND_FREQUENCY = vec3(5.2,64.0/(2.0*PI),3.2);
    const float SKIN_HEIGHT = 0.65, SKIN_WIDTH = 0.075, SKIN_ROUGHNESS = 0.12;

    float hash(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    vec4 storeLight(vec3 color, float sky) {
      vec4 value = vec4(color, sky);
      return uHDR ? value : value / (1.0 + value);
    }
    vec4 noise(vec3 p, float footprint) {
      float lod = max(0.0, log2(max(1.0, footprint)));
      return textureLod(uNoise, (p + 0.5) / 64.0, lod);
    }
    vec4 materialField(vec3 p, float angle, vec2 footprint, float seed) {
      float radius = length(p.xz);
      vec3 rotated = vec3(cos(angle)*radius, p.y*1.4, sin(angle)*radius);
      vec3 offset = vec3(17.3,29.7,11.9)*seed;
      vec4 warp = noise(rotated*0.24 + 13.0 + offset, footprint.x*0.24);
      vec3 displacement = vec3(warp.r-0.5, warp.g-0.5, (warp.r-warp.g)*0.65);
      vec3 q = rotated*0.42 + displacement*(uMaterial.y*1.65) + offset;
      vec4 broad = noise(q, footprint.x*0.42);
      // One angular revolution is exactly 64 texels: no atan seam. B is
      // prefiltered along this axis, yielding long, irregular orbital strands.
      vec3 bands = vec3(radius*STRAND_FREQUENCY.x+(warp.g-0.5)*uMaterial.y*2.6,
        angle*STRAND_FREQUENCY.y+(warp.r-0.5)*uMaterial.y*1.4,p.y*STRAND_FREQUENCY.z)+offset;
      vec4 ribbons = noise(bands,footprint.y);
      vec4 fine = noise(bands*vec3(1.93,2.0,1.71)+vec3(11.0,33.0,17.0),footprint.y*2.0);
      // R/G retain isotropic detail: the same fetches roughen the cloud skin.
      float cloud = broad.r*0.50+warp.g*0.15+fine.r*0.35;
      cloud = clamp(0.5+(cloud-0.5)*uMaterial.y*1.9,0.0,1.0);
      float fibers = ribbons.b*0.68+fine.b*0.32;
      float surface = (broad.g-0.5)*0.8+(fine.g-0.5)*0.65;
      return vec4(cloud,fibers,surface,fine.a);
    }
    vec4 advectedMaterial(vec3 p, float footprint) {
      float radius = max(length(p.xz),INNER),angle = atan(p.z,p.x);
      float omega = 8.0/(radius*sqrt(radius));
      float shear0 = 1.5*omega*abs(uCloudCycle.x),shear1 = 1.5*omega*abs(uCloudCycle.y);
      float angularGradient = STRAND_FREQUENCY.y/radius;
      float crossGradient2 = dot(STRAND_FREQUENCY.xz,STRAND_FREQUENCY.xz);
      // Filter Cartesian clouds and polar strands in their own coordinates.
      // A single Cartesian shear bound would blur away the orbital detail.
      vec2 footprint0 = footprint*vec2(1.0+shear0,
        sqrt(crossGradient2+angularGradient*angularGradient*(1.0+shear0*shear0)));
      vec2 footprint1 = footprint*vec2(1.0+shear1,
        sqrt(crossGradient2+angularGradient*angularGradient*(1.0+shear1*shear1)));
      return mix(materialField(p,angle-omega*uCloudCycle.y,footprint1,mod(uCloudCycle.w+1.0,8.0)),
        materialField(p,angle-omega*uCloudCycle.x,footprint0,uCloudCycle.w),uCloudCycle.z);
    }
    vec3 thermal(float heat) {
      return mix(mix(uCold,uWarm,smoothstep(0.16,0.64,heat)),uHot,
        smoothstep(0.64,1.02,heat));
    }
    float scaleHeight(float radius) { return (0.24+0.035*radius)*uDisk.w; }
    float volumeStep(float height,float y,float dy) {
      // Reserve fine samples for the two emitting faces, not the entire cloud.
      // Approach their full displacement envelope conservatively from either side.
      float gap=max(abs(abs(y)/height-SKIN_HEIGHT)-SKIN_ROUGHNESS-3.0*SKIN_WIDTH,0.0);
      float spacing=min(0.60,max(0.06,gap*0.65));
      return clamp(height*spacing/max(abs(dy),0.015),0.0015,0.95);
    }
    void accumulateVolume(vec3 p, vec3 localRay, float properLength,
      float footprint, float observerA, inout vec3 light, inout float transmission) {
      float radius = length(p.xz);
      float H = scaleHeight(radius);
      if (radius<=INNER || radius>=OUTER || abs(p.y)>=4.5*H) return;
      vec4 field = advectedMaterial(p,footprint);
      float clump = smoothstep(0.25,0.75,field.x);
      float z = p.y/H + field.z*uMaterial.y*1.6;
      float envelope = exp(-z*z*0.95);
      float corona = exp(-z*z*0.22)*0.12;
      float height0 = p.y/H;
      float continuous = exp(-height0*height0*0.95);
      float strands = clamp(1.0+(field.y-0.45)*uMaterial.z*2.1,0.20,3.6);
      float support = 1.0-smoothstep(3.0,4.5,abs(p.y)/H);
      float edge = smoothstep(INNER,INNER+min(0.55,(OUTER-INNER)*0.2),radius)
        * (1.0-smoothstep(max(INNER,OUTER-3.0),OUTER,radius));
      float medium = edge*support*uMaterial.x;
      // Clouds add to a continuous body; low noise must not excavate the disk.
      float base = 0.42*continuous;
      float cloud = (0.12+clump*clump*2.10)*envelope+(0.15+clump*0.45)*corona;
      // Orbital streaks live on the visible, corrugated photosphere rather
      // than being buried and averaged away inside the opaque midplane.
      float skin=abs(height0)-SKIN_HEIGHT-clamp(field.z*uMaterial.y*0.30,-SKIN_ROUGHNESS,SKIN_ROUGHNESS);
      float core=exp(-skin*skin/(SKIN_WIDTH*SKIN_WIDTH))*(1.10+1.50*strands);
      float density = medium*(base+cloud+core);
      float heat = pow(INNER/radius,0.80);
      float dust = medium*continuous*(1.0-heat)*(0.06+field.w*0.20);
      float r = length(p), A = max(0.0001,1.0-RS/r);
      vec3 orbital = vec3(-p.z,0.0,p.x)/radius;
      float beta = min(0.75,sqrt(RS/(2.0*max(0.001,radius-RS))))*clamp(uFlow,-1.0,1.0);
      float gamma = inversesqrt(1.0-beta*beta);
      // Reverse the backward-marched photon to get emitter -> observer.
      float dopplerDenominator = gamma*(1.0-beta*dot(orbital,-localRay));
      float shift = sqrt(A/observerA)/dopplerDenominator;
      float extinction = density*0.62+dust;
      float opacity = 1.0-exp(-extinction*properLength*dopplerDenominator);
      float emittingGas = base*0.72+cloud*(0.40+clump*1.50)
        +core*(1.05+strands*0.50+field.w*uMaterial.z*0.80);
      vec3 emission = thermal(clamp(heat*shift*uTemperature,0.0,1.1))
        * (0.16+1.8*heat*heat*heat)*shift*shift*shift*uMaterial.w;
      emission *= medium*emittingGas*0.62/max(extinction,0.00001);
      light += transmission*opacity*emission;
      transmission *= 1.0-opacity;
    }
    // Exact non-rotating Schwarzschild spatial null-orbit equation, u = rs/r.
    // J = (u')² + u² - u³ = 1/b²; the numerical solver is fourth-order RK.
    vec2 orbitDerivative(vec2 s) { return vec2(s.y,s.x*(1.5*s.x-1.0)); }
    vec2 advanceOrbit(vec2 s,float h) {
      vec2 a=orbitDerivative(s), b=orbitDerivative(s+a*(0.5*h));
      vec2 c=orbitDerivative(s+b*(0.5*h)), d=orbitDerivative(s+c*h);
      return s+(h/6.0)*(a+2.0*b+2.0*c+d);
    }
    vec2 sampleOrbit(vec2 a,vec2 b,float h,float t) {
      float t2=t*t,t3=t2*t;
      float u=(2.0*t3-3.0*t2+1.0)*a.x+(t3-2.0*t2+t)*h*a.y
        +(-2.0*t3+3.0*t2)*b.x+(t3-t2)*h*b.y;
      float w=((6.0*t2-6.0*t)*a.x+(3.0*t2-4.0*t+1.0)*h*a.y
        +(-6.0*t2+6.0*t)*b.x+(3.0*t2-2.0*t)*h*b.y)/h;
      return vec2(u,w);
    }
    // Outside all matter, with r > 2b and r > 6rs, the remaining angular
    // integral to infinity is smooth. Four-point quadrature avoids empty steps.
    float outgoingTail(float u,float inverseB2) {
      float a=u*0.069431844202974,b=u*0.330009478207572;
      float c=u*0.669990521792428,d=u*0.930568155797026;
      return u*(0.173927422568727*inversesqrt(inverseB2-a*a+a*a*a)
        +0.326072577431273*inversesqrt(inverseB2-b*b+b*b*b)
        +0.326072577431273*inversesqrt(inverseB2-c*c+c*c*c)
        +0.173927422568727*inversesqrt(inverseB2-d*d+d*d*d));
    }
    float meanStarlight() { return 0.000088*uBackground.x*uBackground.y; }
    float starlight(vec3 direction,float footprint) {
      if (uBackground.x<=0.0 || uBackground.y<=0.0) return 0.0;
      float latitude=asin(clamp(direction.y,-1.0,1.0));
      float cosLatitude=max(0.015,cos(latitude));
      vec2 grid=vec2(512.0,256.0);
      vec2 coord=vec2(atan(direction.z,direction.x)/(2.0*PI)+0.5,latitude/PI+0.5)*grid;
      vec2 cell=floor(coord);
      float sum=0.0, angularCell=PI/256.0;
      float pixelVariance=footprint*footprint/12.0;
      for(int y=-1;y<=1;++y) {
        for(int x=-1;x<=1;++x) {
          vec2 raw=cell+vec2(float(x),float(y));
          if(raw.y<0.0 || raw.y>=grid.y) continue;
          vec2 key=vec2(mod(raw.x,grid.x),raw.y);
          float seed=hash(key);
          float probability=min(0.8,uBackground.x*0.04*cosLatitude);
          float present=smoothstep(seed-0.0025,seed+0.0025,probability);
          vec2 offset=0.18+vec2(hash(key+17.1),hash(key+49.3))*0.64;
          vec2 delta=(raw+offset-coord)*angularCell;
          delta.x*=cosLatitude;
          float radius=mix(0.00016,0.00048,hash(key+83.7));
          float variance=radius*radius+pixelVariance;
          float profile=exp(-0.5*dot(delta,delta)/variance)*(radius*radius/variance);
          float flux=mix(0.4,8.0,pow(hash(key+123.4),6.0));
          sum+=present*profile*flux;
        }
      }
      float unresolved=smoothstep(angularCell*0.45,angularCell*1.5,
        footprint/max(0.15,cosLatitude));
      return mix(sum*uBackground.y*0.32,meanStarlight(),unresolved);
    }
    void main() {
      vec2 uv=vUV+uJitter/uResolution;
      float aspect=uResolution.x/uResolution.y;
      vec2 screen=(uv-uView.xy)*vec2(aspect,1.0)*2.0;
      screen=mat2(cos(uRoll),-sin(uRoll),sin(uRoll),cos(uRoll))*screen;
      float lens=uView.z/mix(1.0,aspect,uMobile);
      float elevation=uView.w+uPointer.y*0.010,azimuth=uOrbit.x+uPointer.x*0.016;
      vec3 radial0=vec3(sin(azimuth)*cos(elevation),sin(elevation),cos(azimuth)*cos(elevation));
      vec3 camera=radial0*uOrbit.y;
      vec3 forward=-radial0, right=normalize(cross(forward,vec3(0.0,1.0,0.0)));
      vec3 up=cross(right,forward);
      vec3 initialDirection=normalize(forward+lens*(screen.x*right+screen.y*up));
      float observerA=1.0-RS/uOrbit.y;
      float nr=dot(initialDirection,radial0);
      vec3 tangential=initialDirection-nr*radial0;
      float nt=length(tangential);
      bool radialRay=nt<0.000001;
      vec3 tangent0=radialRay?right:tangential/nt;
      // Local tetrad -> coordinate impact parameter. E is normalized to 1.
      float b=radialRay?1.0:uOrbit.y*nt/(RS*sqrt(observerA));
      float impact=b*RS, inverseB2=1.0/(b*b);
      vec2 state=vec2(RS/uOrbit.y,radialRay?0.0:-nr/b);
      float phi=0.0,radialDistance=uOrbit.y;
      float maxHeight=scaleHeight(OUTER)*4.5;
      float diskBound=sqrt(OUTER*OUTER+maxHeight*maxHeight);
      bool materialPossible=radialRay || diskBound<=1.5*RS
        || impact*impact<=diskBound*diskBound/(1.0-RS/diskBound);
      // With a uniform sky, rays missing all matter need no numerical orbit.
      if(!materialPossible && (uBackground.x<=0.0 || uBackground.y<=0.0)) {
        float sky=SKY_BASE/pow(observerA,1.5);
        fragColor=storeLight(vec3(sky),sky);
        return;
      }
      float escapeU=min(RS/(diskBound+RS),min(1.0/6.0,0.5/b));
      float transmission=1.0;
      vec3 light=vec3(0.0),escapedDirection=initialDirection;
      bool escaped=false,captured=false;
      float angularPixel=2.0*lens/uResolution.y;
      float stepScale=224.0/float(uSteps);
      // Quality controls spacing, never a shorter physical ray. Share a reserve
      // for grazing, very thin disks and near-critical photon orbits.
      for(int i=0;i<768;++i) {
        if(transmission<0.0001) break;
        if(radialRay) {
          // L=0 is singular only in phi coordinates, not in the physical ray.
          // March its exact straight radial path, including foreground gas.
          float r=radialDistance;
          if(r<=RS*1.000002) { captured=true; break; }
          if(nr>0.0 && r>diskBound+RS) { escaped=true;escapedDirection=radial0;break; }
          vec3 p=radial0*r;
          float radius=length(p.xz),H=scaleHeight(min(radius,OUTER));
          float gap=max(abs(p.y)-4.5*H,max(INNER-radius,radius-OUTER));
          float lengthTarget=gap<H?volumeStep(H,p.y,radial0.y)
            :min(r*0.32,max(0.12,gap*0.65));
          float dr=lengthTarget*sqrt(max(0.000001,1.0-RS/r))*stepScale;
          float nextR=nr<0.0?max(RS*1.000001,r-dr):r+dr;
          for(int j=0;j<2;++j) {
            float t=j==0?0.211324865405187:0.788675134594813;
            float sampleR=mix(r,nextR,t);
            vec3 samplePoint=radial0*sampleR;
            float dl=abs(nextR-r)*0.5/sqrt(max(0.000001,1.0-RS/sampleR));
            float footprint=max(angularPixel*abs(sampleR-uOrbit.y),dl*1.2);
            accumulateVolume(samplePoint,radial0*sign(nr),dl,footprint,observerA,light,transmission);
          }
          radialDistance=nextR;
          continue;
        }
        if(state.x>=1.0) { captured=true;break; }
        if(state.y<0.0 && state.x<escapeU) {
          float angle=phi+outgoingTail(state.x,inverseB2);
          escapedDirection=radial0*cos(angle)+tangent0*sin(angle);
          escaped=true;break;
        }
        float r=RS/max(state.x,0.000001);
        float sine=sin(phi),cosine=cos(phi);
        vec3 radial=radial0*cosine+tangent0*sine;
        vec3 tangent=tangent0*cosine-radial0*sine;
        vec3 p=radial*r;
        float radius=length(p.xz),H=scaleHeight(min(radius,OUTER));
        float A=max(0.0001,1.0-state.x);
        vec3 localDirection=normalize((-b*state.y)*radial+(b*state.x*sqrt(A))*tangent);
        float gap=max(abs(p.y)-4.5*H,max(INNER-radius,radius-OUTER));
        float travelStep=r*0.32;
        if(materialPossible) travelStep=gap<H
          ?volumeStep(H,p.y,localDirection.y)
          :min(travelStep,max(0.12,gap*0.65));
        float h=min(0.068*stepScale,travelStep*b*sqrt(A)*state.x*state.x/RS*stepScale);
        if(state.y<0.0) h=min(h,state.x*0.30/max(0.00001,-state.y));
        h=max(h,0.0000000001);
        vec2 next=advanceOrbit(state,h);
        if(materialPossible) {
          for(int j=0;j<2;++j) {
            float t=j==0?0.211324865405187:0.788675134594813;
            vec2 q=sampleOrbit(state,next,h,t);
            if(q.x<=0.0 || q.x>=0.9999) continue;
            float angle=phi+h*t;
            vec3 er=radial0*cos(angle)+tangent0*sin(angle);
            vec3 et=tangent0*cos(angle)-radial0*sin(angle);
            float sampleR=RS/q.x;
            vec3 samplePoint=er*sampleR;
            float cylindricalR=length(samplePoint.xz),height=scaleHeight(cylindricalR);
            if(cylindricalR<=INNER || cylindricalR>=OUTER || abs(samplePoint.y)>=4.5*height) continue;
            float sampleA=1.0-q.x;
            // Proper static-frame path length; each Gauss node gets half.
            float dl=h*0.5*sampleR*sampleR/(impact*sqrt(sampleA));
            float spread=1.0+min(24.0,abs(phi)*RS/max(RS*0.25,abs(impact-2.598076211353316*RS)*6.0));
            float footprint=max(angularPixel*length(samplePoint-camera)*spread,dl*1.2);
            vec3 localRay=normalize((-b*q.y)*er+(b*q.x*sqrt(sampleA))*et);
            accumulateVolume(samplePoint,localRay,dl,footprint,observerA,light,transmission);
          }
        }
        state=next;phi+=h;
      }
      // A budget-limited ray is unresolved, never silently declared escaped.
      // Only a proven outward escape is permitted to sample the celestial sky.
      float stars=0.0;
      if(uBackground.x>0.0 && uBackground.y>0.0) {
        float footprint=max(angularPixel,max(length(dFdx(escapedDirection)),length(dFdy(escapedDirection))));
        if(escaped) stars=starlight(escapedDirection,footprint);
      }
      float sky=escaped?(SKY_BASE+stars)/pow(observerA,1.5):0.0;
      sky*=transmission;
      light+=vec3(sky);
      fragColor=storeLight(light,sky);
    }`;
  const resolveSource = `#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler2D uScene,uHistory;
    uniform vec2 uResolution;
    uniform float uWeight;
    uniform bool uHDR;
    vec4 decode(vec4 c) { return uHDR?c:c/max(vec4(0.001),1.0-c); }
    vec4 encode(vec4 c) { return uHDR?c:c/(1.0+c); }
    void main() {
      vec2 pixel=1.0/uResolution;
      vec4 center=decode(texture(uScene,vUV)),lo=center,hi=center;
      vec4 c=decode(texture(uScene,vUV+vec2(pixel.x,0.0)));lo=min(lo,c);hi=max(hi,c);
      c=decode(texture(uScene,vUV-vec2(pixel.x,0.0)));lo=min(lo,c);hi=max(hi,c);
      c=decode(texture(uScene,vUV+vec2(0.0,pixel.y)));lo=min(lo,c);hi=max(hi,c);
      c=decode(texture(uScene,vUV-vec2(0.0,pixel.y)));lo=min(lo,c);hi=max(hi,c);
      vec4 history=clamp(decode(texture(uHistory,vUV)),max(vec4(0.0),lo-0.015),hi+0.015);
      fragColor=encode(mix(center,history,uWeight));
    }`;
  const compositeSource = `#version 300 es
    precision highp float;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler2D uImage;
    uniform vec2 uResolution;
    uniform bool uHDR;
    uniform float uExposure,uBloom,uClearance,uMobile;
    vec4 decode(vec4 c) { return uHDR?c:c/max(vec4(0.001),1.0-c); }
    vec4 bright(vec2 uv) {
      vec4 c=decode(texture(uImage,uv));
      float peak=max(c.r,max(c.g,c.b));
      return vec4(c.rgb*smoothstep(0.9,2.6,peak),c.a*smoothstep(0.9,2.6,c.a));
    }
    vec3 toneMap(vec3 x) {
      return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);
    }
    void main() {
      vec4 image=decode(texture(uImage,vUV));
      vec2 pixel=1.0/uResolution;
      vec4 glow=vec4(0.0);
      for(int i=0;i<8;++i) {
        float angle=float(i)*0.785398;
        vec2 axis=vec2(cos(angle),sin(angle))*pixel;
        glow+=bright(vUV+axis*3.0)*0.019;
        glow+=bright(vUV+axis*10.0)*0.009;
        glow+=bright(vUV+axis*22.0)*0.004;
      }
      image+=glow*uBloom;
      vec3 displayColor=pow(toneMap(image.rgb*uExposure),vec3(1.0/2.2));
      vec3 sky=pow(toneMap(vec3(image.a)*uExposure),vec3(1.0/2.2));
      float clearText=uMobile<0.5?smoothstep(0.34,0.47,vUV.x):1.0-smoothstep(0.51,0.66,vUV.y);
      fragColor=vec4(mix(sky,displayColor,mix(1.0,clearText,uClearance)),1.0);
    }`;

  let gl;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'
    });
  } catch (_) { return; }
  if (!gl) return;

  function makeNoiseVolume() {
    const count = 64 * 64 * 64;
    let source = new Uint8Array(count * 4), scratch = new Uint8Array(count * 4);
    let seed = 173;
    for (let i = 0; i < source.length; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      source[i] = seed & 255;
    }
    // Separable periodic [1,2,1] filter. This is one-time preparation, not
    // per-frame work; it removes voxel corners before domain warping.
    for (const stride of [1, 64, 4096]) {
      for (let i = 0; i < count; i += 1) {
        const coordinate = Math.floor(i / stride) & 63;
        const previous = (i + (((coordinate + 63) & 63) - coordinate) * stride) * 4;
        const next = (i + (((coordinate + 1) & 63) - coordinate) * stride) * 4;
        const current = i * 4;
        for (let c = 0; c < 4; c += 1) {
          scratch[current + c] = (source[previous + c] + 2 * source[current + c] + source[next + c] + 2) >> 2;
        }
      }
      const swap = source; source = scratch; scratch = swap;
    }
    // Stretch B along the future angular axis before baking its ridges.
    // Eight (even) passes return to the original buffer, preserving R/G/A
    // without copying those channels or allocating another texture.
    for (let pass = 0; pass < 8; pass += 1) {
      for (let i = 0; i < count; i += 1) {
        const y = (i >> 6) & 63, current = i * 4 + 2;
        const previous = (i + (((y + 63) & 63) - y) * 64) * 4 + 2;
        const next = (i + (((y + 1) & 63) - y) * 64) * 4 + 2;
        scratch[current] = (source[previous] + 2 * source[current] + source[next] + 2) >> 2;
      }
      const swap = source; source = scratch; scratch = swap;
    }
    for (let i = 0; i < source.length; i += 4) {
      const r = Math.max(0, Math.min(1, 0.5 + (source[i] - 128) * 3.2 / 255));
      const g = Math.max(0, Math.min(1, 0.5 + (source[i + 1] - 128) * 3.2 / 255));
      const ridgeSource = Math.max(0, Math.min(1, 0.5 + (source[i + 2] - 128) * 3.2 / 255));
      const dustSource = Math.max(0, Math.min(1, 0.5 + (source[i + 3] - 128) * 3.0 / 255));
      const ridge = Math.pow(1 - Math.abs(2 * ridgeSource - 1), 4);
      const t = Math.max(0, Math.min(1, (dustSource - 0.60) / 0.25));
      const dust = t * t * (3 - 2 * t);
      source[i] = Math.round(r * 255);
      source[i + 1] = Math.round(g * 255);
      source[i + 2] = Math.round(ridge * 255);
      source[i + 3] = Math.round(dust * dust * 255);
    }
    return source;
  }
  const noiseBytes = makeNoiseVolume();
  const textures = [], framebuffers = [], programs = [];
  const queryPending = new Uint8Array(4);
  const queries = [];
  // Camera 0..6, disk 7..16, appearance 17..19, RGB 20..28, clearance 29, sky 30..31.
  const pose = new Float32Array(32), targetPose = new Float32Array(32);
  const cameraLag = new Float64Array(7);
  let sceneProgram, resolveProgram, compositeProgram, sceneUniforms, resolveUniforms, compositeUniforms;
  let noiseTexture, vertexArray, timerExtension, hdr = false, maxTextureSize = 0;
  let ready = false, lost = false, failed = false, visible = false, pageActive = true;
  let initialized = false, poseInitialized = false, sizeDirty = true;
  let windowActive = true, visibilityRatio = 0, suspended = true;
  let userPlaying = null, frame = 0, lastTick = 0, lastPaint = 0, elapsed = 0;
  let width = 0, height = 0, cssWidth = 0, cssHeight = 0, stageLeft = 0, stageTop = 0;
  let displayWidth = 0, displayHeight = 0;
  let mobile = false, pointerX = 0, pointerY = 0, targetX = 0, targetY = 0;
  let quality = touch ? 1 : 3, qualityCeiling = touch ? 2 : 3;
  let costAverage = 0, cadenceAverage = 0, sampledFrames = 0, sampleStart = 0, lastQualityChange = 0;
  let viewIndex = 0, transitioning = false;
  let historyRead = 1, historyCount = 0, sampleIndex = 0, settleFrames = 8, queryCursor = 0;
  let pointerDownX = 0, pointerDownY = 0, dragged = false;
  let parallaxEnabled = true;

  function wantsMotion() {
    return userPlaying === null ? !motionPreference.matches && !(connection && connection.saveData) : userPlaying;
  }
  // A visible navigation may leave keyboard focus in the address bar. It must
  // still autoplay; actual window blur/focus events control window suspension.
  function active() { return visible && windowActive && pageActive && !document.hidden; }
  function available() { return initialized && !lost && !failed && active(); }
  function needsFrame() { return available() && (wantsMotion() || transitioning || settleFrames > 0 || sizeDirty); }
  function fillTarget() {
    const view = views[viewIndex], camera = view.camera[mobile ? 'mobile' : 'desktop'];
    const radians = Math.PI / 180;
    targetPose[0] = camera.x; targetPose[1] = 1 - camera.y;
    targetPose[2] = Math.tan(camera.fov * radians * 0.5);
    targetPose[3] = camera.elevation * radians; targetPose[4] = camera.roll * radians;
    targetPose[5] = camera.azimuth * radians; targetPose[6] = camera.distance;
    const disk = view.disk;
    targetPose[7] = disk.horizon; targetPose[8] = disk.inner; targetPose[9] = disk.outer;
    targetPose[10] = disk.thickness; targetPose[11] = disk.density; targetPose[12] = disk.turbulence;
    targetPose[13] = disk.detail; targetPose[14] = disk.speed; targetPose[15] = disk.phase; targetPose[16] = disk.emission;
    targetPose[17] = view.appearance.exposure; targetPose[18] = view.appearance.bloom; targetPose[19] = view.appearance.temperature;
    targetPose[29] = view.appearance.clearance;
    targetPose[30] = view.background.density; targetPose[31] = view.background.brightness;
    let offset = 20;
    for (const key of ['cold', 'warm', 'hot']) {
      const value = Number.parseInt(view.colors[key].slice(1), 16);
      for (let shift = 16; shift >= 0; shift -= 8) {
        const channel = ((value >> shift) & 255) / 255;
        targetPose[offset++] = channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
      }
    }
  }
  function resetHistory() { historyCount = 0; sampleIndex = 0; settleFrames = 8; }
  function finishCamera() {
    const turn = Math.PI * 2;
    for (const i of [4, 5]) targetPose[i] = ((targetPose[i] + Math.PI) % turn + turn) % turn - Math.PI;
    for (let i = 0; i < 7; i += 1) pose[i] = cameraLag[i] = targetPose[i];
    transitioning = false; poseInitialized = true;
    stage.dataset.transitioning = 'false';
  }
  function updateControls() {
    const disabled = !ready || lost || failed;
    if (motionButton) {
      motionButton.hidden = disabled;
      motionButton.textContent = wantsMotion() ? '暂停动画' : '播放动画';
      motionButton.setAttribute('aria-label', wantsMotion() ? '暂停黑洞动画' : '播放黑洞动画');
      motionButton.setAttribute('aria-pressed', String(!wantsMotion()));
    }
    const label = views[viewIndex].label;
    const next = views[(viewIndex + 1) % views.length].label;
    const skip = views[(viewIndex + 2) % views.length].label;
    const description = views.length > 2 ?
      `切换黑洞视角：当前${label}，80% 切换${next}，20% 切换${skip}` :
      `切换黑洞视角：当前${label}，下一视角${next}`;
    if (viewButton) {
      viewButton.hidden = disabled || views.length < 2;
      viewButton.textContent = `${label} · ${viewIndex + 1}/${views.length} ↻`;
      viewButton.setAttribute('aria-label', description);
    }
    if (viewSurface) {
      viewSurface.hidden = disabled || views.length < 2;
      viewSurface.setAttribute('aria-label', description);
    }
    stage.dataset.view = views[viewIndex].id;
  }
  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTick = 0; lastPaint = 0;
    sampleStart = 0; sampledFrames = 0; costAverage = cadenceAverage = 0;
  }
  function sync() {
    const nextSuspended = !active(), changed = nextSuspended !== suspended;
    suspended = nextSuspended;
    if (changed && !suspended && (wantsMotion() || transitioning)) resetHistory();
    updateControls();
    if (!needsFrame()) stop();
    else if (!frame) frame = requestAnimationFrame(tick);
    if (changed) notify();
  }
  function fail() {
    failed = true; ready = initialized = false;
    stop();
    stage.classList.remove('is-rendered');
    delete stage.dataset.renderer;
    updateControls();
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader unavailable');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(error || 'Black hole shader compilation failed');
    }
    return shader;
  }
  function makeProgram(source) {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    let fragment, result;
    try {
      fragment = compile(gl.FRAGMENT_SHADER, source);
      result = gl.createProgram();
      if (!result) throw new Error('Program unavailable');
      gl.attachShader(result, vertex); gl.attachShader(result, fragment); gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      programs.push(result);
      return result;
    } catch (error) {
      if (result) gl.deleteProgram(result);
      throw error;
    } finally {
      gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }
  function release() {
    if (lost) return;
    for (const p of programs) gl.deleteProgram(p);
    for (const t of textures) gl.deleteTexture(t);
    for (const f of framebuffers) gl.deleteFramebuffer(f);
    for (const q of queries) if (q) gl.deleteQuery(q);
    if (noiseTexture) gl.deleteTexture(noiseTexture);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
  }
  function initialize() {
    try {
      failed = false;
      programs.length = textures.length = framebuffers.length = queries.length = 0;
      hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
      maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      sceneProgram = makeProgram(sceneSource);
      resolveProgram = makeProgram(resolveSource);
      compositeProgram = makeProgram(compositeSource);
      sceneUniforms = {
        resolution: gl.getUniformLocation(sceneProgram, 'uResolution'), jitter: gl.getUniformLocation(sceneProgram, 'uJitter'),
        pointer: gl.getUniformLocation(sceneProgram, 'uPointer'), view: gl.getUniformLocation(sceneProgram, 'uView'),
        roll: gl.getUniformLocation(sceneProgram, 'uRoll'), cycle: gl.getUniformLocation(sceneProgram, 'uCloudCycle'),
        mobile: gl.getUniformLocation(sceneProgram, 'uMobile'), steps: gl.getUniformLocation(sceneProgram, 'uSteps'),
        orbit: gl.getUniformLocation(sceneProgram, 'uOrbit'), disk: gl.getUniformLocation(sceneProgram, 'uDisk'),
        material: gl.getUniformLocation(sceneProgram, 'uMaterial'), temperature: gl.getUniformLocation(sceneProgram, 'uTemperature'),
        background: gl.getUniformLocation(sceneProgram, 'uBackground'), flow: gl.getUniformLocation(sceneProgram, 'uFlow'),
        cold: gl.getUniformLocation(sceneProgram, 'uCold'), warm: gl.getUniformLocation(sceneProgram, 'uWarm'), hot: gl.getUniformLocation(sceneProgram, 'uHot')
      };
      resolveUniforms = { resolution: gl.getUniformLocation(resolveProgram, 'uResolution'), weight: gl.getUniformLocation(resolveProgram, 'uWeight') };
      compositeUniforms = {
        resolution: gl.getUniformLocation(compositeProgram, 'uResolution'),
        exposure: gl.getUniformLocation(compositeProgram, 'uExposure'), bloom: gl.getUniformLocation(compositeProgram, 'uBloom'),
        clearance: gl.getUniformLocation(compositeProgram, 'uClearance'), mobile: gl.getUniformLocation(compositeProgram, 'uMobile')
      };
      vertexArray = gl.createVertexArray(); gl.bindVertexArray(vertexArray);
      noiseTexture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 64, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseBytes);
      gl.generateMipmap(gl.TEXTURE_3D);
      for (let i = 0; i < 3; i += 1) {
        const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
        if (!texture || !framebuffer) throw new Error('Render target unavailable');
        textures.push(texture); framebuffers.push(framebuffer);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      }
      gl.useProgram(sceneProgram); gl.uniform1i(gl.getUniformLocation(sceneProgram, 'uNoise'), 0);
      gl.useProgram(resolveProgram);
      gl.uniform1i(gl.getUniformLocation(resolveProgram, 'uScene'), 1);
      gl.uniform1i(gl.getUniformLocation(resolveProgram, 'uHistory'), 2);
      gl.useProgram(compositeProgram); gl.uniform1i(gl.getUniformLocation(compositeProgram, 'uImage'), 1);
      for (const p of programs) {
        gl.useProgram(p); gl.uniform1i(gl.getUniformLocation(p, 'uHDR'), hdr ? 1 : 0);
      }
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      queryPending.fill(0); queryCursor = 0;
      if (timerExtension) {
        for (let i = 0; i < 4; i += 1) queries.push(gl.createQuery());
        if (queries.some(q => !q)) timerExtension = null;
      }
      width = height = 0; historyRead = 1; sizeDirty = true; resetHistory();
      initialized = true;
      resize();
    } catch (error) {
      console.warn('Black-hole GPU renderer unavailable:', error.message);
      release(); fail();
    }
  }
  function measure() {
    const rect = stage.getBoundingClientRect();
    cssWidth = stage.clientWidth || rect.width; cssHeight = stage.clientHeight || rect.height;
    displayWidth = rect.width; displayHeight = rect.height; stageLeft = rect.left; stageTop = rect.top;
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft : 0, top = viewport ? viewport.offsetTop : 0;
    const right = left + (viewport ? viewport.width : innerWidth);
    const bottom = top + (viewport ? viewport.height : innerHeight);
    const x0 = Math.max(rect.left, left), x1 = Math.min(rect.right, right);
    const y0 = Math.max(rect.top, top), y1 = Math.min(rect.bottom, bottom);
    let area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    if (header && area > 0) {
      const cover = header.getBoundingClientRect();
      area -= Math.max(0, Math.min(x1, cover.right) - Math.max(x0, cover.left))
        * Math.max(0, Math.min(y1, cover.bottom) - Math.max(y0, cover.top));
    }
    visibilityRatio = rect.width > 0 && rect.height > 0 ?
      Math.max(0, Math.min(1, area / (rect.width * rect.height))) : 0;
    visible = visibilityRatio >= 0.05;
  }
  function allocate() {
    const tier = qualities[quality];
    const scale = Math.min(devicePixelRatio || 1, tier.dpr,
      Math.sqrt(tier.pixels / (cssWidth * cssHeight)), maxTextureSize / cssWidth, maxTextureSize / cssHeight);
    const nextWidth = Math.max(1, Math.round(cssWidth * scale)), nextHeight = Math.max(1, Math.round(cssHeight * scale));
    if (width === nextWidth && height === nextHeight) return false;
    width = nextWidth; height = nextHeight; canvas.width = width; canvas.height = height;
    for (let i = 0; i < 3; i += 1) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[i]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer unavailable');
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    canvas.dataset.quality = String(quality);
    canvas.dataset.precision = hdr ? 'float16' : 'encoded8';
    resetHistory();
    return true;
  }
  function draw(cameraMoving) {
    gl.bindVertexArray(vertexArray); gl.viewport(0, 0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[0]); gl.useProgram(sceneProgram);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
    gl.uniform2f(sceneUniforms.resolution, width, height);
    gl.uniform2f(sceneUniforms.jitter, jitter[sampleIndex * 2], jitter[sampleIndex * 2 + 1]);
    gl.uniform2f(sceneUniforms.pointer, pointerX, pointerY);
    gl.uniform4f(sceneUniforms.view, pose[0], pose[1], pose[2], pose[3]);
    gl.uniform1f(sceneUniforms.roll, pose[4]);
    // Shared advection phases are uniform over the image. Compute once here,
    // not once per voxel: eight overlapping turbulent states, a 20 s loop.
    const cloudPhase = (((elapsed + pose[15]) % 20 + 20) % 20) / 2.5;
    const cloudSeed = Math.floor(cloudPhase), cloudAge = (cloudPhase - cloudSeed) * 2.5;
    gl.uniform4f(sceneUniforms.cycle, cloudAge, cloudAge - 2.5, 0.5 + 0.5 * Math.cos(cloudAge * Math.PI / 2.5), cloudSeed);
    gl.uniform2f(sceneUniforms.orbit, pose[5], pose[6]);
    gl.uniform4f(sceneUniforms.disk, pose[7], pose[8], pose[9], pose[10]);
    gl.uniform4f(sceneUniforms.material, pose[11], pose[12], pose[13], pose[16]);
    gl.uniform1f(sceneUniforms.temperature, pose[19]);
    gl.uniform2f(sceneUniforms.background, pose[30], pose[31]); gl.uniform1f(sceneUniforms.flow, pose[14]);
    gl.uniform3f(sceneUniforms.cold, pose[20], pose[21], pose[22]);
    gl.uniform3f(sceneUniforms.warm, pose[23], pose[24], pose[25]);
    gl.uniform3f(sceneUniforms.hot, pose[26], pose[27], pose[28]);
    gl.uniform1f(sceneUniforms.mobile, mobile ? 1 : 0); gl.uniform1i(sceneUniforms.steps, qualities[quality].steps);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const writeIndex = historyRead === 1 ? 2 : 1;
    let weight = historyCount ? (wantsMotion() ? 0.62 : Math.min(0.875, historyCount / (historyCount + 1))) : 0;
    if (cameraMoving) { weight = 0; historyCount = 0; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[writeIndex]); gl.useProgram(resolveProgram);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[0]);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, textures[historyRead]);
    gl.uniform2f(resolveUniforms.resolution, width, height); gl.uniform1f(resolveUniforms.weight, weight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    historyRead = writeIndex; historyCount = Math.min(8, historyCount + 1); sampleIndex = (sampleIndex + 1) & 7;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(compositeProgram);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, textures[historyRead]);
    gl.uniform2f(compositeUniforms.resolution, width, height);
    gl.uniform1f(compositeUniforms.exposure, pose[17]); gl.uniform1f(compositeUniforms.bloom, pose[18]);
    gl.uniform1f(compositeUniforms.clearance, pose[29]); gl.uniform1f(compositeUniforms.mobile, mobile ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!cameraMoving && settleFrames > 0) settleFrames -= 1;
  }
  function resize() {
    if (lost || failed) return;
    const previousMobile = mobile;
    measure();
    if (!cssWidth || !cssHeight) { sync(); return; }
    mobile = cssWidth <= 640;
    if (!poseInitialized || mobile !== previousMobile) {
      const time = poseInitialized ? getState().time : null;
      fillTarget();
      for (let i = 7; i < pose.length; i += 1) pose[i] = targetPose[i];
      finishCamera();
      elapsed = time === null ? 0 : time - pose[15];
      resetHistory();
    }
    // A hidden/unfocused resize must not upload targets or draw even one frame.
    // Allocation and the first paint happen only inside the active RAF path.
    sizeDirty = true;
    sync();
  }
  function adapt(time, cadence, gpuCost) {
    if (config.quality !== 'auto') return;
    if (gpuCost > 0) costAverage = costAverage ? costAverage + (gpuCost - costAverage) * 0.08 : gpuCost;
    if (cadence > 0) cadenceAverage = cadenceAverage ? cadenceAverage + (cadence - cadenceAverage) * 0.08 : cadence;
    sampledFrames += 1;
    if (!sampleStart) sampleStart = time;
    if (time - sampleStart < 1500 || sampledFrames < 8 || time - lastQualityChange < 1800) return;
    const tier = qualities[quality];
    const slow = costAverage > (tier.fps === 60 ? 16 : 30) || cadenceAverage > (tier.fps === 60 ? 25 : 48);
    let next = quality;
    if (quality > 0 && slow) {
      next -= 1; qualityCeiling = Math.min(qualityCeiling, next);
    } else if (quality < qualityCeiling && time - lastQualityChange > 15000 && costAverage > 0
      && costAverage < 8 && cadenceAverage < 40) {
      next += 1;
    }
    if (next !== quality) {
      quality = next; lastQualityChange = time; costAverage = cadenceAverage = 0;
      canvas.dataset.quality = String(quality); sizeDirty = true; resetHistory();
    }
    sampleStart = time; sampledFrames = 0;
  }
  function updateCamera(delta) {
    let changing = false;
    if (transitioning) {
      // Two cascaded exponential filters give exact critical damping. Keeping
      // the intermediate state preserves velocity on retarget and bounds FOV
      // and distance even if the response duration changes.
      const omega = 12000 / Math.max(1, config.transitionMs);
      const step = omega * delta, decay = Math.exp(-step);
      let settled = true;
      for (let i = 0; i < 7; i += 1) {
        const offset = pose[i] - targetPose[i];
        const lag = cameraLag[i] - targetPose[i];
        pose[i] = targetPose[i] + (offset + step * lag) * decay;
        cameraLag[i] = targetPose[i] + lag * decay;
        const scale = Math.max(1, Math.abs(targetPose[i]));
        if (Math.abs(pose[i] - targetPose[i]) > 0.00001 * scale
          || Math.abs(omega * (cameraLag[i] - pose[i])) > 0.0001 * scale) settled = false;
      }
      changing = true;
      if (settled) {
        finishCamera(); resetHistory(); notify();
      }
    }
    const damping = 1.0 - Math.exp(-delta * 4.5);
    const dx = (targetX - pointerX) * damping, dy = (targetY - pointerY) * damping;
    pointerX += dx; pointerY += dy;
    if (Math.abs(dx) + Math.abs(dy) > 0.0001) changing = true;
    return changing;
  }
  function tick(time) {
    frame = 0;
    if (!needsFrame()) { stop(); return; }
    // Loss is observable before its DOM event arrives. Do not advance either
    // clock during that gap, otherwise recovery skips an unpainted camera pose.
    if (gl.isContextLost()) { stop(); return; }
    const interval = 1000 / qualities[quality].fps;
    if (!lastPaint || time - lastPaint >= interval - 1.2) {
      const delta = lastTick ? Math.min((time - lastTick) / 1000, 0.10) : 0;
      const cadence = lastPaint ? time - lastPaint : 0;
      lastTick = lastPaint = time;
      const cameraMoving = updateCamera(delta);
      if (wantsMotion()) elapsed += delta * pose[14];
      try {
        let gpuCost = 0, timing = false;
        if (timerExtension && queryPending[queryCursor] && gl.getQueryParameter(queries[queryCursor], gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(timerExtension.GPU_DISJOINT_EXT)) gpuCost = gl.getQueryParameter(queries[queryCursor], gl.QUERY_RESULT) / 1000000;
          queryPending[queryCursor] = 0;
        }
        if (wantsMotion() && !transitioning) adapt(time, cadence, gpuCost);
        if (sizeDirty) {
          allocate(); sizeDirty = false;
          if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('Renderer unavailable');
        }
        if (timerExtension && !queryPending[queryCursor]) { gl.beginQuery(timerExtension.TIME_ELAPSED_EXT, queries[queryCursor]); timing = true; }
        draw(cameraMoving);
        if (timing) { gl.endQuery(timerExtension.TIME_ELAPSED_EXT); queryPending[queryCursor] = 1; }
        queryCursor = (queryCursor + 1) & 3;
        if (!ready) {
          ready = true; stage.dataset.renderer = 'webgl2'; stage.classList.add('is-rendered');
          updateControls(); notify();
        }
      } catch (error) { console.warn('Black-hole draw failed:', error.message); fail(); return; }
    }
    if (needsFrame()) frame = requestAnimationFrame(tick);
    else stop();
  }
  function getState() {
    return {
      ready: ready && !failed && !lost, viewIndex, viewId: views[viewIndex].id,
      layout: mobile ? 'mobile' : 'desktop', playing: wantsMotion(), transitioning,
      quality, width, height, hdr, samples: historyCount, suspended: !active(), visibilityRatio,
      refining: !wantsMotion() && !transitioning && (settleFrames > 0 || sizeDirty),
      time: ((elapsed + pose[15]) % 20 + 20) % 20
    };
  }
  function notify() { dispatchEvent(new CustomEvent('blackhole:change', { detail: getState() })); }
  function applyTarget(transition, preserveTime = false) {
    const time = getState().time;
    fillTarget(); targetX = targetY = 0;
    // Only the seven camera values move. Scene settings are applied directly;
    // camera selection preserves the live clock instead of replaying snapshots.
    for (let i = 7; i < pose.length; i += 1) pose[i] = targetPose[i];
    elapsed = preserveTime ? time - pose[15] : 0;
    const turn = Math.PI * 2;
    for (const i of [4, 5]) {
      const offset = ((targetPose[i] - pose[i] + Math.PI) % turn + turn) % turn - Math.PI;
      targetPose[i] = pose[i] + offset;
    }
    let cameraChanged = false;
    for (let i = 0; i < 7; i += 1) {
      if (Math.abs(pose[i] - targetPose[i]) > 0.000001 || Math.abs(cameraLag[i] - pose[i]) > 0.000001) cameraChanged = true;
    }
    transitioning = Boolean(transition && config.transitionMs > 0 && poseInitialized && cameraChanged);
    if (!transitioning) finishCamera();
    poseInitialized = true;
    resetHistory(); costAverage = cadenceAverage = 0; sampledFrames = 0; sampleStart = 0;
    stage.dataset.transitioning = String(transitioning);
    sync(); notify();
  }
  function setView(index, options = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= views.length) throw new Error(`视角编号应在 0–${views.length - 1} 之间`);
    viewIndex = index;
    applyTarget(options.transition !== false, options.preserveTime !== false);
  }
  function setQuality(value) {
    const next = Config.clone(config);
    next.quality = value;
    config = Config.validate(next); views = config.views;
    quality = value === 'auto' ? (touch ? 1 : 3) : value;
    qualityCeiling = touch ? 2 : 3;
    costAverage = cadenceAverage = 0; sampledFrames = 0; sampleStart = 0; lastQualityChange = performance.now();
    sizeDirty = true;
    canvas.dataset.quality = String(quality);
    resetHistory(); sync(); notify();
  }
  function setConfig(value, options = {}) {
    const next = Config.validate(value), id = views[viewIndex].id;
    const index = Math.max(0, next.views.findIndex(view => view.id === id));
    const preserveTime = next.views[index].id === id && next.views[index].disk.phase === views[viewIndex].disk.phase;
    const qualityChanged = next.quality !== config.quality;
    config = next; views = config.views; viewIndex = index;
    if (qualityChanged) setQuality(config.quality);
    applyTarget(Boolean(options.transition), preserveTime);
  }
  function updateView(index, value, options = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= views.length) throw new Error('无效视角编号');
    const next = Config.validateView(value);
    if (next.id !== views[index].id) throw new Error('视角 id 不匹配');
    const phaseChanged = next.disk.phase !== views[index].disk.phase;
    views[index] = next;
    if (index === viewIndex) {
      applyTarget(Boolean(options.transition), !phaseChanged);
    } else notify();
  }
  function setPlaying(value) {
    userPlaying = Boolean(value); resetHistory(); sync(); notify();
  }
  function setTime(value) {
    if (!Number.isFinite(value) || value < 0 || value > 20) throw new Error('时间相位应在 0–20 之间');
    userPlaying = false; views[viewIndex].disk.phase = value;
    applyTarget(false);
  }
  function setParallax(value) {
    parallaxEnabled = Boolean(value);
    if (!parallaxEnabled) pointerX = pointerY = targetX = targetY = 0;
    resetHistory(); sync();
  }
  function captureView() {
    if (transitioning) throw new Error('视角正在过渡，请等待稳定后再复制');
    const result = Config.clone(views[viewIndex]);
    result.disk.phase = getState().time;
    return result;
  }
  function cycleView() {
    if (!ready || lost || failed || views.length < 2) return;
    const step = views.length > 2 && Math.random() >= 0.8 ? 2 : 1;
    setView((viewIndex + step) % views.length, { transition: !motionPreference.matches });
  }
  viewButton?.addEventListener('click', cycleView);
  if (viewSurface) {
    viewSurface.addEventListener('pointerdown', event => {
      pointerDownX = event.clientX; pointerDownY = event.clientY; dragged = !event.isPrimary || event.button !== 0;
    }, { passive: true });
    viewSurface.addEventListener('pointermove', event => {
      if (Math.abs(event.clientX - pointerDownX) + Math.abs(event.clientY - pointerDownY) > 9) dragged = true;
    }, { passive: true });
    viewSurface.addEventListener('pointercancel', () => { dragged = true; });
    viewSurface.addEventListener('click', event => { if (event.detail === 0 || !dragged) cycleView(); });
  }
  motionButton?.addEventListener('click', () => setPlaying(!wantsMotion()));
  const preferenceChanged = () => {
    userPlaying = null; targetX = targetY = pointerX = pointerY = 0;
    if (motionPreference.matches && transitioning) finishCamera();
    resetHistory(); sync();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', preferenceChanged);
  else motionPreference.addListener(preferenceChanged);
  connection?.addEventListener('change', preferenceChanged);
  hero.addEventListener('pointermove', event => {
    if (!available() || !parallaxEnabled || !finePointer.matches || event.pointerType !== 'mouse' || !wantsMotion() || !cssWidth || !cssHeight) return;
    targetX = Math.max(-1, Math.min(1, (event.clientX - stageLeft) / displayWidth * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY - stageTop) / displayHeight * 2 - 1));
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { targetX = targetY = 0; }, { passive: true });
  const refreshVisibility = () => { measure(); sync(); };
  addEventListener('focus', () => { windowActive = true; refreshVisibility(); });
  addEventListener('blur', () => { windowActive = false; sync(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { windowActive = true; measure(); }
    sync();
  });
  addEventListener('pagehide', () => { pageActive = false; sync(); });
  addEventListener('pageshow', () => { pageActive = true; resize(); });
  addEventListener('scroll', refreshVisibility, { passive: true });
  addEventListener('resize', resize, { passive: true });
  window.visualViewport?.addEventListener('scroll', refreshVisibility, { passive: true });
  window.visualViewport?.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver(refreshVisibility, { threshold: [0, 0.05, 1] }).observe(stage);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; ready = initialized = false; stop();
    stage.classList.remove('is-rendered'); delete stage.dataset.renderer; updateControls();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; ready = initialized = false; costAverage = 0; initialize();
  });
  window.BlackHoleRenderer = Object.freeze({
    getConfig: () => Config.clone(config), getDefaults: () => Config.clone(Config.defaults),
    getState, setConfig, updateView, setView, setPlaying, setTime, setQuality, setParallax, captureView
  });
  initialize();
  dispatchEvent(new CustomEvent('blackhole:ready', { detail: getState() }));
})();
