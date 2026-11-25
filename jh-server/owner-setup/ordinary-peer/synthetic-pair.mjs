import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {matchesEvent} from './registration-statistics.mjs';

export const pairEvent='구름매듭 66 실습회 오후반';

// Kept apart from owner notices. Only these generated, synthetic values may be logged for blind trials.
export function openSyntheticPair(db,owner,log){
  db.exec(`CREATE TABLE IF NOT EXISTS peer_synthetic_pairs (owner TEXT NOT NULL, event TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner,event));
    CREATE TABLE IF NOT EXISTS peer_synthetic_receipts (reply_ref TEXT PRIMARY KEY)`);
  const read=db.prepare('SELECT data FROM peer_synthetic_pairs WHERE owner=? AND event=?');
  let saved=read.get(owner,pairEvent);
  if(!saved){
    const data={fixtureId:randomUUID(),event:pairEvent,teams:['솔팀','별팀','달팀'].map(label=>({label,confirmed:randomInt(7,46)})),
      pickup:'단풍 '+randomBytes(4).toString('hex').toUpperCase()+'번 창구'};
    db.prepare('INSERT OR IGNORE INTO peer_synthetic_pairs VALUES(?,?,?)').run(owner,pairEvent,JSON.stringify(data));
    saved=read.get(owner,pairEvent);
  }
  const source=JSON.parse(saved.data);
  log('JH_PEER_PILOT66_SOURCE '+JSON.stringify(source));
  const mark=db.prepare('INSERT OR IGNORE INTO peer_synthetic_receipts VALUES(?)');
  return {source,
    pickupRequested(question){return matchesEvent(question,pairEvent) && /(?:수령처|수령\s*(?:창구|장소)|배부\s*(?:처|창구|장소)|받는\s*(?:곳|장소|위치)|어디.{0,16}(?:받|수령|찾)|(?:받|수령).{0,10}어디)/u.test(question);},
    record(row,requester,hash){
      if(!mark.run(row.reply_ref).changes)return;
      log('JH_PEER_PILOT66_REPLY '+JSON.stringify({fixtureId:source.fixtureId,requester:requester??null,
        actor:row.actor,requestRef:row.request_ref,replyRef:row.reply_ref,questionSha256:hash(row.question),
        answerSha256:hash(row.reply),utc:new Date().toISOString()}));
    }};
}
