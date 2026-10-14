import {randomBytes} from 'node:crypto';
import {codeOf,fail} from './payment-core.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shell(title,body,nonce,script=''){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)} · JH</title><style nonce="${nonce}">
  :root{color-scheme:light;font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;color:#18332b;background:#edf3ef}*{box-sizing:border-box}body{margin:0;padding:28px 16px}main{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d6e1da;border-radius:22px;padding:28px;box-shadow:0 12px 35px #18332b0b}.brand{font-weight:800;font-size:14px;letter-spacing:1px;color:#267454}h1{font-size:28px;line-height:1.35;margin:18px 0 6px}.sub{color:#53665d;line-height:1.65}.amount{font-size:38px;line-height:1.4;letter-spacing:-1px;margin:22px 0 8px;font-weight:800;overflow-wrap:anywhere}.tag{display:inline-block;border-radius:30px;background:#e9f2ed;color:#286145;padding:7px 12px;font-size:14px}dl{margin:24px 0;display:grid;grid-template-columns:92px 1fr;gap:15px;font-size:17px}dt{color:#5f7067}dd{margin:0;overflow-wrap:anywhere}a{color:#226c50;overflow-wrap:anywhere}button,.button{display:block;width:100%;padding:16px 14px;border:0;border-radius:12px;background:#236b50;color:#fff;text-align:center;font-size:18px;font-weight:700;line-height:1.3;text-decoration:none;cursor:pointer;margin:12px 0}.secondary{background:#edf3ef;color:#244b39;border:1px solid #c9d9ce}.note{background:#f4f7f4;border-radius:12px;padding:16px;line-height:1.65;font-size:15px}.foot{font-size:13px;color:#697970;line-height:1.6;margin:22px 0 0}.notice{padding:12px;background:#fff5dd;border-radius:10px}button:focus-visible,a:focus-visible{outline:3px solid #bf812b;outline-offset:3px}#feedback{min-height:24px;color:#226c50}@media(max-width:380px){main{padding:20px}.amount{font-size:32px}dl{grid-template-columns:80px 1fr}}
  </style></head><body><main><div class="brand">JH · 결제 도우미</div>${body}</main>${script?`<script nonce="${nonce}">${script}</script>`:''}</body></html>`;
}
export function renderReview(ticket,token,nonce,now=Date.now()){
  const expired=now>=ticket.expires_at,observed=ticket.status==='PAYMENT_SUCCESS_OBSERVED',paid=ticket.status==='USER_REPORTED_PAID'||observed,bank=ticket.method==='BANK_TRANSFER',activeFinal=!!ticket.final_flow;
  const names={BANK_TRANSFER:'계좌이체',CARD:'카드',KAKAOPAY:'카카오페이',SAMSUNGPAY:'삼성월렛'};
  const rows=bank?`<dt>은행</dt><dd>${esc(ticket.bank)}</dd><dt>계좌번호</dt><dd id="account">${esc(ticket.account)}</dd><dt>예금주</dt><dd>${esc(ticket.holder)}</dd>`:`<dt>결제수단</dt><dd>${names[ticket.method]}</dd>`;
  let actions='';
  if(!expired&&!paid&&!activeFinal){
    actions=bank?'<button type="button" id="copyAccount">계좌번호 복사</button><button type="button" class="secondary" id="copyAmount">금액 복사</button><p class="sub">은행 앱에서 계좌번호와 금액을 붙여넣고 예금주를 확인해 주세요.</p>':`<a class="button" href="${esc(ticket.checkout_url)}" target="_blank" rel="noopener noreferrer">판매처 결제 화면 열기</a><p class="sub">판매처에서 ${names[ticket.method]}를 선택하고 직접 인증해 주세요. 로그인이 다시 필요할 수 있습니다.</p>`;
    actions+=`<form method="post" action="/jh-payments/reported/${esc(token)}"><button class="secondary" type="submit">결제했다고 표시하기</button></form>`;
  }
  const label=observed?'판매처 결제 완료 화면 확인':paid?'주인님이 결제했다고 표시함':expired?'결제정보 유효시간이 지났습니다':activeFinal?'JH에서 최종 결제 상태 확인':'결제 대기';
  const body=`<h1>${esc(ticket.merchant)}</h1><p class="sub">${esc(ticket.purpose)}</p><div class="amount">${ticket.amount.toLocaleString('ko-KR')}원</div><span class="tag">${label}</span><dl>${rows}<dt>주문번호</dt><dd>${esc(ticket.order_id)}</dd><dt>원문</dt><dd><a href="${esc(ticket.source_url)}" target="_blank" rel="noopener noreferrer">판매처 정보 확인</a></dd><dt>유효시간</dt><dd>${esc(new Date(ticket.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</dd></dl>${actions}<div id="feedback" role="status" aria-live="polite"></div><div class="note">${paid?'이 표시는 결제 확인 메모입니다. 영수증이나 판매처의 주문내역에서 실제 결제 여부를 확인해 주세요.':expired?'JH에서 금액과 주문을 다시 확인해 주세요.':'금액과 받는 곳을 확인한 뒤 결제해 주세요. 이 안내를 열거나 복사해도 돈이 나가지 않습니다.'}</div><p class="foot">결제 후 이 화면이나 JH 대화로 돌아오시면 됩니다.</p>`;
  const script=bank&&!expired&&!paid&&!activeFinal?`const show=document.getElementById('feedback');async function copy(value){try{await navigator.clipboard.writeText(value);show.textContent='복사했습니다. 은행 앱에 붙여넣어 주세요.'}catch{show.textContent='복사가 지원되지 않습니다. 위 정보를 길게 눌러 복사해 주세요.'}}document.getElementById('copyAccount').onclick=()=>copy(document.getElementById('account').textContent);document.getElementById('copyAmount').onclick=()=>copy('${ticket.amount}');`:'';
  return shell('결제할 내용',body,nonce,script);
}
function respond(res,status,body,nonce,extra={}){res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY','content-security-policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,...extra});res.end(body);}

export function renderFinalApproval(t,f,token,nonce){
  const q=f.quote,c=f.choice_comparison;
  const comparison=c?`<div class="note">선택한 항목: ${esc(c.item_title)}<br>준비 당시 결제액: ${c.prepared_amount.toLocaleString('ko-KR')}원${c.amount_difference?`<br>현재 차액: ${c.amount_difference>0?'+':''}${c.amount_difference.toLocaleString('ko-KR')}원`:''}${c.scope==='DEPOSIT'?`<br>예약금은 항목 총액 ${c.item_total.toLocaleString('ko-KR')}원의 일부입니다.`:''}${Number.isSafeInteger(c.combination_total_after_quote)?`<br>이 변경을 반영한 조합 ${c.combination_kind==='ESTIMATED'?'예상':'조회'} 총액: ${c.combination_total_after_quote.toLocaleString('ko-KR')}원`:''}<br>지금 승인하는 금액은 이 항목의 ${q.amount.toLocaleString('ko-KR')}원입니다. 다른 항목은 별도 결제입니다.</div>`:'';
  return shell('최종 결제 승인',`<h1>이 내용으로 결제할까요?</h1><p class="sub">${esc(q.merchant)} · ${esc(q.purpose)}</p><div class="amount">${q.amount.toLocaleString('ko-KR')}원</div><dl><dt>결제수단</dt><dd>${esc(q.method_label)} · ${esc(q.instrument_label)}</dd><dt>주문번호</dt><dd>${esc(q.order_id)}</dd>${q.bank?`<dt>받는 곳</dt><dd>${esc(q.bank)} ${esc(q.account)} · ${esc(q.holder)}</dd>`:''}<dt>결제 조건</dt><dd>${esc(q.terms)}</dd><dt>판매처</dt><dd>${esc(new URL(q.checkout_url).hostname)}</dd></dl>${comparison}<div class="note">아래 버튼을 누르면 이 결제를 한 번 실행합니다. 금액이나 결제수단이 달라지면 실행을 멈춥니다.${q.authentication==='USER_REQUIRED'?' 이후 결제 앱에서 지문·PIN 등의 본인 인증이 필요합니다.':''}</div><form method="post" action="/jh-payments/approve/${esc(token)}"><input type="hidden" name="fingerprint" value="${esc(f.fingerprint)}"><button type="submit">${q.amount.toLocaleString('ko-KR')}원 결제 승인 및 실행</button></form><form method="post" action="/jh-payments/cancel/${esc(token)}"><button class="secondary" type="submit">결제하지 않기</button></form><p class="foot">이 승인은 현재 주문에만 적용되며 2분 이내 만료됩니다. 이후 정기결제 동의로 사용하지 않습니다.</p>`,nonce);
}
export function renderFinalResult(result,token,nonce){
  const r=result.receipt;
  return shell('결제 결과',`<h1>${result.payment_success_observed?'결제 완료 화면을 확인했습니다':'결제 결과 확인'}</h1><p class="sub">${esc(result.message)}</p>${Number.isSafeInteger(result.amount)?`<div class="amount">${result.amount.toLocaleString('ko-KR')}원</div>`:''}${r?`<dl><dt>주문번호</dt><dd>${esc(r.order_id)}</dd><dt>거래번호</dt><dd>${esc(r.transaction_id)}</dd><dt>결제시각</dt><dd>${esc(r.paid_at)}</dd></dl><a class="button" href="${esc(r.receipt_url)}" target="_blank" rel="noopener noreferrer">영수증 보기</a><p class="sub">확인 근거: 판매처 결제 완료 화면</p>`:''}${result.discarded?'':`<a class="button secondary" href="/jh-payments/result/${esc(token)}">저장된 결과 새로 보기</a>`}<p class="foot">JH 대화로 돌아가면 결과를 확인할 수 있습니다. 앱 인증을 끝냈다면 JH에 결과 확인을 요청해 주세요.</p>`,nonce);
}

// These narrow capability links do not confer MCP/owner/Android authority.
// GET requests never send a message, report a payment or invoke a payment app.
export async function handlePaymentHttp(req,res,url,getService){
  if(!url.pathname.startsWith('/jh-payments/'))return false;
  const nonce=randomBytes(18).toString('base64url');
  try{
    const finalPath=url.pathname.match(/^\/jh-payments\/(approve|cancel|result)\/([\w-]{43})$/);
    if(finalPath){
      const s=getService(),action=finalPath[1],token=finalPath[2];
      if(req.method==='GET'&&action==='approve'){const {t,f}=s.final.approvalView(token);respond(res,200,renderFinalApproval(t,f,token,nonce),nonce);return true;}
      if(req.method==='GET'&&action==='result'){const link=s.store.resolve(token,'FINAL_APPROVAL');respond(res,200,renderFinalResult(s.final.report(link.ticket),token,nonce),nonce);return true;}
      if(req.method==='POST'&&['approve','cancel'].includes(action)){
        if(req.headers.origin!==s.config.base||req.headers['sec-fetch-user']!=='?1'||!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))fail('PAYMENT_USER_FORM_REQUIRED');
        if(Number(req.headers['content-length']||0)>1024)fail('PAYMENT_REQUEST_TOO_LARGE');
        let body='';for await(const b of req){body+=b.toString();if(Buffer.byteLength(body)>1024)fail('PAYMENT_REQUEST_TOO_LARGE');}
        const {t}=s.final.approvalView(token);
        if(action==='cancel')s.final.cancel(t.id);
        else await s.final.approveAndExecute(token,new URLSearchParams(body).get('fingerprint'));
        respond(res,200,renderFinalResult(s.final.report(t.id),token,nonce),nonce);return true;
      }
      respond(res,405,shell('요청 확인','<h1>사용자 승인 화면에서 진행해 주세요.</h1>',nonce),nonce);return true;
    }
    const s=getService(),review=url.pathname.match(/^\/jh-payments\/review\/([\w-]{43})$/),connect=url.pathname.match(/^\/jh-payments\/connect\/([\w-]{43})$/),report=url.pathname.match(/^\/jh-payments\/reported\/([\w-]{43})$/);
    if(review&&req.method==='GET'){const link=s.store.resolve(review[1],'REVIEW');s.lifecycle?.assertBinding(s.store.get(link.ticket));respond(res,200,renderReview(s.store.get(link.ticket),review[1],nonce,s.now()),nonce);return true;}
    if(connect&&req.method==='GET'){s.store.resolve(connect[1],'CONNECT');respond(res,200,shell('카카오톡 연결',`<h1>내 카카오톡 연결</h1><p class="sub">결제할 내용을 ‘나와의 채팅’으로 받을 계정을 연결합니다.</p><form method="post"><button type="submit">카카오 계정으로 연결하기</button></form><div class="note">카카오 로그인 화면에서 주인님 계정인지 확인해 주세요. 연결만으로 메시지를 보내거나 결제하지 않습니다.</div>`,nonce),nonce);return true;}
    if((connect||report)&&req.method==='POST'){
      if(req.headers.origin!==s.config.base)fail('PAYMENT_REQUEST_ORIGIN_MISMATCH');
      if(Number(req.headers['content-length']||0)>1024)fail('PAYMENT_REQUEST_TOO_LARGE');
      let size=0;for await(const b of req){size+=b.length;if(size>1024)fail('PAYMENT_REQUEST_TOO_LARGE');}
      if(connect){respond(res,303,'',nonce,{location:s.authorizeUrl(connect[1])});return true;}
      const link=s.store.resolve(report[1],'REVIEW');s.reportPaid(link.ticket);respond(res,303,'',nonce,{location:'/jh-payments/review/'+report[1]});return true;
    }
    if(url.pathname==='/jh-payments/kakao/callback'&&req.method==='GET'){
      if(url.searchParams.has('error'))fail('KAKAO_CONNECTION_CANCELLED');
      await s.connectCallback(url.searchParams.get('state'),url.searchParams.get('code'));
      respond(res,200,shell('연결 완료','<h1>카카오톡을 연결했습니다.</h1><p class="sub">JH 대화로 돌아가 “결제정보를 내 카톡으로 보내 줘”라고 말씀해 주세요.</p>',nonce),nonce);return true;
    }
    respond(res,404,shell('찾을 수 없음','<h1>요청한 화면을 찾을 수 없습니다.</h1>',nonce),nonce);return true;
  }catch(e){const code=codeOf(e);respond(res,400,shell('다시 확인해 주세요',`<h1>JH에서 상태를 확인해 주세요.</h1><p class="sub">진행 상태를 확인해야 합니다. 이미 승인한 결제라면 같은 결제를 다시 실행하지 말고 결과를 조회해 주세요.</p><p class="foot">확인 코드: ${esc(code)}</p>`,nonce),nonce);return true;}
}
