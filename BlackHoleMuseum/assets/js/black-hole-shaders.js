/* SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 Enigmatisms. Third-party notices: /lib/black-hole-LICENSE.txt.
 */
/* Shared WebGL2 shaders. Initial project reference: dgreenheck/webgpu-black-hole
 * (MIT; /lib/black-hole-LICENSE.txt). Geometry and material share one ray path.
 */
(() => {
  'use strict';
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
    precision highp int;
    precision highp sampler3D;
    in vec2 vUV;
    out vec4 fragColor;
    uniform sampler3D uNoise;
    uniform sampler2D uThermal;
    uniform vec2 uResolution, uJitter, uPointer, uOrbit, uBackground, uDetail;
    uniform vec4 uView, uDisk, uMaterial, uSpectrum;
    uniform float uRoll, uTemperature, uFlowAngles[64];
    uniform vec3 uCold, uWarm, uHot, uPhysics;
    uniform int uSteps;
    uniform bool uHDR;
    #define RS (uDisk.x)
    #define INNER (uDisk.y)
    #define OUTER (uDisk.z)
    const float PI = 3.141592653589793;
    const float SKY_BASE = 0.0018;
    const vec3 STRAND_FREQUENCY = vec3(5.2,64.0/(2.0*PI),3.2);
    const uvec2 SKY_CELLS[7]=uvec2[7](
      uvec2(0x9538e45eu,0x7u),uvec2(0x55404441u,0x4u),
      uvec2(0x9578445fu,0x7u),uvec2(0x15444451u,0x4u),
      uvec2(0x8b4463ceu,0x3u),uvec2(0x00780000u,0x0u),
      uvec2(0x00004000u,0x0u)
    );

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
    vec4 materialField(vec3 p, float angle, vec2 footprint) {
      float radius = length(p.xz), rough = uDetail.x;
      float verticalScale = mix(1.4, 0.85/((0.24+0.035*radius)*uDisk.w), rough);
      vec3 rotated = vec3(cos(angle)*radius, p.y*verticalScale, sin(angle)*radius);
      vec4 warp = noise(rotated*0.24 + 13.0, footprint.x*0.24);
      vec3 displacement = vec3(warp.r-0.5, warp.g-0.5, (warp.r-warp.g)*0.65);
      vec3 q = rotated*0.42 + displacement*(uMaterial.y*1.65);
      vec4 broad = noise(q, footprint.x*0.42);
      // Integer angular frequencies repeat at the atan seam. B contains baked,
      // irregular noise ridges, not sine rings; R/G keep isotropic structure.
      float verticalBands = mix(STRAND_FREQUENCY.z,verticalScale*2.3,rough);
      vec3 bands = vec3(radius*STRAND_FREQUENCY.x+(warp.g-0.5)*uMaterial.y*2.6,
        angle*STRAND_FREQUENCY.y+(warp.r-0.5)*uMaterial.y*1.4,p.y*verticalBands);
      vec4 ribbons = noise(bands,footprint.y);
      vec4 fine = noise(bands*vec3(1.93,2.0,1.71)+vec3(11.0,33.0,17.0),footprint.y*2.0);
      float cloud = broad.r*0.50+warp.g*0.15+fine.r*0.35;
      cloud = clamp(0.5+(cloud-0.5)*uMaterial.y*1.9,0.0,1.0);
      float fibers = ribbons.b*0.68+fine.b*0.32;
      float surface = (broad.g-0.5)*0.8+(fine.g-0.5)*0.65;
      float dust = fine.a;
      if(rough>0.0) {
        // One genuinely Cartesian 3-D grain fetch breaks the polar sheet
        // structure without a second noise texture or a screen-space blur.
        vec4 grain = noise(rotated*5.7+displacement*uMaterial.y*3.0+27.0,
          footprint.x*5.7);
        cloud = clamp(cloud+rough*((grain.r-0.5)*0.95+(broad.g-0.5)*0.45),0.0,1.0);
        fibers *= mix(1.0,clamp(0.45+1.7*broad.r+0.65*(grain.g-0.5),0.3,1.8),rough);
        surface += rough*((grain.g-0.5)*0.50+(ribbons.r-0.5)*0.45);
        dust = mix(dust,grain.a,rough);
      }
      return vec4(cloud,fibers,surface,dust);
    }
    float gaussianColumn(float center,float width,float span);
    vec2 gasField(vec4 field,float height,float span,float continuous,float heat) {
      float clump=smoothstep(0.25,0.75,field.x);
      float z=height+field.z*uMaterial.y*1.6;
      float envelope=exp(-z*z*0.95),corona=exp(-z*z*0.22)*0.12;
      float strands=clamp(1.0+(field.y-0.45)*uMaterial.z*2.1,0.20,3.6);
      float base=0.42*continuous;
      float cloud=(0.12+clump*clump*2.10)*envelope+(0.15+clump*0.45)*corona;
      // One continuous emitting core; surface brightness follows optical depth.
      float core=gaussianColumn(height+field.z*uMaterial.y*0.35,0.72,span)
        *(0.23+0.31*strands);
      float dust=continuous*(1.0-heat)*(0.06+field.w*0.20);
      float emitting=base*0.72+cloud*(0.40+clump*1.50)
        +core*(1.05+strands*0.50+field.w*uMaterial.z*0.80);
      return vec2((base+cloud+core)*0.62+dust,emitting*0.62);
    }
    vec2 advectedGas(vec3 p,float footprint,vec3 raySpan,float height,
      float span,float continuous,float heat) {
      float radius=max(length(p.xz),INNER),angle=atan(p.z,p.x);
      float rho=radius/RS;
      // Persistent annular flow cells rotate the same 3-D material. C2 radial
      // interpolation approximates differential rotation without globally
      // reseeding clouds or accumulating unbounded texture shear.
      float cell=clamp(log2(max(rho,1.0))*8.0,0.0,62.999);
      int ring=int(floor(cell));
      float blend=fract(cell);
      blend=blend*blend*blend*(blend*(blend*6.0-15.0)+10.0);
      float verticalScale=mix(1.4,0.85/((0.24+0.035*radius)*uDisk.w),uDetail.x);
      float verticalBands=mix(STRAND_FREQUENCY.z,verticalScale*2.3,uDetail.x);
      float angularGradient=STRAND_FREQUENCY.y/radius;
      vec2 fieldFootprint=footprint*vec2(max(verticalScale,1.0),
        length(vec3(STRAND_FREQUENCY.x,angularGradient,verticalBands)));
      float radialSpan=dot(p.xz,raySpan.xz)/radius;
      float angularSpan=dot(vec2(-p.z,p.x),raySpan.xz)/(radius*radius);
      float scaleSlope=-uDetail.x*0.85*0.035/((0.24+0.035*radius)*(0.24+0.035*radius)*uDisk.w);
      float verticalSpan=raySpan.y*verticalScale+p.y*scaleSlope*radialSpan;
      float bandSpan=raySpan.y*verticalBands+p.y*scaleSlope*2.3*uDetail.x*radialSpan;
      vec2 interval=vec2(length(vec3(raySpan.x,verticalSpan,raySpan.z)),
        length(vec3(radialSpan*STRAND_FREQUENCY.x,angularSpan*STRAND_FREQUENCY.y,bandSpan)));
      fieldFootprint=max(fieldFootprint,interval);
      // Fixed simulated shutter, independent of frame jitter and play/pause.
      // Only unresolved rapid rotation reaches coarse mips.
      float omega=rho>=3.0?0.70710678118/(rho*sqrt(rho))
        :sqrt(27.0/8.0)*(1.0-1.0/rho)/(rho*rho);
      vec2 temporal=min(vec2(4096.0),abs(omega*uDetail.y)*vec2(radius,STRAND_FREQUENCY.y));
      fieldFootprint=sqrt(fieldFootprint*fieldFootprint+temporal*temporal);
      // Interpolate conserved extinction/emission coefficients, not raw noise:
      // mixing noise before nonlinear clumping makes the entire disc breathe.
      vec2 first=gasField(materialField(p,angle-uFlowAngles[ring],fieldFootprint),height,span,continuous,heat);
      vec2 second=gasField(materialField(p,angle-uFlowAngles[ring+1],fieldFootprint),height,span,continuous,heat);
      return mix(first,second,blend);
    }
    vec3 palette(float heat) {
      float midpoint=uSpectrum.x,width=uSpectrum.y;
      return mix(mix(uCold,uWarm,smoothstep(midpoint-0.48*width,midpoint,heat)),uHot,
        smoothstep(midpoint,midpoint+0.38*width,heat));
    }
    float scaleHeight(float radius) { return (0.24+0.035*radius)*uDisk.w; }
    float volumeStep(float height,float y,float dy) {
      // Resolve the continuous body; integrate its emitting core analytically.
      // No thickness-dependent minimum step.
      float gap=max(abs(y)/height-1.15,0.0);
      float spacing=min(0.85,max(0.38,gap*0.55));
      return min(height*spacing/max(abs(dy),0.00001),0.65);
    }
    float erfApprox(float x) {
      float t=1.0/(1.0+0.3275911*abs(x));
      float p=(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t;
      return sign(x)*(1.0-p*exp(-x*x));
    }
    float gaussianColumn(float center,float width,float span) {
      if(span<width*0.025) return exp(-center*center/(width*width));
      float halfSpan=span*0.5;
      return max(0.0,0.88622692545*width/span
        *(erfApprox((center+halfSpan)/width)-erfApprox((center-halfSpan)/width)));
    }
    void accumulateVolume(vec3 p, vec3 localRay, float properLength,
      float footprint, float observerA, inout vec3 light, inout float transmission) {
      float radius = length(p.xz);
      float H = scaleHeight(radius);
      if (radius<=INNER || radius>=OUTER || abs(p.y)>=4.5*H) return;
      float r = length(p), A = max(0.000001,1.0-RS/r);
      vec3 radial = p/r;
      vec3 coordinateRay = localRay+(sqrt(A)-1.0)*dot(localRay,radial)*radial;
      float height0 = p.y/H;
      float continuous = exp(-height0*height0*0.95);
      float support = 1.0-smoothstep(3.0,4.5,abs(p.y)/H);
      float edge = smoothstep(INNER,INNER+min(0.55,(OUTER-INNER)*0.2),radius)
        * (1.0-smoothstep(max(INNER,OUTER-3.0),OUTER,radius));
      float medium = edge*support*uMaterial.x;
      float radialSlope = dot(p.xz,coordinateRay.xz)/radius;
      float heightSlope = coordinateRay.y/H-height0*(0.035*uDisk.w/H)*radialSlope;
      float span = abs(heightSlope)*properLength;
      float heat = pow(INNER/radius,0.80);
      vec2 gas=advectedGas(p,footprint,coordinateRay*properLength,height0,span,continuous,heat)*medium;
      vec3 orbital = vec3(-p.z,0.0,p.x)/radius;
      vec3 beta = vec3(0.0);
      float gamma = 1.0;
      if(uPhysics.x>0.5) {
        if(r>=3.0*RS) {
          float speed=sqrt(RS/(2.0*(r-RS)));
          beta=orbital*speed;
          gamma=inversesqrt(1.0-speed*speed);
        } else {
          // Timelike equatorial geodesic plunge with ISCO constants.
          // Off the equator this is a local tetrad extension, not a gas solver.
          float E=sqrt(8.0/9.0),L=sqrt(3.0)*RS;
          float azimuthal=(L/r)*sqrt(A)/E;
          float inward=-sqrt(max(0.0,E*E-A*(1.0+L*L/(r*r))))/E;
          beta=radial*inward+orbital*azimuthal;
          gamma=E/sqrt(A);
        }
      }
      // -localRay is emitter -> observer. The same comoving path conversion
      // must vanish with the Doppler toggle; gravitational redshift remains.
      float dopplerDenominator = gamma*(1.0-dot(beta,-localRay));
      float shift = sqrt(A/observerA)/dopplerDenominator;
      float extinction = gas.x;
      float opacity = 1.0-exp(-extinction*properLength*dopplerDenominator);
      vec3 emission;
      if(uPhysics.y>1.5) {
        // At a fixed observed frequency: g^3 j_(nu/g) = g^(3+alpha) j_nu.
        // The palette is false colour, not an optical blackbody temperature.
        emission=palette(clamp(heat*uTemperature,0.0,1.1))
          *pow(INNER/radius,uSpectrum.w)*pow(shift,3.0+uSpectrum.z)*uMaterial.w;
      } else if(uPhysics.y>0.5) {
        // I_nu/nu^3 invariance maps Planck(T) exactly to Planck(g*T).
        // The LUT is absolute visible radiance, never normalized per color.
        float temperature=uPhysics.z*pow(INNER/radius,0.75)*shift;
        float coordinate=clamp(log(max(temperature,500.0)/500.0)/log(400.0),0.0,1.0);
        emission=texture(uThermal,vec2((coordinate*255.0+0.5)/256.0,0.5)).rgb;
        // LUT endpoints bound the supported radiance range; below 500 K the
        // visible contribution is negligible. Do not apply a second g power.
        emission*=uMaterial.w;
      } else {
        // Legacy palette is artistic specific-intensity color, not bolometric
        // blackbody physics. No extra shift power is used on the thermal path.
        emission=palette(clamp(heat*shift*uTemperature,0.0,1.1))
          *(0.16+1.8*pow(INNER/radius,uSpectrum.w))*shift*shift*shift*uMaterial.w;
      }
      emission *= gas.y/max(extinction,0.00001);
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
      bool catalogueNear=all(greaterThanEqual(cell,vec2(82.0,146.0)))
        &&all(lessThanEqual(cell,vec2(118.0,154.0)));
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
          float catalogueStar=0.0;
          if(catalogueNear) {
            ivec2 address=ivec2(key)-ivec2(83,147);
            if(address.x>=0&&address.x<35&&address.y>=0&&address.y<7) {
              uvec2 row=SKY_CELLS[address.y];
              uint bits=address.x<32?row.x:row.y;
              catalogueStar=float((bits>>(uint(address.x)&31u))&1u);
            }
          }
          present=max(present,catalogueStar*smoothstep(0.0,0.6,uBackground.x));
          vec2 offset=0.18+vec2(hash(key+17.1),hash(key+49.3))*0.64;
          vec2 delta=(raw+offset-coord)*angularCell;
          delta.x*=cosLatitude;
          float radius=mix(0.00016,0.00048,hash(key+83.7));
          float variance=radius*radius+pixelVariance;
          float profile=exp(-0.5*dot(delta,delta)/variance)*(radius*radius/variance);
          float flux=mix(0.4,8.0,pow(hash(key+123.4),6.0));
          flux=mix(flux,min(flux,0.85),catalogueStar);
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
      float lens=uView.z/min(1.0,aspect);
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
      // This escape shortcut is valid only outside the photon sphere; inward
      // rays launched inside it are captured even at large impact parameter.
      if(uOrbit.y>1.5*RS && !materialPossible && (uBackground.x<=0.0 || uBackground.y<=0.0)) {
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
      for(int i=0;i<1536;++i) {
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
          float radialA=max(0.000001,1.0-RS/r);
          vec3 coordinateDirection=radial0*sqrt(radialA);
          float heightRate=abs(coordinateDirection.y)
            +min(abs(p.y)/H,4.5)*0.035*uDisk.w*length(coordinateDirection.xz);
          float lengthTarget=gap<H?volumeStep(H,p.y,heightRate)
            :min(r*0.32,max(H*0.35,gap*0.65));
          float dr=lengthTarget*sqrt(radialA)*stepScale;
          float nextR=nr<0.0?max(RS*1.000001,r-dr):r+dr;
          for(int j=0;j<2;++j) {
            float t=j==0?0.25:0.75;
            float sampleR=mix(r,nextR,t);
            vec3 samplePoint=radial0*sampleR;
            float dl=abs(nextR-r)*0.5/sqrt(max(0.000001,1.0-RS/sampleR));
            float footprint=angularPixel*abs(sampleR-uOrbit.y);
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
        vec3 coordinateDirection=localDirection+(sqrt(A)-1.0)*dot(localDirection,radial)*radial;
        float heightRate=abs(coordinateDirection.y)
          +min(abs(p.y)/H,4.5)*0.035*uDisk.w*length(coordinateDirection.xz);
        float gap=max(abs(p.y)-4.5*H,max(INNER-radius,radius-OUTER));
        float travelStep=r*0.32;
        if(materialPossible) travelStep=gap<H
          ?volumeStep(H,p.y,heightRate)
          :min(travelStep,max(H*0.35,gap*0.65));
        float h=min(0.068*stepScale,travelStep*b*sqrt(A)*state.x*state.x/RS*stepScale);
        if(state.y<0.0) h=min(h,state.x*0.30/max(0.00001,-state.y));
        h=max(h,0.0000000001);
        vec2 next=advanceOrbit(state,h);
        if(materialPossible) {
          for(int j=0;j<2;++j) {
            float t=j==0?0.25:0.75;
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
            // Proper static-frame path; two contiguous, ordered midpoint cells.
            float dl=h*0.5*sampleR*sampleR/(impact*sqrt(sampleA));
            float spread=1.0+min(24.0,abs(phi)*RS/max(RS*0.25,abs(impact-2.598076211353316*RS)*6.0));
            float footprint=angularPixel*length(samplePoint-camera)*spread;
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
      // Keep the text-safe side visible while widening the transition.
      // The old narrow ramp made the hero appear to fall off abruptly.
      float clearText=uMobile<0.5?smoothstep(0.22,0.62,vUV.x):1.0-smoothstep(0.36,0.76,vUV.y);
      float textMix=mix(0.72,1.0,clearText);
      fragColor=vec4(mix(sky,displayColor,mix(1.0,textMix,uClearance)),1.0);
    }`;

  window.BlackHoleShaders = Object.freeze({ vertex: vertexSource, scene: sceneSource, resolve: resolveSource, composite: compositeSource });
})();
