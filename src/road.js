// Both render paths use the same ground projection as the characters and gates.
const vertex = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const fragment = `precision highp float;
uniform sampler2D terrain;
uniform vec2 viewport;
uniform float progress, roadFraction, roadCentre, nearWidth, tileMetres;
void main(){
  vec2 screen=gl_FragCoord.xy/viewport;
  float y=1.-screen.y;
  float k=(y+.38)/1.14;
  float d=17.5*(1./k-1.);
  float u=roadCentre+(screen.x-.5)*roadFraction/(k*nearWidth);
  // Continue the shoreline at the wide far edge of a landscape display.
  if(u<0.)u=(1.-abs(mod(-u/.24,2.)-1.))*.24;
  else if(u>1.)u=1.-(1.-abs(mod((u-1.)/.24,2.)-1.))*.24;
  float v=abs(mod((progress+d)/tileMetres+.41,2.)-1.);
  vec3 col=texture2D(terrain,vec2(u,v)).rgb;
  col=mix(col,vec3(.49,.55,.54),.105*(1.-smoothstep(0.,.38,y)));
  col*=1.-.14*pow(abs(screen.x-.5)*2.,3.);
  gl_FragColor=vec4(col,1.);
}`;
export class Road {
  constructor(canvas){
    this.canvas=canvas;
    this.gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'low-power'});
    if(!this.gl){this.ctx=canvas.getContext('2d',{alpha:false});return;}
    const gl=this.gl, program=gl.createProgram();
    for(const [kind,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
      const sh=gl.createShader(kind);gl.shaderSource(sh,code);gl.compileShader(sh);
      if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));
      gl.attachShader(program,sh);gl.deleteShader(sh);
    }
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    this.uniform=Object.fromEntries(['viewport','progress','roadFraction','roadCentre','nearWidth','tileMetres'].map(k=>[k,gl.getUniformLocation(program,k)]));
    this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  }
  set(image,range){
    this.image=image;this.fraction=range[1]-range[0];this.centre=(range[0]+range[1])/2;this.tileMetres=8.4/this.fraction;
    const gl=this.gl;if(!gl)return;
    gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);
  }
  draw(w,h,near,progress,dpr){
    if(!this.image)return;
    const gl=this.gl,canvas=this.canvas;
    if(gl){
      gl.viewport(0,0,canvas.width,canvas.height);const u=this.uniform;
      gl.uniform2f(u.viewport,canvas.width,canvas.height);gl.uniform1f(u.progress,progress);gl.uniform1f(u.roadFraction,this.fraction);
      gl.uniform1f(u.roadCentre,this.centre);gl.uniform1f(u.nearWidth,near/w);gl.uniform1f(u.tileMetres,this.tileMetres);gl.drawArrays(gl.TRIANGLES,0,3);return;
    }
    const ctx=this.ctx,img=this.image;ctx.setTransform(dpr,0,0,dpr,0,0);
    const sourceY=y=>{const d=17.5*(1.14/(y/h+.38)-1);const v=(progress+d)/this.tileMetres+.41;return Math.abs(((v%2)+2)%2-1)*(img.height-1);};
    for(let y=0;y<h;y+=3){
      const span=near*((y/h+.38)/1.14)/this.fraction,left=w/2-this.centre*span;
      const y0=sourceY(y),y1=sourceY(y+3),src=Math.min(y0,y1),sh=Math.max(1,Math.abs(y1-y0));
      ctx.drawImage(img,0,src,img.width,sh,left,y,span,3.5);
      if(left>0)ctx.drawImage(img,0,src,img.width*.22,sh,0,y,left+1,3.5);
      if(left+span<w)ctx.drawImage(img,img.width*.78,src,img.width*.22,sh,left+span-1,y,w-left-span+1,3.5);
    }
  }
}
