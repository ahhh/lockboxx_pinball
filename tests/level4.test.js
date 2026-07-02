// @page level4.html
/* Level 4 (Dragon's Lair) gameplay tests. */
const assert = global.__assert;
function sim(s){ for(let i=0;i<Math.round(s*60);i++) PB.physics(1/60); }
function place(x,y,vx,vy){
  const b = PB.balls[0];
  if(!b) return null;
  b.armed=false; b.x=x; b.y=y; b.vx=vx||0; b.vy=vy||0; b.stillT=0;
  return b;
}

PB.startLevel(); PB.game.ballSaveT=0;

/* --- phase 0: break both wings (3 hits each) --- */
for(let h=0;h<3;h++){ place(173,260,0,-800); sim(0.7); }
assert(L.wingHits[0]>=3, "left wing broken after 3 hits");
for(let h=0;h<3;h++){ place(307,260,0,-800); sim(0.7); }
assert(L.wingHits[1]>=3, "right wing broken after 3 hits");
assert(L.phase===1, "both wings down -> mouth opens");
assert(HEAD.enabled===false, "head guard drops for the mouth shot");

/* --- phase 1: mouth swallow -> weak point + multiball --- */
place(240,330,0,-500);
let swallowed=false;
for(let i=0;i<90;i++){ PB.physics(1/60); if(L.phase===1.5){swallowed=true;break;} }
assert(swallowed, "mouth shot swallows the ball");
sim(1.5);
assert(L.phase===2, "weak point exposed");
assert(PB.balls.length===3, "multiball starts (3 balls)");
assert(HEART.enabled===true, "heart target live");

/* --- phase 2: smash the heart 3x (stop stepping the instant it dies,
       so a stray multiball can't also smash the treasure first) --- */
let prevHits=L.heartHits;
while(L.heartHits<3){
  place(240,345,0,-420);
  let guard=0;
  while(L.heartHits===prevHits && guard++<120) PB.physics(1/60);
  if(L.heartHits===prevHits) break;          // shot missed entirely
  prevHits=L.heartHits;
  if(L.heartHits<3) sim(0.6);                // wait out the hit cooldown
}
assert(L.heartHits>=3, "heart takes 3 hits (got "+L.heartHits+")");
assert(L.phase===3, "dragon defeated");
assert(PB.game.mode==="play", "short defeat cinematic before the win screen");

/* --- defeat cinematic ends on the finale win screen --- */
for(const b of PB.balls){ b.x=100; b.y=700; b.vx=0; b.vy=0; }   // park the multiball
let done=false;
for(let i=0;i<240;i++){ PB.physics(1/60); if(PB.game.mode==="done"){done=true;break;} }
assert(done, "dragon defeat leads to the win screen");
assert(localStorage.getItem("lockboxx.game")===null, "completed run wiped from storage");
assert(PB.store.hi()>=PB.game.score, "final score recorded as high score");

/* --- LOCKBOXX letters: collect all 8 for the bonus --- */
PB.startLevel(); PB.game.balls=99; PB.game.ballSaveT=0;
{
  const s0=PB.game.score;
  for(const lt of PB.letters){ place(lt.x,lt.y,0,0); PB.physics(1/60); PB.physics(1/60); }
  assert(PB.letters.every(l=>l.got), "all 8 LOCKBOXX letters collected");
  assert(PB.game.score>=s0+140000, "LOCKBOXX completion bonus awarded");
}
