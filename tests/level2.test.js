// @page level2.html
/* Level 2 (The Subway) gameplay tests. */
const assert = global.__assert;
function sim(s){ for(let i=0;i<Math.round(s*60);i++) PB.physics(1/60); }
function place(x,y,vx,vy){
  const b = PB.balls[0];
  b.armed=false; b.x=x; b.y=y; b.vx=vx||0; b.vy=vy||0; b.stillT=0;
  return b;
}

/* --- launch reaches the upper deck --- */
PB.startLevel();
PB.plunger.charge=1; PB.launch();
let minY=999;
for(let i=0;i<600 && PB.balls[0];i++){ PB.physics(1/60); if(PB.balls[0]) minY=Math.min(minY,PB.balls[0].y); }
assert(minY<120, "launched ball reaches the upper deck (minY="+minY.toFixed(0)+")");

/* --- upper deck floor holds the ball above the lower deck --- */
PB.startLevel(); PB.game.ballSaveT=0;
place(100,380,0,0);
let crossedEarly=false;
for(let i=0;i<90;i++){ PB.physics(1/60); const b=PB.balls[0]; if(b && b.y>510 && (b.x<196||b.x>284)) crossedEarly=true; }
assert(!crossedEarly, "upper floor holds the ball (only the center gap drops through)");

/* --- turnstile spinner raises the fare multiplier --- */
PB.startLevel();
place(240,120,0,250);
sim(1);
assert(PB.game.mult>1, "spinner pass raises fare multiplier (x"+PB.game.mult.toFixed(1)+")");

/* --- tubes mark stations; all three unlock the golden tube --- */
PB.startLevel(); PB.game.ballSaveT=0;
place(50,330,0,0); sim(3);
assert(L.stations[0], "tube A visits station 1");
place(410,330,0,0); sim(3);
assert(L.stations[1], "tube B visits station 2");
place(70,560,0,0); sim(3);
assert(L.stations[2], "tube C visits station 3");
assert(L.stations.every(Boolean), "all stations visited -> golden tube unlocked");
place(240,600,0,0);
let won=false;
for(let i=0;i<300;i++){ PB.physics(1/60); if(PB.game.mode==="won"){won=true;break;} }
assert(won, "golden tube ride clears the level");
const saved = JSON.parse(localStorage.getItem("lockboxx.game"));
assert(saved && saved.level===3, "run saved to storage for level 3");
PB.advanceScreen();
assert(PB.game.mode==="cutscene", "status page advances into the cutscene slides");
for(let i=0;i<Math.round(60*3.5);i++) PB.physics(1/60);   // slides auto-advance, 1s each
assert(location.href==="level3.html", "after 3 slides the game jumps to level 3");

/* --- golden tube is locked before all stations --- */
PB.startLevel(); PB.game.ballSaveT=0;
place(240,600,0,0);
let earlyRide=false;
for(let i=0;i<60;i++){ PB.physics(1/60); const b=PB.balls[0]; if(b && b.rail){earlyRide=true;break;} }
assert(!earlyRide, "golden tube stays locked before 3 stations");

/* --- train boarding when timed right --- */
PB.startLevel(); PB.game.ballSaveT=0;
L.tT = 2.03;                       // puts the train under the deck gap
const s0=PB.game.score;
place(240,466,0,60);
let boarded=false;
for(let i=0;i<120;i++){ PB.physics(1/60); const b=PB.balls[0]; if(b && b.rail){boarded=true;break;} }
assert(boarded, "ball boards the crossing train");
sim(2);
assert(PB.game.score>=s0+15000, "train ride pays +15,000");

/* --- mistimed drop falls through to the lower deck --- */
PB.startLevel(); PB.game.ballSaveT=0;
L.tT = 5.5;                        // no train on screen
place(240,466,0,60);
sim(1.5);
assert(PB.balls[0] && !PB.balls[0].rail && PB.balls[0].y>510, "no train: ball falls to the lower deck");

/* --- ball locks: 3 locked balls start RUSH HOUR MULTIBALL --- */
PB.startLevel(); PB.game.ballSaveT=0;
for(let k=0;k<3;k++){
  place(390,600,0,0);
  for(let i=0;i<120;i++){ PB.physics(1/60); if(L.locks===k+1) break; }
}
assert(L.locks===3 && L.rushDone, "three balls locked -> rush hour");
assert(PB.balls.length===3, "rush hour releases a 3-ball multiball");

/* --- LOCKBOXX letters: collect all 8 for the bonus --- */
PB.startLevel(); PB.game.balls=99; PB.game.ballSaveT=0;
{
  const s0=PB.game.score;
  for(const lt of PB.letters){ place(lt.x,lt.y,0,0); PB.physics(1/60); PB.physics(1/60); }
  assert(PB.letters.every(l=>l.got), "all 8 LOCKBOXX letters collected");
  assert(PB.game.score>=s0+140000, "LOCKBOXX completion bonus awarded");
}
