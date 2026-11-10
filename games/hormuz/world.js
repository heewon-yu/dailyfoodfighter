function createWorldRenderer(canvas, land, batteries) {
  const gl = canvas.getContext('webgl', {alpha: false, antialias: true, powerPreference: 'low-power'});
  if (!gl) return null;

  const camera = `
    uniform vec3 u_eye;
    uniform vec2 u_forward;
    uniform vec4 u_view;
    const vec3 sun = vec3(-0.34, 0.48, 0.81);
    vec2 rightAxis() { return vec2(-u_forward.y, u_forward.x); }
  `;
  const atmosphere = `
    vec3 sky(vec3 ray) {
      float up = max(0., ray.y);
      vec3 color = mix(vec3(.83,.79,.66), vec3(.29,.53,.69), sqrt(up));
      float light = max(0., dot(ray, sun));
      color += vec3(.42,.31,.14)*pow(light, 10.);
      color += vec3(1.,.81,.46)*smoothstep(.9991,.99972,light);
      return color;
    }
    float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p) {
      vec2 f = fract(p), i = floor(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
    }
  `;
  const backdrop = program(
    `attribute vec2 a_pos; varying vec2 v_screen;
      void main(){ v_screen=a_pos; gl_Position=vec4(a_pos,0.,1.); }`,
    `precision highp float; varying vec2 v_screen;
      ${camera}
      ${atmosphere}
      uniform vec3 u_ship;
      void main(){
        vec2 aim=vec2(v_screen.x/u_view.x, (v_screen.y-u_view.z)/u_view.y);
        vec2 ground=u_forward+rightAxis()*aim.x;
        vec3 ray=normalize(vec3(ground.x,aim.y,ground.y));
        vec3 color=sky(ray);
        if (ray.y >= 0.) {
          vec2 cloud=ray.xz/(ray.y+.15)*3.3+vec2(u_view.w*.013,0.);
          float cover=noise(cloud*.57)*.55+noise(cloud*1.6)*.3+noise(cloud*3.8)*.15;
          color=mix(color,vec3(.96,.94,.88),smoothstep(.49,.79,cover)*smoothstep(.005,.17,ray.y)*.58);
        } else {
          float distance=min(3600.,-u_eye.y/ray.y);
          vec2 p=u_eye.xz+ray.xz*distance;
          float detail=1.-smoothstep(75.,275.,distance);
          float patch=noise(p*.065), swell=noise(p*.019)*4.;
          float a=dot(p,vec2(.24,.39))+u_view.w*1.6+patch*3.2+swell;
          float b=dot(p,vec2(.82,-.49))-u_view.w*2.1+patch*5.;
          float c=dot(p,vec2(-.14,.22))+u_view.w*.89+swell*1.6;
          float falloff=1.-smoothstep(130.,530.,distance);
          vec2 slope=(vec2(.24,.39)*cos(a)*.14+vec2(.82,-.49)*cos(b)*.042*detail
            +vec2(-.14,.22)*cos(c)*.18)*falloff;
          vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
          vec3 reflectRay=reflect(ray,normal);
          float fresnel=pow(1.-max(0.,dot(-ray,normal)),4.);
          float diffuse=.65+.35*max(0.,dot(normal,sun));
          float shine=pow(max(0.,dot(reflectRay,sun)),49.);
          color=mix(vec3(.023,.18,.23)*diffuse,sky(reflectRay),.16+.48*fresnel);
          color+=vec3(1.,.79,.47)*shine*.46;
          color+=vec3(.13,.27,.28)*pow(max(0.,sin(a)*.6+sin(c)*.4),5.)*detail*.31;
          vec2 rel=p-u_ship.xy;
          float beam=abs(dot(rel,rightAxis())), along=dot(rel,u_forward);
          float wake=exp(-abs(beam-(8.6+max(0.,13.-along)*.17))*1.7)
            *smoothstep(-40.,0.,along)*(1.-smoothstep(17.,30.,along));
          color=mix(color,vec3(.68,.83,.8),wake*(.26+.64*noise(p*.72+u_view.w*.7))*(.2+.8*u_ship.z));
          color=mix(color,vec3(.56,.69,.68),smoothstep(120.,730.,distance)*.74);
        }
        gl_FragColor=vec4(color,1.);
      }`
  );
  const solid = program(
    `attribute vec3 a_pos, a_normal;
      attribute vec4 a_color;
      ${camera}
      uniform vec4 u_pose;
      varying vec3 v_world,v_normal,v_model;
      varying vec4 v_color;
      varying float v_depth;
      void main(){
        vec2 f=vec2(cos(u_pose.w),sin(u_pose.w)), r=vec2(-f.y,f.x);
        vec2 position=u_pose.xz+f*a_pos.x+r*a_pos.z;
        vec2 normal=f*a_normal.x+r*a_normal.z;
        vec3 world=vec3(position.x,a_pos.y+u_pose.y,position.y);
        vec3 d=world-u_eye;
        float z=dot(d.xz,u_forward);
        gl_Position=vec4(dot(d.xz,rightAxis())*u_view.x,d.y*u_view.y+u_view.z*z,1.002*z-6.006,z);
        v_world=world;v_model=a_pos;v_normal=vec3(normal.x,a_normal.y,normal.y);v_color=a_color;v_depth=z;
      }`,
    `precision highp float;
      varying vec3 v_world,v_normal,v_model;
      varying vec4 v_color;
      varying float v_depth;
      ${camera}
      ${atmosphere}
      void main(){
        vec3 n=normalize(v_normal);
        float lighting=.56+.48*max(0.,dot(n,sun));
        vec3 color=v_color.rgb;
        if(v_color.a>.5&&v_color.a<1.5) {
          float stone=noise(v_world.xz*.14+v_world.y*.24)*.55+noise(v_world.xz*.38-v_world.y*.13)*.45;
          float strata=sin(v_world.y*.7+noise(v_world.xz*.085)*5.);
          color*=.81+stone*.37+strata*.054;
          color=mix(color,vec3(.34,.39,.31),smoothstep(.35,.89,n.y)*smoothstep(8.,33.,v_world.y)*.5);
        } else if(v_color.a>1.5) {
          float line=abs(sin((abs(n.x)>.5 ? v_model.z : v_model.x)*13.));
          color*=.83+line*.17;
        }
        vec3 ray=normalize(u_eye-v_world);
        float shine=pow(max(0.,dot(reflect(-sun,n),ray)),26.);
        color=color*lighting+vec3(.99,.90,.73)*shine*.15;
        color=mix(color,vec3(.63,.72,.72),1.-exp(-max(0.,v_depth)*.00165));
        gl_FragColor=vec4(color,1.);
      }`
  );

  function program(vertex, fragment) {
    const result = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
    const attributes = ['a_pos', 'a_normal', 'a_color'].map(name => gl.getAttribLocation(result, name));
    const uniforms = Object.fromEntries(['eye', 'forward', 'view', 'ship', 'pose']
      .map(name => [name, gl.getUniformLocation(result, 'u_' + name)]));
    return {result, attributes, uniforms};
  }

  function buffer(data, stride) {
    const handle = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, handle);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return {handle, count: data.length / stride};
  }

  function triangle(mesh, a, b, c, color, upward = false) {
    const u = b.map((value, i) => value - a[i]);
    const v = c.map((value, i) => value - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n);
    if (length < 0.00001) return;
    const normal = n.map(value => value / (upward && n[1] < 0 ? -length : length));
    for (const point of [a, b, c]) mesh.push(...point, ...normal, ...color);
  }

  function quad(mesh, a, b, c, d, color) {
    triangle(mesh, a, b, c, color);
    triangle(mesh, a, c, d, color);
  }

  function box(mesh, [x, y, z], [l, h, w], color, metal = 0) {
    const corners = [[x,y,z],[x+l,y,z],[x+l,y,z+w],[x,y,z+w],
      [x,y+h,z],[x+l,y+h,z],[x+l,y+h,z+w],[x,y+h,z+w]];
    for (const indices of [[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]) {
      quad(mesh, ...indices.map(i => corners[i]), [...color, metal]);
    }
  }

  const edge = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  function triangulate(ring) {
    const area = ring.reduce((sum, p, i) => sum + edge([0,0],p,ring[(i+1)%ring.length]), 0);
    const remaining = area > 0 ? ring.slice() : ring.slice().reverse();
    const result = [];
    let i = 0, skips = 0;
    while (remaining.length > 2 && skips < remaining.length) {
      const len = remaining.length;
      const a = remaining[(i+len-1)%len], b = remaining[i], c = remaining[(i+1)%len];
      const cross = edge(a,b,c);
      if (Math.abs(cross)<0.00001 || (cross > 0 && !remaining.some(p =>
        p!==a&&p!==b&&p!==c&&edge(a,b,p)>=0&&edge(b,c,p)>=0&&edge(c,a,p)>=0))) {
        if (cross > 0) result.push([a,b,c]);
        remaining.splice(i,1);
        i %= remaining.length;
        skips = 0;
      } else {
        i = (i+1)%len;
        skips++;
      }
    }
    return result;
  }

  const shore = land.flatMap(ring => ring.flatMap(([x,z],i) => {
    const [b,d] = ring[(i+1)%ring.length];
    return (x===b&&z===d)||(x===b&&(x===0||x===1000))||(z===d&&(z===0||z===610))
      ? [] : [[x,z,b-x,d-z]];
  }));
  function heightAt(x,z) {
    let nearest = 1e6;
    for (const [a,b,u,v] of shore) {
      const t = Math.max(0, Math.min(1, ((x-a)*u+(z-b)*v)/(u*u+v*v)));
      nearest = Math.min(nearest, (x-a-u*t)**2+(z-b-v*t)**2);
    }
    const coastDistance = Math.sqrt(nearest);
    const ridges = .53 + .2*Math.sin(x*.017-z*.02) + .17*Math.sin(z*.023+x*.009);
    return .8+Math.min(45,coastDistance*.85)*(ridges+.34)+Math.min(5,coastDistance*.48);
  }

  function makeTerrain() {
    const mesh = [];
    const vertices = new Map();
    const getPoint = ([x,z]) => {
      const key = `${x},${z}`;
      if (!vertices.has(key)) vertices.set(key,[x,heightAt(x,z),z]);
      return vertices.get(key);
    };
    const middle = (a,b) => [(a[0]+b[0])/2,(a[1]+b[1])/2];
    function subdivide(a,b,c,level) {
      if (level===0) {
        triangle(mesh,getPoint(a),getPoint(b),getPoint(c),[.58,.49,.36,1],true);
        return;
      }
      const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);
      subdivide(a,ab,ca,level-1);subdivide(ab,b,bc,level-1);
      subdivide(ca,bc,c,level-1);subdivide(ab,bc,ca,level-1);
    }
    for (const ring of land) {
      const xs=ring.map(([x])=>x), zs=ring.map(([,z])=>z);
      const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs));
      // Use the same subdivision along shared edges to avoid gaps between triangles.
      const level=span>240?4:span>75?3:2;
      for (const [a,b,c] of triangulate(ring)) subdivide(a,b,c,level);
    }
    return buffer(mesh,10);
  }

  function makeShip() {
    const mesh = [];
    const hull = [[-13,9,4.4],[-4,9.3,4.5],[15,9.2,4.6],[23,6.9,4.85],[32,0.8,5.25]];
    const point = ([x,w,y], side, level) => [x,level===2?y:level===1?.6:-2.6,w*side*(level===0?.76:1)];
    for(let i=1;i<hull.length;i++){
      const a=hull[i-1],b=hull[i];
      for(const side of [-1,1]){
        quad(mesh,point(a,side,1),point(b,side,1),point(b,side,0),point(a,side,0),[.44,.17,.12,0]);
        const sidePoints=[point(a,side,1),point(a,side,2),point(b,side,2),point(b,side,1)];
        if(side<0)sidePoints.reverse();
        quad(mesh,...sidePoints,[.23,.35,.43,0]);
      }
      quad(mesh,point(a,-1,2),point(a,1,2),point(b,1,2),point(b,-1,2),[.28,.37,.4,0]);
    }
    const cream=[.8,.83,.75], steel=[.23,.33,.37], gold=[.79,.58,.23];
    for (const side of [-1,1]) {
      for(let i=1;i<hull.length;i++){
        const a=point(hull[i-1],side,2),b=point(hull[i],side,2);
        quad(mesh,a,b,[b[0],b[1]+.43,b[2]],[a[0],a[1]+.43,a[2]],[...cream,0]);
        quad(mesh,[a[0],a[1]+1.25,a[2]],[b[0],b[1]+1.25,b[2]],
          [b[0],b[1]+1.4,b[2]],[a[0],a[1]+1.4,a[2]],[...cream,0]);
        for(let x=a[0];x<b[0];x+=2.8){
          const t=(x-a[0])/(b[0]-a[0]);
          box(mesh,[x,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],[.11,1.35,.12],cream);
        }
      }
      const edgeZ=side*7.25;
      box(mesh,[-10,4.68,edgeZ],[28,.03,.16],gold);
      for(let x=-8;x<20;x+=6)box(mesh,[x,4.6,side*7.9],[.58,.64,.63],steel);
    }
    const palette=[[.58,.33,.19],[.35,.52,.53],[.69,.51,.27],[.45,.53,.44],[.58,.63,.61],[.48,.25,.2]];
    for(let row=0;row<4;row++)for(let column=0;column<3;column++){
      const x=-8+row*6.1,z=-6.35+column*4.3;
      const color=palette[(row+column*2)%palette.length];
      const height=row===3?2.1:2.65;
      box(mesh,[x,4.58,z],[5.65,height,3.84],color,2);
      box(mesh,[x,4.59+height,z],[5.65,.12,.16],color.map(v=>Math.min(1,v+.12)));
      box(mesh,[x,4.59+height,z+3.68],[5.65,.12,.16],color.map(v=>Math.min(1,v+.12)));
      for (const end of [x-.03,x+5.64]) {
        box(mesh,[end,4.65,z+.25],[.055,height-.19,.1],cream);
        box(mesh,[end,4.65,z+3.47],[.055,height-.19,.1],cream);
      }
    }
    box(mesh,[23,5,-1.95],[3.5,.35,3.9],steel);
    box(mesh,[23.6,5.3,-1.4],[1.85,.95,2.8],gold);
    box(mesh,[27.3,5.1,-.16],[.24,6.9,.3],cream);
    box(mesh,[27.14,10.2,-2.1],[.42,.22,4.2],cream);
    box(mesh,[27.1,11.95,-.29],[.55,.35,.6],gold);
    return buffer(mesh,10);
  }

  function makeSkiff() {
    const mesh = [], dark=[.1,.14,.16,0], blue=[.21,.31,.36,0];
    const a=[-5.4,1.1,-2.4],b=[3.3,1.25,-2.4],c=[6.7,1.55,0],d=[3.3,1.25,2.4],e=[-5.4,1.1,2.4];
    for(const [p,q] of [[a,b],[b,c],[c,d],[d,e],[e,a]]) {
      quad(mesh,p,q,[q[0],-.3,q[2]*.8],[p[0],-.3,p[2]*.8],dark);
    }
    triangle(mesh,a,b,c,blue,true);triangle(mesh,a,c,d,blue,true);triangle(mesh,a,d,e,blue,true);
    const trim=[.56,.45,.27], motor=[.13,.15,.16];
    box(mesh,[-5.7,.04,-1.75],[.9,1.7,1.15],motor);
    box(mesh,[-5.7,.04,.6],[.9,1.7,1.15],motor);
    box(mesh,[.6,1.15,-.8],[1.25,1.4,1.6],trim);
    box(mesh,[1.42,2.28,-.8],[.11,.43,1.6],[.41,.64,.68]);
    for(const [x,z,color] of [[-.9,.0,[.26,.29,.22]],[-3.1,1.1,[.37,.32,.22]],[3.2,-.3,[.29,.31,.26]]]){
      box(mesh,[x,1.18,z-.29],[.4,.85,.58],[.17,.22,.25]);
      box(mesh,[x-.13,2.,z-.37],[.59,.86,.74],color);
      box(mesh,[x-.08,2.84,z-.22],[.47,.53,.46],[.36,.27,.2]);
      box(mesh,[x-.12,3.24,z-.27],[.54,.17,.57],[.21,.25,.2]);
      box(mesh,[x+.14,2.25,z+.23],[.84,.22,.23],color);
    }
    box(mesh,[3.96,1.45,-.22],[.19,3.2,.18],trim);
    quad(mesh,[3.96,4.58,-.22],[3.96,3.79,-.22],[2.47,3.9,-.36],[2.32,4.54,-.36],[.13,.16,.17,0]);
    return buffer(mesh,10);
  }

  const terrain = makeTerrain();
  const ship = makeShip();
  const skiff = makeSkiff();
  const batteryMeshes = batteries.map(([x,z]) => {
    const mesh=[], y=heightAt(x,z);
    box(mesh,[x-3,y-.5,z-2.4],[6,2.4,4.8],[.41,.38,.31]);
    box(mesh,[x-1.6,y+1.75,z-1.5],[3.2,1.9,3],[.27,.32,.28]);
    box(mesh,[x-.28,y+3.1,z-.4],[.58,.65,5.8],[.18,.22,.19]);
    return buffer(mesh,10);
  });
  const screen = buffer([-1,-1,1,-1,-1,1,1,1],2);
  const enabled = new Set();

  function use(p, frame) {
    gl.useProgram(p.result);
    for(const loc of enabled)gl.disableVertexAttribArray(loc);
    enabled.clear();
    const {eye,forward,view,ship: shipLocation}=p.uniforms;
    gl.uniform3f(eye,frame.eyeX,frame.eyeY,frame.eyeZ);
    gl.uniform2f(forward,frame.forwardX,frame.forwardZ);
    gl.uniform4f(view,frame.focal*2/frame.width,frame.focal*2/frame.height,1-frame.horizon*2/frame.height,frame.now*.001);
    gl.uniform3f(shipLocation,frame.x,frame.z,frame.voyage.power);
  }

  function attribute(location,size,stride,offset) {
    if(location<0)return;
    gl.enableVertexAttribArray(location);
    enabled.add(location);
    gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);
  }

  function draw(mesh, x=0, y=0, z=0, angle=0) {
    gl.uniform4f(solid.uniforms.pose,x,y,z,angle);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.handle);
    solid.attributes.forEach((loc,i)=>attribute(loc,i===2?4:3,40,[0,12,24][i]));
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }

  return {
    heightAt,
    render(frame) {
      if(gl.isContextLost())return false;
      const density=Math.min(frame.density,1.35);
      const width=Math.round(frame.width*density),height=Math.round(frame.height*density);
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      gl.viewport(0,0,width,height);
      gl.disable(gl.DEPTH_TEST);
      use(backdrop,frame);
      gl.bindBuffer(gl.ARRAY_BUFFER,screen.handle);
      attribute(backdrop.attributes[0],2,0,0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      use(solid,frame);
      draw(terrain);
      for(let i=0;i<frame.voyage.stage;i++)draw(batteryMeshes[i]);
      const angle=Math.atan2(frame.forwardZ,frame.forwardX);
      draw(ship,frame.x,0,frame.z,angle);
      for (const boat of frame.skiffs) draw(skiff,boat.x,boat.y,boat.z,angle+boat.heading);
      return true;
    },
  };
}
