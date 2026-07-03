/* ============================================================
   pinball.js — LOCKBOXX shared pinball engine
   Used by level1..level4.html. Levels supply geometry, rules and
   scenery through PB.init(cfg); the engine owns physics, balls,
   flippers, rails/tubes, plunger, HUD, sound, persistence and
   page-to-page level transitions.
   ============================================================ */
"use strict";
const PB = (function(){

/* ---------- table constants ---------- */
const TW = 480, TH = 880;
const GRAV = 1650, BALL_R = 9, STEP = 1/240, MAXV = 1700;

/* ---------- canvas ---------- */
const cv = document.getElementById("c");
const cx = cv.getContext("2d");
function resize(){
  const dpr = Math.min(window.devicePixelRatio||1, 2);
  const s = Math.min(window.innerWidth/TW, window.innerHeight/TH);
  cv.width  = Math.round(TW*s*dpr);
  cv.height = Math.round(TH*s*dpr);
  cv.style.width  = Math.round(TW*s)+"px";
  cv.style.height = Math.round(TH*s)+"px";
  cx.setTransform(s*dpr,0,0,s*dpr,0,0);
}
window.addEventListener("resize", resize); resize();

/* ---------- audio ---------- */
let AC = null;
function audio(){ if(!AC){ try{ AC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AC; }
function tone(f, dur, type="square", vol=0.06, slide=0, delay=0){
  const a = audio(); if(!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), t0+dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0+dur+0.02);
}
/* looping background music (cfg.music); starts on first user gesture */
let music = null, musicOn = true;
function startMusic(){
  if(!cfg.music || music || typeof Audio==="undefined") return;
  music = new Audio(cfg.music);
  music.loop = true;
  music.volume = 0.35;
  music.muted = !musicOn;
  music.play().catch(()=>{ music = null; });   // blocked: retry on the next gesture
}
function toggleMusic(){
  musicOn = !musicOn;
  if(music) music.muted = !musicOn;
  showMsg("MUSIC "+(musicOn?"ON":"OFF"),"",1.2);
}
const sfx = {
  flip:   ()=> tone(95, .06, "triangle", .10, -30),
  bumper: ()=> tone(210+Math.random()*60, .09, "square", .07, 120),
  sling:  ()=> tone(160, .07, "sawtooth", .07, 90),
  target: ()=> { tone(660,.07,"square",.06); tone(990,.09,"square",.05,0,.05); },
  unlock: ()=> { tone(440,.09,"square",.06); tone(587,.09,"square",.06,0,.08); tone(880,.14,"square",.06,0,.16); },
  thud:   ()=> { tone(120,.18,"sawtooth",.09,-40); tone(740,.12,"square",.05,0,.06); },
  clank:  ()=> { tone(196,.12,"triangle",.09); tone(392,.16,"triangle",.08,0,.10); },
  chain:  ()=> { tone(1200,.05,"square",.05,-500); tone(300,.10,"sawtooth",.06,0,.04); },
  jackpot:()=> { [523,659,784,1047].forEach((f,i)=>tone(f,.12,"square",.06,0,i*.07)); },
  fanfare:()=> { [392,523,659,784,1047,1319].forEach((f,i)=>tone(f,.13,"triangle",.08,0,i*.08)); },
  launch: ()=> tone(140,.25,"sawtooth",.08,420),
  drain:  ()=> tone(220,.5,"sawtooth",.08,-160),
  win:    ()=> { [262,330,392,523,659,784,1047].forEach((f,i)=>tone(f,.2,"triangle",.07,0,i*.09)); },
  ghost:  ()=> tone(880,.5,"sine",.06,-620),
  roar:   ()=> { tone(90,.5,"sawtooth",.11,-40); tone(60,.6,"sawtooth",.09,-20,.08); },
  horn:   ()=> { tone(311,.28,"square",.06); tone(370,.28,"square",.06); },
};

/* ---------- vector helpers ---------- */
const V = (x,y)=>({x,y});
const sub=(a,b)=>V(a.x-b.x,a.y-b.y), add=(a,b)=>V(a.x+b.x,a.y+b.y);
const mul=(a,s)=>V(a.x*s,a.y*s), dot=(a,b)=>a.x*b.x+a.y*b.y;
const len=(a)=>Math.hypot(a.x,a.y);
const norm=(a)=>{const l=len(a)||1;return V(a.x/l,a.y/l);};

/* ---------- draw helpers ---------- */
const GOLD="#ffd24a", GOLD_D="#8a6a14", CYAN="#7de8ff", STEEL="#4a5470", GREEN="#3aff8a", RED="#e05a6a", PURPLE="#b07dff";
function roundRect(x,y,w,h,r){
  cx.beginPath();
  cx.moveTo(x+r,y); cx.arcTo(x+w,y,x+w,y+h,r); cx.arcTo(x+w,y+h,x,y+h,r);
  cx.arcTo(x,y+h,x,y,r); cx.arcTo(x,y,x+w,y,r); cx.closePath();
}
function padlockIcon(x,y,s,open,col){
  cx.strokeStyle=col; cx.fillStyle=col; cx.lineWidth=s*0.22;
  cx.beginPath();
  if(open) cx.arc(x-s*0.15,y-s*0.42,s*0.42, Math.PI, Math.PI*1.85);
  else     cx.arc(x,y-s*0.42,s*0.42, Math.PI, Math.PI*2);
  cx.stroke();
  roundRect(x-s*0.55,y-s*0.42+s*0.28,s*1.1,s*0.9,s*0.15); cx.fill();
}

/* ---------- persistence ---------- */
const store = {
  KEY_GAME: "lockboxx.game",
  KEY_HI:   "lockboxx.hi",
  loadGame(){ try{ return JSON.parse(localStorage.getItem(this.KEY_GAME)) || null; }catch(e){ return null; } },
  saveGame(o){ try{ localStorage.setItem(this.KEY_GAME, JSON.stringify(o)); }catch(e){} },
  wipe(){ try{ localStorage.removeItem(this.KEY_GAME); }catch(e){} },
  hi(){ try{ return +localStorage.getItem(this.KEY_HI)||0; }catch(e){ return 0; } },
  bumpHi(s){ if(s>this.hi()){ try{ localStorage.setItem(this.KEY_HI, String(s)); }catch(e){} } },
};
function nav(url){ try{ location.href = url; }catch(e){} }

/* ============================================================
   STATE
   ============================================================ */
let cfg = {};
const game = {
  mode:"play", score:0, balls:3, ballNum:1, mult:1,
  ballSaveT:0, shake:0,
};
let entry = {score:0, balls:3};    // snapshot on page load (for R restart)
const balls = [];                  // live play balls
const plunger = {charge:0, charging:false};
const PLUNGE_X = 448;

let slides = null;      // cutscene state: {imgs, idx, t}
const BRAND = "LOCKBOXX";
const LETTERS = [];     // collectible letters, filled from cfg.letters in init()
let msgs = [];
function showMsg(t1,t2,dur=2.2){ msgs = [{t1,t2,life:dur,max:dur}]; }
let particles = [];
function burst(x,y,col,n=14,sp=280){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, s=sp*(0.3+Math.random()*0.8);
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-60,life:.5+Math.random()*.4,col});
  }
}
function addScore(n, raw){ game.score += raw ? n : Math.round(n*game.mult); }

/* ============================================================
   GEOMETRY
   ============================================================ */
const SEGS=[], BUMPERS=[], FLIPPERS=[], SLINGS=[], RAILS=[];

function seg(x1,y1,x2,y2,opt={}){
  const s = {a:V(x1,y1), b:V(x2,y2), e:opt.e??0.45, ...opt};
  SEGS.push(s); return s;
}
function addBumper(x,y,r,opt={}){
  const bp = {x,y,r,flash:0,score:150,...opt}; BUMPERS.push(bp); return bp;
}
class Flipper{
  constructor(px,py,side,len=70){
    this.px=px; this.py=py; this.side=side; this.len=len; this.r=8;
    this.rest = side<0 ? 0.55 : Math.PI-0.55;
    this.end  = side<0 ? -0.44 : Math.PI+0.44;
    this.a = this.rest; this.av = 0; this.pressed=false;
  }
  update(dt){
    const target = this.pressed ? this.end : this.rest;
    const spd = this.pressed ? 16 : 11;
    const old = this.a;
    const d = target - this.a;
    this.a += Math.sign(d)*Math.min(Math.abs(d), spd*dt);
    this.av = (this.a-old)/dt;
  }
  tip(){ return V(this.px+Math.cos(this.a)*this.len, this.py+Math.sin(this.a)*this.len); }
}
function addFlipper(px,py,side,len){ const f=new Flipper(px,py,side,len); FLIPPERS.push(f); return f; }

function addSling(ax,ay,px,py,bx,by){
  const sl = {A:V(ax,ay), C:V(px,py), B:V(bx,by), flash:0};
  const s1 = seg(ax,ay,px,py,{e:0.6, kick:420}); s1.sl = sl;
  const s2 = seg(px,py,bx,by,{e:0.6, kick:420}); s2.sl = sl;
  SLINGS.push(sl); return sl;
}
/* point target: colored strip that scores on hit.
   opt: {score, color, label, once, cd, onHit, icon, vanish}
   vanish: once done, the target disappears entirely (no collision, no draw) */
function addTarget(x1,y1,x2,y2,opt={}){
  const s = seg(x1,y1,x2,y2,{e:0.7, target:true, score:3000, color:CYAN, cd:0.5, ...opt});
  s.cdT=0; s.flash=0; s.done=false;
  if(s.vanish && !s.enabled) s.enabled = ()=>!s.done;
  return s;
}
/* rail / tube: capture circle -> polyline transit -> exit velocity.
   opt: {pts, capture:{x,y,r}, exit:{x,y,vx,vy}|fn, speed, score, msg, color, enabled, visible, onRide, onExit} */
function addRail(opt){
  const r = {speed:620, color:"125,232,255", visible:true, width:22, ...opt};
  r.lens=[]; r.total=0;
  for(let i=0;i<r.pts.length-1;i++){
    const l = len(sub(r.pts[i+1],r.pts[i]));
    r.lens.push(l); r.total += l;
  }
  r.point = function(d){
    for(let i=0;i<r.lens.length;i++){
      if(d<=r.lens[i]) return add(r.pts[i], mul(sub(r.pts[i+1],r.pts[i]), d/r.lens[i]));
      d -= r.lens[i];
    }
    return r.pts[r.pts.length-1];
  };
  RAILS.push(r); return r;
}

/* standard bottom shell: outer walls, dome, plunger lane, funnels,
   main flippers, optional green slings */
function standardShell(opt={}){
  seg(16,214, 16,634);                    // left wall
  /* Funnels end INSIDE the flipper pivot, just above the blade, so a ball is
     always delivered onto the flipper top and rolls down to the center drain.
     There is no wall or ledge outside the pivot, so nothing can pin a ball
     against the pivot cap (the old wedge). */
  seg(16,634, 180,752);                   // left funnel -> onto the blade
  seg(432,240, 432,634);                  // plunger lane inner wall
  seg(432,634, 300,752);                  // right funnel -> onto the blade
  seg(464,214, 464,802);                  // right outer wall
  seg(430,802, 466,802, {e:0.3});         // plunger lane floor
  seg(430,244, 462,206, {oneway:norm(V(-36,-32)), e:0.2, hidden:true}); // lane one-way gate
  /* top dome */
  let px=null,py=null;
  const N=16;
  for(let i=0;i<=N;i++){
    const a=Math.PI - i*(Math.PI/N);
    const x=240+224*Math.cos(a), y=214-190*Math.sin(a);
    if(px!==null) seg(px,py,x,y,{e:0.4});
    px=x; py=y;
  }
  const L = addFlipper(162,772,-1), R = addFlipper(318,772,1);
  if(opt.slings!==false){
    addSling( 37,654, 104,670, 124,735);
    addSling(416,654, 356,673, 349,735);
  }
  return {flipL:L, flipR:R};
}

/* ============================================================
   BALLS & PHYSICS
   ============================================================ */
function makeBall(x,y,kind){ return {x,y,vx:0,vy:0,r:BALL_R,kind:kind||"play",trail:[],stillT:0,armed:false,rail:null}; }

function collideSeg(b, s){
  if(s.only && s.only!==b.kind) return;
  if(s.enabled && !s.enabled()) return;
  if(s.dynamic) s.dynamic(s);
  const ab = sub(s.b,s.a);
  const t = Math.max(0, Math.min(1, dot(sub(V(b.x,b.y),s.a),ab)/(dot(ab,ab)||1)));
  const cp = add(s.a, mul(ab,t));
  const d = sub(V(b.x,b.y), cp);
  const dist = len(d);
  if(dist >= b.r) return;
  let n = dist>0.0001 ? mul(d,1/dist) : V(0,-1);
  if(s.oneway){
    if(dot(sub(V(b.x,b.y),s.a), s.oneway) < 0) return;
    n = s.oneway;    // resolve toward the front so a crossing ball is ejected forward
  }
  b.x = cp.x + n.x*b.r; b.y = cp.y + n.y*b.r;
  const vn = b.vx*n.x + b.vy*n.y;
  if(vn < 0){
    const e = s.e ?? 0.45;
    b.vx -= (1+e)*vn*n.x; b.vy -= (1+e)*vn*n.y;
    const tvx = b.vx - (b.vx*n.x+b.vy*n.y)*n.x, tvy = b.vy - (b.vx*n.x+b.vy*n.y)*n.y;
    b.vx -= tvx*0.015; b.vy -= tvy*0.015;
    if(s.kick!==undefined && vn < -60){
      b.vx += n.x*s.kick; b.vy += n.y*s.kick;
      if(s.sl) s.sl.flash = 0.15;
      addScore(100); sfx.sling();
      burst(cp.x,cp.y,GREEN,6,200);
    }
    if(s.target && b.kind==="play" && !s.done && s.cdT<=0){
      s.cdT = s.cd; s.flash = 0.2;
      if(s.once) s.done = true;
      addScore(s.score);
      sfx.target();
      burst((s.a.x+s.b.x)/2,(s.a.y+s.b.y)/2,s.color,8,180);
    }
    if(s.onHit && b.kind==="play") s.onHit(s, b, vn);
  }
}
function collideBumper(b, bp){
  if(bp.enabled===false) return;
  const dx=b.x-bp.x, dy=b.y-bp.y;
  const d=Math.hypot(dx,dy), rr=b.r+bp.r;
  if(d>=rr || d===0) return;
  const nx=dx/d, ny=dy/d;
  b.x = bp.x+nx*rr; b.y = bp.y+ny*rr;
  const sp = Math.max(360, Math.hypot(b.vx,b.vy)*0.5+260);
  b.vx = nx*sp; b.vy = ny*sp;
  bp.flash = 0.18;
  addScore(bp.score);
  sfx.bumper();
  game.shake = Math.max(game.shake, 2);
  burst(bp.x+nx*bp.r, bp.y+ny*bp.r, bp.col||"#ff5a7a", 5, 180);
  if(bp.onHit) bp.onHit(bp, b);
}
function collideFlipper(b, f){
  /* collision starts a little along the blade: no dead bump at the pivot */
  const a = V(f.px+Math.cos(f.a)*6, f.py+Math.sin(f.a)*6), tip = f.tip();
  const ab = sub(tip,a);
  const t = Math.max(0, Math.min(1, dot(sub(V(b.x,b.y),a),ab)/(dot(ab,ab)||1)));
  const cp = add(a, mul(ab,t));
  const d = sub(V(b.x,b.y),cp);
  const dist = len(d), rr = b.r + f.r;
  if(dist>=rr) return;
  const n = dist>0.0001 ? mul(d,1/dist) : V(0,-1);
  b.x = cp.x+n.x*rr; b.y = cp.y+n.y*rr;
  const rx = cp.x-f.px, ry = cp.y-f.py;
  const sv = V(-ry*f.av, rx*f.av);
  const rel = V(b.vx-sv.x, b.vy-sv.y);
  const vn = dot(rel,n);
  if(vn<0){
    const e = Math.abs(f.av)>2 ? 0.55 : 0.25;
    b.vx -= (1+e)*vn*n.x; b.vy -= (1+e)*vn*n.y;
  }
}
function collideBalls(a,b,onHit){
  const dx=b.x-a.x, dy=b.y-a.y;
  const d=Math.hypot(dx,dy), rr=a.r+b.r;
  if(d>=rr || d===0) return;
  const nx=dx/d, ny=dy/d;
  const overlap=(rr-d)/2;
  a.x-=nx*overlap; a.y-=ny*overlap;
  b.x+=nx*overlap; b.y+=ny*overlap;
  const rvx=b.vx-a.vx, rvy=b.vy-a.vy;
  const vn=rvx*nx+rvy*ny;
  if(vn<0){
    const j=-(1+0.9)*vn/2;
    a.vx-=j*nx; a.vy-=j*ny;
    b.vx+=j*nx; b.vy+=j*ny;
    if(onHit) onHit(-vn);
  }
}
function stepBall(b, dt){
  b.vy += GRAV*dt;
  const v = Math.hypot(b.vx,b.vy);
  if(v>MAXV){ b.vx*=MAXV/v; b.vy*=MAXV/v; }
  b.vx *= (1-0.06*dt); b.vy *= (1-0.06*dt);
  b.x += b.vx*dt; b.y += b.vy*dt;
  for(const s of SEGS) collideSeg(b,s);
  for(const bp of BUMPERS) collideBumper(b,bp);
  for(const f of FLIPPERS) collideFlipper(b,f);
}

/* ---------- ball management ---------- */
function armedBall(){ return balls.find(b=>b.armed) || null; }
function serve(){
  const b = makeBall(PLUNGE_X, 780);
  b.armed = true; plunger.charge = 0; plunger.charging = false;
  balls.push(b);
  return b;
}
function addBall(x,y,vx,vy){
  const b = makeBall(x,y);
  b.vx=vx||0; b.vy=vy||0;
  balls.push(b); return b;
}
function removeBall(b){
  const i = balls.indexOf(b);
  if(i>=0) balls.splice(i,1);
}
function launch(){
  const b = armedBall();
  if(!b) return;
  const p = 0.35 + 0.65*plunger.charge;
  b.vy = -(760 + 900*p); b.vx = 0;
  b.armed = false; plunger.charge = 0;
  game.ballSaveT = 8;
  sfx.launch();
}
function drained(b){
  removeBall(b);
  if(balls.length>0){
    sfx.drain();
    showMsg("ONE BALL DOWN", balls.length>1?"MULTIBALL CONTINUES":"MULTIBALL ENDS",1.6);
    return;
  }
  if(game.ballSaveT>0){
    sfx.chain();
    showMsg("BALL SAVED","SHOOT AGAIN",2);
    serve(); game.ballSaveT = 0;
    return;
  }
  sfx.drain();
  game.balls--;
  if(game.balls<=0){
    gameOver();
  } else {
    game.ballNum++;
    showMsg("BALL LOST","BALL "+game.ballNum,2);
    serve();
  }
}

/* ---------- game flow ---------- */
function startLevel(){
  game.mode="play";
  slides = null;
  for(const lt of LETTERS) lt.got = false;
  game.score = entry.score; game.balls = entry.balls;
  game.ballNum = 1; game.mult = 1;
  game.ballSaveT = 0; game.shake = 0;
  balls.length = 0;
  particles.length=0; msgs.length=0;
  if(cfg.reset) cfg.reset();
  serve();
  if(cfg.intro) showMsg(cfg.intro[0], cfg.intro[1], 3);
}
function levelComplete(){
  if(game.mode!=="play") return;
  store.bumpHi(game.score);
  if(cfg.next){
    game.mode = "won";
    store.saveGame({score:game.score, balls:game.balls, level:(cfg.level||1)+1});
  } else {
    game.mode = "done";
    store.wipe();
  }
  sfx.win();
  game.shake = 12;
}
function gameOver(){
  game.mode = "over";
  store.bumpHi(game.score);
  store.wipe();
}

/* ============================================================
   INPUT
   ============================================================ */
function press(side,on){
  let hit=false;
  /* f.ctl overrides which button drives a flipper (for inverse/center flippers
     whose geometric side differs from the side of the button that fires them) */
  for(const f of FLIPPERS) if((f.ctl??f.side)===side){ if(on&&!f.pressed) hit=true; f.pressed=on; }
  if(hit) sfx.flip();
}
function startCutscene(){
  slides = {idx:0, t:0, imgs:[]};
  if(typeof Image!=="undefined"){
    for(let i=1;i<=3;i++){
      const im = new Image();
      im.src = cfg.slides+"/slide"+i+".png";
      slides.imgs.push(im);
    }
  }
  game.mode = "cutscene";
  sfx.unlock();
}
function advanceScreen(){
  if(game.mode==="won" && cfg.next){
    if(cfg.slides) startCutscene();
    else nav(cfg.next);
  }
  else if(game.mode==="cutscene"){
    slides.idx++; slides.t=0;
    if(slides.idx>=3) nav(cfg.next);
    else sfx.target();
  }
  else if(game.mode==="done") nav("index.html");
  else if(game.mode==="over") nav("index.html");
}
window.addEventListener("keydown", e=>{
  if(e.repeat) return;
  audio(); startMusic();
  const k = e.code;
  if(k==="KeyS"){ toggleMusic(); return; }
  if(k==="ArrowLeft"||k==="KeyZ"||k==="KeyA"){ press(-1,true); e.preventDefault(); }
  if(k==="ArrowRight"||k==="KeyM"||k==="KeyL"){ press(1,true); e.preventDefault(); }
  if(k==="Space"||k==="ArrowDown"){
    e.preventDefault();
    if(game.mode!=="play"){ advanceScreen(); return; }
    if(armedBall()) plunger.charging = true;
  }
  if(k==="KeyR") startLevel();
});
window.addEventListener("keyup", e=>{
  const k = e.code;
  if(k==="ArrowLeft"||k==="KeyZ"||k==="KeyA") press(-1,false);
  if(k==="ArrowRight"||k==="KeyM"||k==="KeyL") press(1,false);
  if((k==="Space"||k==="ArrowDown") && plunger.charging){ plunger.charging=false; launch(); }
});
/* on-screen flipper buttons (mobile): tap = one full flip that auto-releases,
   so the same button can be tapped repeatedly with no stuck state */
const isTouch = (typeof navigator!=="undefined" && navigator.maxTouchPoints>0) ||
                (typeof window!=="undefined" && "ontouchstart" in window);
const BTNS = [
  {side:-1, x:56,  y:TH-64, r:36},
  {side: 1, x:424, y:TH-64, r:36},
];
const btnT = {"-1":0, "1":0};
function tapFlip(side){
  press(side, true);
  btnT[side] = 0.28;
}
const touches = {};
cv.addEventListener("pointerdown", e=>{
  audio(); startMusic(); e.preventDefault();
  if(game.mode!=="play"){ advanceScreen(); return; }
  const rect = cv.getBoundingClientRect();
  const sc = TW / (rect.width || TW);
  const x = (e.clientX-rect.left)*sc, y = (e.clientY-rect.top)*sc;
  for(const b of BTNS){
    if(Math.hypot(x-b.x, y-b.y) <= b.r+10){ tapFlip(b.side); return; }
  }
  if(armedBall()){ plunger.charging = true; touches[e.pointerId]="plunge"; return; }
});
cv.addEventListener("pointerup", e=>{
  const t = touches[e.pointerId]; delete touches[e.pointerId];
  if(t==="plunge"){ if(plunger.charging){ plunger.charging=false; launch(); } }
});
cv.addEventListener("pointercancel", e=>{
  const t = touches[e.pointerId]; delete touches[e.pointerId];
  if(t==="plunge") plunger.charging=false;
});

/* ============================================================
   PHYSICS LOOP
   ============================================================ */
let acc=0;
function physics(dt){
  acc += dt;
  while(acc >= STEP){
    acc -= STEP;
    for(const f of FLIPPERS) f.update(STEP);
    if(game.mode!=="play") continue;
    if(cfg.tick) cfg.tick(STEP);

    for(let i=balls.length-1;i>=0;i--){
      const b = balls[i];
      if(b.armed){
        if(plunger.charging) plunger.charge = Math.min(1, plunger.charge + STEP/1.1);
        b.x = PLUNGE_X; b.y = 780 + plunger.charge*16;
        b.vx = b.vy = 0;
        continue;
      }
      if(b.rail){
        b.rail.d += b.rail.rail.speed*STEP;
        const r = b.rail.rail;
        const p = r.point(Math.min(b.rail.d, r.total));
        b.x=p.x; b.y=p.y; b.vx=0; b.vy=0;
        if(b.rail.d >= r.total){
          const e = typeof r.exit==="function" ? r.exit() : r.exit;
          if(e){ if(e.x!==undefined){b.x=e.x; b.y=e.y;} b.vx=e.vx||0; b.vy=e.vy||0; }
          if(r.onExit) r.onExit(b);
          b.rail = null;
        }
        continue;
      }
      stepBall(b, STEP);
      /* rail capture */
      for(const r of RAILS){
        if(b.rail) break;
        if(r.enabled && !r.enabled()) continue;
        const c = r.capture;
        if(Math.hypot(b.x-c.x, b.y-c.y) < c.r){
          b.rail = {rail:r, d:0};
          if(r.score) addScore(r.score);
          if(r.msg) showMsg(r.msg[0], r.msg[1], 1.6);
          if(r.onRide) r.onRide(b);
          sfx.unlock();
        }
      }
      if(b.rail) continue;
      /* LOCKBOXX letter collection */
      for(let li=0;li<LETTERS.length;li++){
        const lt = LETTERS[li];
        if(lt.got || Math.hypot(b.x-lt.x, b.y-lt.y) >= 23) continue;
        lt.got = true;
        addScore(5000);
        burst(lt.x, lt.y, GOLD, 10, 220);
        tone(520+li*70, .12, "square", .06, 60);
        if(LETTERS.every(l=>l.got)){
          addScore(100000);
          sfx.fanfare();
          game.shake = Math.max(game.shake, 8);
          showMsg("LOCKBOXX COMPLETE!","+100,000 BONUS",2.6);
        }
      }
      /* level hook: custom captures / win checks. "remove" deletes the ball */
      if(cfg.ballStep){
        const r = cfg.ballStep(b);
        if(r==="remove"){ removeBall(b); continue; }
      }
      /* plunger lane: re-arm single ball, auto-launch during multiball */
      if(b.x>432 && b.y>760 && Math.abs(b.vy)<24 && Math.abs(b.vx)<24){
        if(balls.length===1 && !armedBall()){ b.armed=true; plunger.charge=0; }
        else if(balls.length>1){ b.vy=-1600; sfx.launch(); }
      }
      if(b.y > TH+30){ drained(b); continue; }
      /* stuck-ball failsafe */
      if(Math.hypot(b.vx,b.vy)<6){
        b.stillT += STEP;
        if(b.stillT>2.5){ b.vx += (Math.random()-0.5)*120; b.vy -= 90; b.stillT=0; }
      } else b.stillT = 0;
    }
    /* ball-ball collisions (all pairs) */
    for(let i=0;i<balls.length;i++)
      for(let j=i+1;j<balls.length;j++)
        if(!balls[i].armed && !balls[j].armed && !balls[i].rail && !balls[j].rail)
          collideBalls(balls[i], balls[j]);
  }
  /* frame-rate animations */
  if(cfg.update) cfg.update(dt);
  if(game.ballSaveT>0) game.ballSaveT -= dt;
  game.shake = Math.max(0, game.shake - dt*30);
  for(const sl of SLINGS) if(sl.flash>0) sl.flash -= dt;
  for(const s of SEGS){ if(s.cdT>0) s.cdT -= dt; if(s.flash>0) s.flash -= dt; }
  for(const bp of BUMPERS) if(bp.flash>0) bp.flash -= dt;
  /* tap-flip auto-release */
  for(const s of [-1,1]){
    if(btnT[s]>0){
      btnT[s] -= dt;
      if(btnT[s]<=0) press(s,false);
    }
  }
  /* cutscene slides auto-advance: 1 second per slide */
  if(game.mode==="cutscene" && slides){
    slides.t += dt;
    if(slides.t >= 1){
      slides.idx++; slides.t = 0;
      if(slides.idx>=3) nav(cfg.next);
      else sfx.target();
    }
  }
  msgs = msgs.filter(m=>(m.life-=dt)>0);
  particles = particles.filter(p=>{
    p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 700*dt;
    return p.life>0;
  });
}

/* ============================================================
   RENDER
   ============================================================ */
function drawBall(b,hi){
  const g=cx.createRadialGradient(b.x-3,b.y-3,1,b.x,b.y,b.r);
  g.addColorStop(0,hi||"#f0f2f8"); g.addColorStop(0.5,"#9aa2b8"); g.addColorStop(1,"#4a5064");
  cx.fillStyle=g;
  cx.beginPath(); cx.arc(b.x,b.y,b.r,0,7); cx.fill();
}
function drawTable(t){
  const bg = cx.createLinearGradient(0,0,0,TH);
  const base = cfg.bg || ["#141826","#10131f","#0a0c14"];
  bg.addColorStop(0,base[0]); bg.addColorStop(0.5,base[1]); bg.addColorStop(1,base[2]);
  cx.fillStyle = bg; cx.fillRect(0,0,TW,TH);
  cx.fillStyle = "rgba(255,255,255,0.03)";
  for(let y=60;y<TH;y+=64) for(let x=40;x<TW;x+=64){ cx.beginPath(); cx.arc(x,y,2.5,0,7); cx.fill(); }
  /* vertical LOCKBOXX branding — collected letters light up and glow */
  cx.font="bold 38px Courier New"; cx.textAlign="center";
  for(let i=0;i<BRAND.length;i++){
    if(LETTERS[i] && LETTERS[i].got){
      cx.shadowColor=GOLD; cx.shadowBlur=14+6*Math.sin(t*5+i);
      cx.fillStyle=`rgba(255,220,110,${0.8+0.2*Math.sin(t*5+i)})`;
    } else {
      cx.shadowBlur=0;
      cx.fillStyle="rgba(255,210,74,0.10)";
    }
    cx.fillText(BRAND[i], 240, 404+i*42);
  }
  cx.shadowBlur=0;

  /* rails / tubes */
  for(const r of RAILS){
    if(r.visible===false) continue;
    const on = balls.some(b=>b.rail && b.rail.rail===r);
    const locked = r.enabled && !r.enabled();
    cx.lineJoin="round"; cx.lineCap="round";
    cx.strokeStyle=`rgba(${r.color},${locked?0.05:0.09})`; cx.lineWidth=r.width;
    cx.beginPath(); r.pts.forEach((p,i)=> i?cx.lineTo(p.x,p.y):cx.moveTo(p.x,p.y)); cx.stroke();
    cx.strokeStyle=`rgba(${r.color},${on?0.7:(locked?0.12:0.28)})`; cx.lineWidth=2;
    cx.beginPath(); r.pts.forEach((p,i)=> i?cx.lineTo(p.x,p.y):cx.moveTo(p.x,p.y)); cx.stroke();
    /* capture mouth */
    const c=r.capture;
    cx.fillStyle=`rgba(${r.color},${locked?0.08:0.20})`;
    cx.beginPath(); cx.arc(c.x,c.y,c.r,0,7); cx.fill();
    if(!locked){
      cx.strokeStyle=`rgba(${r.color},${0.4+0.3*Math.sin(t*6)})`; cx.lineWidth=2;
      cx.beginPath(); cx.arc(c.x,c.y,c.r,0,7); cx.stroke();
    }
  }

  if(cfg.drawUnder) cfg.drawUnder(t, cx);

  /* floating LOCKBOXX letter tokens */
  for(let i=0;i<LETTERS.length;i++){
    const lt = LETTERS[i];
    if(lt.got) continue;
    const bob = Math.sin(t*2+i)*3;
    cx.shadowColor=GOLD; cx.shadowBlur=8+4*Math.sin(t*4+i);
    cx.fillStyle="rgba(255,210,74,0.14)";
    cx.beginPath(); cx.arc(lt.x, lt.y+bob, 11, 0, 7); cx.fill();
    cx.strokeStyle="rgba(255,210,74,0.75)"; cx.lineWidth=1.5;
    cx.beginPath(); cx.arc(lt.x, lt.y+bob, 11, 0, 7); cx.stroke();
    cx.shadowBlur=0;
    cx.fillStyle=GOLD; cx.font="bold 13px Courier New"; cx.textAlign="center";
    cx.fillText(lt.ch, lt.x, lt.y+bob+4.5);
  }

  /* point targets */
  for(const s of SEGS){
    if(!s.target || s.nodraw) continue;
    if(s.vanish && s.done) continue;
    const mx=(s.a.x+s.b.x)/2, my=(s.a.y+s.b.y)/2;
    const ang=Math.atan2(s.b.y-s.a.y, s.b.x-s.a.x);
    const hot=s.flash>0, off=s.done;
    cx.save(); cx.translate(mx,my); cx.rotate(ang);
    if(!off){ cx.shadowColor=s.color; cx.shadowBlur = hot? 18 : 5+5*(0.5+0.5*Math.sin(t*3+mx)); }
    cx.fillStyle = off? "#2c3448" : (hot? "#ffffff" : s.color);
    cx.globalAlpha = off?1:(hot?1:0.75);
    roundRect(-20,-6,40,12,3); cx.fill();
    cx.globalAlpha = 1; cx.shadowBlur=0;
    cx.strokeStyle = off? "#59637f" : "#ffffff"; cx.lineWidth=1.5;
    roundRect(-20,-6,40,12,3); cx.stroke();
    if(s.icon==="lock") padlockIcon(0,2,7,off,off?"#59637f":"#3a2c06");
    else {
      cx.fillStyle = off? "#59637f" : "#0a1016";
      cx.font="bold 9px Courier New"; cx.textAlign="center";
      cx.fillText(s.label||Math.round(s.score/1000)+"K", 0, 3);
    }
    cx.restore();
  }

  /* slings */
  for(const sl of SLINGS){
    const hot = sl.flash>0;
    const g = cx.createLinearGradient(sl.C.x,sl.C.y,(sl.A.x+sl.B.x)/2,(sl.A.y+sl.B.y)/2);
    g.addColorStop(0, hot? "#d8ffe8" : "#2ed579");
    g.addColorStop(1, hot? "#2ed579" : "#0a4a28");
    cx.fillStyle=g;
    cx.shadowColor=GREEN; cx.shadowBlur = hot? 24 : 9+4*Math.sin(t*3);
    cx.beginPath();
    cx.moveTo(sl.A.x,sl.A.y); cx.lineTo(sl.C.x,sl.C.y); cx.lineTo(sl.B.x,sl.B.y);
    cx.closePath(); cx.fill();
    cx.shadowBlur=0;
    cx.strokeStyle = hot? "#ffffff" : "#7dffb0"; cx.lineWidth=4; cx.lineJoin="round";
    cx.beginPath();
    cx.moveTo(sl.A.x,sl.A.y); cx.lineTo(sl.C.x,sl.C.y); cx.lineTo(sl.B.x,sl.B.y);
    cx.stroke();
  }

  /* bumpers */
  for(const bp of BUMPERS){
    if(bp.enabled===false) continue;
    if(bp.draw){ bp.draw(bp, t, cx); continue; }
    const f = Math.max(0,bp.flash)/0.18;
    const g=cx.createRadialGradient(bp.x-5,bp.y-6,3,bp.x,bp.y,bp.r);
    g.addColorStop(0, f>0? "#ffe0e8":"#8892b0");
    g.addColorStop(0.7, f>0? (bp.col||"#ff5a7a"):"#3c4460");
    g.addColorStop(1,"#20263a");
    cx.fillStyle=g;
    cx.beginPath(); cx.arc(bp.x,bp.y,bp.r,0,7); cx.fill();
    if(bp.col){                       // colored bumper: tinted body + colored ring
      cx.globalAlpha = f>0 ? 0.45 : 0.26;
      cx.fillStyle = bp.col;
      cx.beginPath(); cx.arc(bp.x,bp.y,bp.r-1,0,7); cx.fill();
      cx.globalAlpha = 1;
    }
    cx.strokeStyle= f>0 ? (bp.col?"#ffffff":"#ffb0c0") : (bp.col||"#59637f"); cx.lineWidth=3;
    cx.beginPath(); cx.arc(bp.x,bp.y,bp.r-3,0,7); cx.stroke();
    cx.fillStyle= f>0 ? "#fff" : "#aab4d0"; cx.font="bold 11px Courier New"; cx.textAlign="center";
    cx.fillText(String(bp.score), bp.x, bp.y+4);
  }

  /* flippers (drawn from the same recessed base the physics uses; no pivot cap) */
  for(const f of FLIPPERS){
    const tip=f.tip();
    const bx=f.px+Math.cos(f.a)*6, by=f.py+Math.sin(f.a)*6;
    cx.strokeStyle="#ffb84a"; cx.lineWidth=f.r*2; cx.lineCap="round";
    cx.beginPath(); cx.moveTo(bx,by); cx.lineTo(tip.x,tip.y); cx.stroke();
    cx.strokeStyle="#8a5a10"; cx.lineWidth=f.r*2-6;
    cx.beginPath(); cx.moveTo(bx,by); cx.lineTo(tip.x,tip.y); cx.stroke();
  }

  /* walls — drawn OVER bumpers and flippers so junctions read sealed,
     with no fake divots where a wall tucks under a round edge */
  cx.lineWidth=4; cx.lineCap="round";
  for(const s of SEGS){
    if(s.hidden||s.kick!==undefined||s.target||s.nodraw) continue;
    if(s.enabled && !s.enabled()) continue;
    if(s.dynamic) s.dynamic(s);
    cx.strokeStyle = s.col || STEEL;
    cx.beginPath(); cx.moveTo(s.a.x,s.a.y); cx.lineTo(s.b.x,s.b.y); cx.stroke();
  }

  /* plunger */
  const ab = armedBall();
  if(ab){
    cx.fillStyle="#c04a5a";
    cx.fillRect(PLUNGE_X-8, 792+plunger.charge*16, 16, 8);
    cx.fillStyle="#7a2a36";
    cx.fillRect(PLUNGE_X-3, 798+plunger.charge*16, 6, 40);
    if(plunger.charge>0){ cx.fillStyle=GOLD; cx.fillRect(438,700-80*plunger.charge,4,80*plunger.charge); }
    cx.fillStyle="rgba(255,255,255,0.5)"; cx.font="9px Courier New"; cx.textAlign="center";
    cx.save(); cx.translate(452,700); cx.rotate(-Math.PI/2);
    cx.fillText(plunger.charging?"":"HOLD SPACE", 0, 0); cx.restore();
  }

  /* balls */
  for(const b of balls){
    b.trail.push({x:b.x,y:b.y});
    if(b.trail.length>8) b.trail.shift();
    for(let i=0;i<b.trail.length;i++){
      cx.fillStyle=`rgba(180,200,255,${i/b.trail.length*0.15})`;
      cx.beginPath(); cx.arc(b.trail[i].x,b.trail[i].y,b.r*(0.4+0.6*i/b.trail.length),0,7); cx.fill();
    }
    drawBall(b);
  }

  /* particles */
  for(const p of particles){
    cx.globalAlpha=Math.max(0,p.life*2);
    cx.fillStyle=p.col;
    cx.fillRect(p.x-2,p.y-2,4,4);
  }
  cx.globalAlpha=1;

  if(cfg.drawOver) cfg.drawOver(t, cx);
}
function drawHUD(t){
  cx.fillStyle="rgba(6,8,14,0.82)";
  cx.fillRect(0,0,TW,34);
  cx.fillStyle=GOLD; cx.font="bold 16px Courier New"; cx.textAlign="left";
  cx.fillText(String(game.score).padStart(9,"0"), 12, 22);
  cx.fillStyle="#59637f"; cx.font="bold 9px Courier New";
  cx.fillText("HI "+store.hi(), 12, 31);
  cx.fillStyle=CYAN; cx.font="bold 11px Courier New"; cx.textAlign="center";
  cx.fillText("LVL "+(cfg.level||1), 158, 21);
  if(game.mult>1){
    cx.fillStyle=GOLD; cx.font="bold 12px Courier New";
    cx.fillText("x"+game.mult.toFixed(1), 200, 21);
  }
  if(balls.length>1){ cx.fillStyle="#7dffa0"; cx.font="bold 10px Courier New"; cx.fillText("MB", 232, 21); }
  cx.fillStyle="#9aa4c0"; cx.textAlign="right"; cx.font="bold 13px Courier New";
  cx.fillText("BALL "+game.ballNum+"  ("+Math.max(0,game.balls-1)+" left)", TW-10, 22);
  if(cfg.drawHUD) cfg.drawHUD(t, cx);
  if(game.ballSaveT>0 && game.mode==="play"){
    cx.fillStyle=`rgba(125,255,160,${0.5+0.5*Math.sin(t*8)})`;
    cx.font="bold 10px Courier New"; cx.textAlign="center";
    cx.fillText("BALL SAVE", 240, 46);
  }
  cx.fillStyle="rgba(154,164,192,0.55)"; cx.font="10px Courier New"; cx.textAlign="center";
  cx.fillText("Z / ←  LEFT    M / →  RIGHT    SPACE  PLUNGER    S  MUSIC    R  RESTART", 224, TH-8);
  /* mobile flipper buttons */
  if(isTouch && game.mode==="play"){
    for(const b of BTNS){
      const active = btnT[b.side]>0;
      cx.globalAlpha = active ? 0.95 : 0.45;
      cx.fillStyle = active ? "rgba(255,210,74,0.35)" : "rgba(30,36,54,0.7)";
      cx.beginPath(); cx.arc(b.x,b.y,b.r,0,7); cx.fill();
      cx.strokeStyle = active ? GOLD : "#59637f"; cx.lineWidth=3;
      cx.beginPath(); cx.arc(b.x,b.y,b.r,0,7); cx.stroke();
      /* flip arrow */
      cx.strokeStyle = active ? "#ffffff" : GOLD; cx.lineWidth=5; cx.lineCap="round";
      cx.beginPath();
      cx.moveTo(b.x - b.side*14, b.y+10);
      cx.lineTo(b.x + b.side*10, b.y+2);
      cx.lineTo(b.x + b.side*2,  b.y-14);
      cx.stroke();
      cx.globalAlpha = 1;
    }
  }
  for(const m of msgs){
    const a = Math.min(1, m.life/0.4, (m.max-m.life)/0.2+1);
    cx.globalAlpha=Math.max(0,Math.min(1,a));
    cx.fillStyle="rgba(6,8,14,0.75)";
    roundRect(60,430,360,64,8); cx.fill();
    cx.strokeStyle=GOLD; cx.lineWidth=1.5; roundRect(60,430,360,64,8); cx.stroke();
    cx.fillStyle=GOLD; cx.font="bold 20px Courier New"; cx.textAlign="center";
    cx.fillText(m.t1, 240, 458);
    cx.fillStyle=CYAN; cx.font="bold 12px Courier New";
    cx.fillText(m.t2, 240, 480);
    cx.globalAlpha=1;
  }
}
function drawOverlay(t){
  if(game.mode==="cutscene"){
    cx.fillStyle="#000"; cx.fillRect(0,0,TW,TH);
    const im = slides.imgs[slides.idx];
    if(im && im.complete && im.naturalWidth){
      const s = Math.min(TW/im.naturalWidth, TH/im.naturalHeight)*0.96;
      const w = im.naturalWidth*s, h = im.naturalHeight*s;
      cx.globalAlpha = Math.min(1, slides.t*3);
      cx.drawImage(im, (TW-w)/2, (TH-h)/2 - 30, w, h);
      cx.globalAlpha = 1;
    }
    cx.textAlign="center";
    for(let i=0;i<3;i++){
      cx.fillStyle = i===slides.idx ? GOLD : "#333b52";
      cx.beginPath(); cx.arc(216+i*24, TH-90, 5, 0, 7); cx.fill();
    }
    return;
  }
  cx.fillStyle="rgba(5,6,10,0.8)";
  cx.fillRect(0,0,TW,TH);
  cx.textAlign="center";
  const blink = `rgba(255,210,74,${0.5+0.5*Math.sin(t*4)})`;
  if(game.mode==="won"){
    cx.fillStyle=CYAN; cx.font="bold 34px Courier New";
    cx.fillText("LEVEL "+(cfg.level||1)+" CLEARED!", 240, 300);
    cx.fillStyle="#fff"; cx.font="bold 18px Courier New";
    cx.fillText("SCORE  "+game.score.toLocaleString(), 240, 360);
    cx.fillStyle="#9aa4c0"; cx.font="13px Courier New";
    let y=410;
    if(cfg.wonStats) for(const line of cfg.wonStats()){ cx.fillText(line, 240, y); y+=20; }
    cx.fillStyle="#59637f"; cx.font="12px Courier New";
    cx.fillText("HIGH SCORE  "+store.hi().toLocaleString(), 240, y+20);
    cx.fillStyle=blink; cx.font="bold 16px Courier New";
    cx.fillText("PRESS SPACE FOR LEVEL "+((cfg.level||1)+1), 240, 600);
  } else if(game.mode==="over"){
    cx.fillStyle=RED; cx.font="bold 38px Courier New";
    cx.fillText("GAME OVER", 240, 320);
    cx.fillStyle="#fff"; cx.font="bold 18px Courier New";
    cx.fillText("SCORE  "+game.score.toLocaleString(), 240, 380);
    cx.fillStyle="#9aa4c0"; cx.font="13px Courier New";
    cx.fillText("HIGH SCORE  "+store.hi().toLocaleString(), 240, 410);
    cx.fillStyle=blink; cx.font="bold 15px Courier New";
    cx.fillText("PRESS SPACE FOR TITLE", 240, 470);
  } else if(game.mode==="done"){
    if(cfg.drawFinale) cfg.drawFinale(t, cx);
    else {
      cx.fillStyle=GOLD; cx.font="bold 34px Courier New";
      cx.fillText("GAME COMPLETE!", 240, 320);
      cx.fillStyle="#fff"; cx.font="bold 18px Courier New";
      cx.fillText("SCORE  "+game.score.toLocaleString(), 240, 380);
      cx.fillStyle=blink; cx.font="bold 15px Courier New";
      cx.fillText("PRESS SPACE FOR TITLE", 240, 470);
    }
  }
}

/* ---------- main loop ---------- */
let lastT=0;
function frame(ts){
  const t = ts/1000;
  const dt = Math.min(1/30, lastT? t-lastT : 1/60);
  lastT = t;
  physics(dt);
  cx.save();
  if(game.shake>0)
    cx.translate((Math.random()-0.5)*game.shake, (Math.random()-0.5)*game.shake);
  drawTable(t);
  drawHUD(t);
  cx.restore();
  if(game.mode!=="play") drawOverlay(t);
  requestAnimationFrame(frame);
}

/* ---------- init ---------- */
function init(c){
  cfg = c || {};
  LETTERS.length = 0;
  for(let i=0;i<(cfg.letters||[]).length && i<BRAND.length;i++)
    LETTERS.push({x:cfg.letters[i][0], y:cfg.letters[i][1], ch:BRAND[i], got:false});
  const saved = store.loadGame();
  entry.score = saved ? (saved.score||0) : 0;
  entry.balls = saved ? (saved.balls??3) : 3;
  startLevel();
  requestAnimationFrame(frame);
}

/* ---------- public API ---------- */
return {
  TW,TH,GRAV,STEP,BALL_R,
  V,sub,add,mul,dot,len,norm,
  roundRect, padlockIcon, tone, sfx,
  colors:{GOLD,GOLD_D,CYAN,STEEL,GREEN,RED,PURPLE},
  seg, addBumper, addFlipper, addSling, addTarget, addRail, standardShell,
  makeBall, stepBall, collideBalls, drawBall,
  balls, game, plunger, rails:RAILS, segs:SEGS, bumpers:BUMPERS, flippers:FLIPPERS, letters:LETTERS,
  addScore, showMsg, burst,
  serve, launch, addBall, removeBall, armedBall,
  startLevel, levelComplete, gameOver, advanceScreen, tapFlip,
  physics, init, store, ctx:cx,
};
})();
if(typeof window!=="undefined") window.PB = PB;
