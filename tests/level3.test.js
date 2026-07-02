// @page level3.html
/* Level 3 (Haunted Castle great hall) gameplay tests. */
const assert = global.__assert;
function sim(s){ for(let i=0;i<Math.round(s*60);i++) PB.physics(1/60); }
function place(x,y,vx,vy){
  const b = PB.balls[0];
  b.armed=false; b.x=x; b.y=y; b.vx=vx||0; b.vy=vy||0; b.stillT=0;
  return b;
}
function shootPillar(i){
  L.time = 0.6;                    // gargoyle (if awake) is in its open phase
  const p = PILLARS[i];
  place(p.x, p.y+70, 0, -700);
  sim(0.5);
}
/* scripted tests stun the mage so random fireballs can't deflect shots */
function freshRun(){ PB.startLevel(); PB.game.balls=99; L.mageStun=1e9; }

/* --- inverse center flippers: half size, cross-mapped controls --- */
const inv = PB.flippers.filter(f=>f.ctl!==undefined);
assert(inv.length===2 && inv.every(f=>f.px===240 && f.py===440), "inverse flipper pair hinged at screen center");
assert(inv.every(f=>f.ctl===-f.side), "inverse flippers fire on the same-side buttons as the main pair");
assert(inv.every(f=>f.len*2===PB.flippers[0].len), "inverse flippers are half the size of the main pair");

/* --- mage king: massive points on a hit, then a cooldown --- */
freshRun();
L.mageStun=0;                      // this test wants the real stun behavior
{
  const s0=PB.game.score;
  place(240,230,0,-700);
  sim(0.5);
  assert(PB.game.score>=s0+100000, "mage king hit pays 100,000");
  assert(L.mageCd>0 && L.mageStun>0, "mage stunned after a hit");
}

/* --- fireball knocks the ball off course --- */
PB.startLevel(); PB.game.balls=99; L.mageStun=1e9;
{
  const b=place(240,430,0,0);
  L.fireballs.push({x:b.x,y:b.y-10,vx:0,vy:85,life:12});   // overlapping -> detonates next tick
  sim(0.3);
  assert(L.fireballs.length===0, "fireball detonates on the ball");
  assert(Math.hypot(b.vx,b.vy)>200 || b.y>460, "fireball knocks the ball away");
}

/* --- pillars fall in order; each awakens its haunt --- */
freshRun();
shootPillar(2);
assert(L.f===0 && L.fh===0, "only the lit pillar takes damage");
for(let i=0;i<4;i++){
  let guard=0;
  while(L.f===i && guard++<10) shootPillar(i);
  assert(L.f===i+1, "pillar "+(i+1)+" destroyed after repeated hits");
  if(i===0) assert(SKULLS.every(s=>s.skull), "F1: skeleton bumpers awaken");
}
assert(PILLARS.every(p=>p.enabled===false), "destroyed pillars leave the hall (non-blocking)");
/* --- collapse, then the throne portal clears the level --- */
sim(3);
assert(L.collapseT>0.7, "castle collapse animation completes");
place(240,280,0,-600);
let won=false;
for(let i=0;i<240;i++){ PB.physics(1/60); if(PB.game.mode==="won"){won=true;break;} }
assert(won, "throne portal shot clears the level");
const saved = JSON.parse(localStorage.getItem("lockboxx.game"));
assert(saved && saved.level===4, "run saved to storage for level 4");
PB.advanceScreen();
assert(PB.game.mode==="cutscene", "status page advances into the cutscene slides");
for(let i=0;i<Math.round(60*3.5);i++) PB.physics(1/60);   // slides auto-advance, 1s each
assert(location.href==="level4.html", "after 3 slides the game jumps to level 4");

/* --- ghost portal only opens after F2 and drops from above --- */
freshRun();
place(60,330,0,0);
let earlyRide=false;
for(let i=0;i<40;i++){ PB.physics(1/60); if(PB.balls[0] && PB.balls[0].rail){earlyRide=true;break;} }
assert(!earlyRide, "ghost portal closed before foundation 2");
for(let i=0;i<2;i++){ let g=0; while(L.f===i && g++<10) shootPillar(i); }
assert(L.f>=2, "two foundations down");
place(60,330,0,0);
let rode=false;
for(let i=0;i<90;i++){ PB.physics(1/60); if(PB.balls[0] && PB.balls[0].rail){rode=true;break;} }
assert(rode, "ghost portal captures the ball after F2");
let dropMinY=999;
for(let i=0;i<120;i++){ PB.physics(1/60); if(PB.balls[0]) dropMinY=Math.min(dropMinY,PB.balls[0].y); }
assert(dropMinY<120, "ghost portal drops the ball from above (minY="+dropMinY.toFixed(0)+")");

/* --- the gargoyle shields the last pillar when closed --- */
freshRun();
for(let i=0;i<3;i++){ let g=0; while(L.f===i && g++<10) shootPillar(i); }
assert(L.f===3, "three foundations down (gargoyle awake)");
const fhBefore=L.fh;
place(PILLARS[3].x, PILLARS[3].y+70, 0, -700);
for(let i=0;i<30;i++){ L.time=1.6; PB.physics(1/60); }   // hold the gargoyle closed
assert(L.fh===fhBefore, "closed gargoyle blocks the pillar shot");

/* --- LOCKBOXX letters: collect all 8 for the bonus --- */
freshRun(); PB.game.ballSaveT=0;
{
  const s0=PB.game.score;
  for(const lt of PB.letters){ place(lt.x,lt.y,0,0); PB.physics(1/60); PB.physics(1/60); }
  assert(PB.letters.every(l=>l.got), "all 8 LOCKBOXX letters collected");
  assert(PB.game.score>=s0+140000, "LOCKBOXX completion bonus awarded");
}
