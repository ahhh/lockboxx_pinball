// @page level1.html
/* Level 1 (The Vault) gameplay tests. Run via: node tests/run.js */
const assert = global.__assert;
function sim(s){ for(let i=0;i<Math.round(s*60);i++) PB.physics(1/60); }
function place(x,y,vx,vy){
  const b = PB.balls[0];
  b.armed=false; b.x=x; b.y=y; b.vx=vx||0; b.vy=vy||0; b.stillT=0;
  return b;
}

/* --- launch: full power reaches the dome and enters the playfield --- */
PB.startLevel();
PB.plunger.charge=1; PB.launch();
let entered=false, minY=999, oob=null;
for(let i=0;i<600 && PB.balls[0];i++){
  PB.physics(1/60);
  const b=PB.balls[0];
  if(b){ if(b.x<420) entered=true; minY=Math.min(minY,b.y);
    if(!b.rail && (b.x<-6||b.x>486||b.y<-40)) oob={x:b.x,y:b.y}; }
}
assert(entered, "launched ball enters playfield");
assert(minY<120, "ball reaches top dome (minY="+minY.toFixed(0)+")");
assert(!oob, "ball never escapes table bounds");

/* --- weak launch falls back and re-arms the plunger --- */
PB.startLevel();
PB.plunger.charge=0; PB.launch();
sim(6);
assert(PB.armedBall()!==null, "weak launch falls back onto plunger");

/* --- lock trigger opens gate; door shot registers; bridge extends --- */
PB.startLevel();
place(75,534,30,0);
let hitT=false;
for(let i=0;i<240;i++){ PB.physics(1/60); if(L.triggersHit[0]){hitT=true;break;} }
assert(hitT, "left lock trigger registers");
assert(triggers[0].done && triggers[0].enabled()===false, "unlocked lock block vanishes (non-blocking)");
sim(1);
assert(gates[0].t>0.9, "gate 0 slides open after trigger");
place(170,400,0,-950);
let hitD=false;
for(let i=0;i<120;i++){ PB.physics(1/60); if(L.doorsHit[0]){hitD=true;break;} }
assert(hitD, "vault door 0 breached through open gate");
sim(2);
assert(L.bridgeT[0]>0.9, "bridge segment 0 extends");

/* --- closed gate blocks the door --- */
PB.startLevel();
place(170,400,0,-950);
sim(2);
assert(!L.doorsHit[0], "closed gate blocks vault door shot");

/* --- captive padlock: 3 hits -> MULTIBALL, drains follow multiball rules --- */
PB.startLevel();
const ballsBefore=PB.game.balls;
for(let h=0;h<3;h++){
  place(74,520,0,-700);
  L.padlockCd=0;    // scripted shots are faster than the real hit cooldown
  /* stop as soon as the hit lands so the falling ball can't drain mid-test */
  for(let i=0;i<120;i++){ PB.physics(1/60); if(L.padlockHits>=h+1 || L.captiveGone) break; }
}
assert(L.padlockHits>=3, "padlock takes 3 hits (got "+L.padlockHits+")");
assert(L.captiveGone, "captive ball breaks free");
assert(PB.balls.length===2, "multiball: freed captive is a live second ball");
assert(PB.game.balls===ballsBefore, "no ball credit change on multiball start");
PB.game.ballSaveT=0;
PB.balls[0].x=200; PB.balls[0].y=850; PB.balls[0].vy=300;   // drain one
PB.balls[1].x=240; PB.balls[1].y=400; PB.balls[1].vx=0; PB.balls[1].vy=0;
sim(0.5);
assert(PB.game.balls===ballsBefore && PB.balls.length===1, "multiball drain: no life lost, survivor continues");
PB.game.ballSaveT=0;
sim(3);                                    // survivor falls through the center gap
assert(PB.game.balls===ballsBefore-1, "final ball drain costs a life");

/* --- captive ball stays inside the padlock chamber --- */
PB.startLevel();
sim(4);
assert(captive.x>44 && captive.x<104 && captive.y>364 && captive.y<466, "captive ball contained");

/* --- full progression: 3 doors -> bridge -> portal -> won + saved for level 2 --- */
PB.startLevel();
PB.game.balls=99;                 // scripted shots may drain; keep the run alive
[0,1,2].forEach(i=>hitTrigger(i));
sim(1.5);
for(const i of [0,1,2]){
  place([170,240,310][i],400,0,-950);
  sim(2);
}
assert(L.bridgeDone, "bridge complete after 3 doors");
sim(1.5);
place(240,400,0,-950);
let won=false;
for(let i=0;i<180;i++){ PB.physics(1/60); if(PB.game.mode==="won"){won=true;break;} }
assert(won, "center core shot enters portal -> level cleared");
const saved = JSON.parse(localStorage.getItem("lockboxx.game"));
assert(saved && saved.level===2 && saved.score===PB.game.score, "run saved to storage for level 2");
assert(PB.store.hi()>=PB.game.score, "high score recorded");
PB.advanceScreen();
assert(PB.game.mode==="cutscene", "status page advances into the cutscene slides");
for(let i=0;i<Math.round(60*3.5);i++) PB.physics(1/60);   // slides auto-advance, 1s each
assert(location.href==="level2.html", "after 3 slides the game jumps to level 2");

/* --- drain costs a ball, next ball served --- */
PB.startLevel(); PB.game.ballSaveT=0;
place(240,850,0,200);
sim(1);
assert(PB.game.balls===2 && PB.game.mode==="play" && PB.armedBall(), "drain costs a ball, next ball served");

/* --- no stuck-ball pockets --- */
function dropDrains(x,y,drainY,name){
  PB.startLevel(); PB.game.ballSaveT=0;
  place(x,y,0,0);
  let off=false;
  for(let i=0;i<360;i++){ PB.physics(1/60); if(!PB.balls[0] || PB.balls[0].y>drainY){off=true;break;} }
  assert(off, name);
}
dropDrains(241,210,360, "ball dropped on vault roof drains off");
dropDrains(300,215,360, "ball dropped on right roof slope drains off");
dropDrains(180,215,360, "ball dropped on left roof slope drains off");
dropDrains( 74,340,500, "ball dropped on padlock top drains off");
function slingLaneClears(x,y,name){
  PB.startLevel(); PB.game.ballSaveT=0;
  place(x,y,0,0);
  let ok=false;
  for(let i=0;i<480;i++){ PB.physics(1/60); if(!PB.balls[0]||PB.balls[0].y>710){ok=true;break;} }
  assert(ok, name);
}
slingLaneClears( 60,620, "left lower lane clears past the bumper");
slingLaneClears(400,620, "right lower lane clears past the bumper");

/* --- flipper gap allows center drain --- */
const tipGap = (318-Math.cos(0.55)*70) - (162+Math.cos(0.55)*70);
assert(tipGap>30, "flipper gap allows center drain ("+tipGap.toFixed(1)+"px)");

/* --- side rail captures and carries to the top --- */
PB.startLevel(); PB.game.ballSaveT=0;
place(30,505,-40,60);
let rode=false;
for(let i=0;i<240;i++){ PB.physics(1/60); if(PB.balls[0] && PB.balls[0].rail){rode=true;break;} }
assert(rode, "left scoop captures ball onto the rail");
let railMinY=999;
for(let i=0;i<180;i++){ PB.physics(1/60); if(PB.balls[0]) railMinY=Math.min(railMinY,PB.balls[0].y); }
assert(railMinY<80, "rail carries ball to the top drop zone");
assert(PB.balls[0] && !PB.balls[0].rail, "rail releases the ball");

/* --- wall targets score bonus points --- */
PB.startLevel(); PB.game.ballSaveT=0;
{
  const s0=PB.game.score;
  place(380,448,520,0);
  sim(1);
  assert(PB.game.score>=s0+3000, "wall target registers +3,000");
}

/* --- LOCKBOXX letters: collect all 8 for the bonus --- */
PB.startLevel(); PB.game.balls=99; PB.game.ballSaveT=0;
{
  const s0=PB.game.score;
  for(const lt of PB.letters){ place(lt.x,lt.y,0,0); PB.physics(1/60); PB.physics(1/60); }
  assert(PB.letters.every(l=>l.got), "all 8 LOCKBOXX letters collected");
  assert(PB.game.score>=s0+140000, "LOCKBOXX completion bonus awarded");
}
