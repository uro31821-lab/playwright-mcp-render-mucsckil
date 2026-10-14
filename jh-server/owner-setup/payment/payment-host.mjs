import {loadConfig,PaymentStore,PaymentService,codeOf,fail} from './payment-core.mjs';
import {FinalPaymentFlow} from './payment-final.mjs';
import {installPaymentLifecycle} from './payment-lifecycle.mjs';
export {handlePaymentHttp} from './payment-http.mjs';

let service;
export function getPaymentHost(adapters={}){
  if(!service){const config=loadConfig();const store=new PaymentStore(config);service=new PaymentService({config,store,...adapters});service.final=new FinalPaymentFlow(service,adapters.paymentDriver);if(adapters.lifecycle)installPaymentLifecycle(service,adapters.lifecycle);}
  return service;
}
export function registerPaymentTools({register,z,textResult,getService}){
  const string=n=>z.string().min(1).max(n),paymentId=string(40),required=z.literal(true);
  const run=fn=>async args=>{try{return textResult(await fn(getService(),args));}catch(e){return textResult({ok:false,code:codeOf(e),payment_verified:false});}};
  const add=(name,title,description,inputSchema,fn,{read=false,external=false}={})=>register(name,{title,description,inputSchema,annotations:{readOnlyHint:read,destructiveHint:false,openWorldHint:external}},run(fn));
  add('life_payment_prepare','결제할 내용 정리',
    '사용자가 선택한 실제 주문/청구서에서 확인한 금액과 상대방만 저장합니다. 임의 주문·금액·결제 URL 생성 금지. 카드번호·비밀번호·CVC 입력 금지. 선택·총액 결과에서 이어갈 때 decision_id·choice_item_id·choice_payment_scope를 함께 전달합니다. purpose는 선택 항목 제목, source_url은 그 항목의 원문 URL, amount는 해당 항목 총액 또는 명시된 예약금입니다. 여러 항목의 총액을 한 주문 결제액으로 사용하지 않습니다. 준비만 하며 결제/전송/앱 실행은 하지 않습니다. request_key는 같은 요청을 재시도할 때 유지합니다. source_url은 원문, checkout_url은 판매처가 제공하는 결제 화면 주소입니다. 삼성월렛/카카오페이 지원 여부는 판매처 결제창에서 확인해야 합니다.',
    {request_key:string(120),merchant:string(80),purpose:string(120),order_id:string(120),amount:z.number().int().positive(),currency:z.enum(['KRW']).optional(),method:z.enum(['BANK_TRANSFER','CARD','KAKAOPAY','SAMSUNGPAY']),bank:string(30).optional(),account:string(40).optional(),holder:string(60).optional(),source_url:string(4096),checkout_url:string(4096).optional(),expires_at:string(40).optional(),device_id:string(160).optional(),decision_id:string(64).optional(),choice_item_id:string(120).optional(),choice_payment_scope:z.enum(['FULL_ITEM','DEPOSIT']).optional()},
    (s,a)=>s.prepare(a));
  add('life_payment_status','결제 준비 상태 확인',
    '저장된 결제 준비 상태를 조회합니다. 메시지 SENT, 화면 OPEN_REPORTED, 사용자 결제 메모는 실제 결제완료 증거가 아닙니다. payment_verified=false인 경우 완료라고 보고하지 마세요. 새 메시지/앱 실행 없이 재시작 후 동일 payment_id를 조회합니다.',
    {payment_id:paymentId},(s,a)=>({ok:true,...s.status(a.payment_id)}),{read:true});
  add('life_payment_review_link','결제정보 화면 준비',
    '주문번호·금액·계좌 복사·판매처 결제 화면 링크가 있는 30분 이내 유효한 전용 안내 링크를 만듭니다. 링크를 열기만 해서는 결제되지 않습니다. 제3자에게 보내지 말고 요청한 사용자 본인에게만 제공합니다.',
    {payment_id:paymentId},(s,a)=>({ok:true,review_url:s.reviewUrl(a.payment_id),payment_verified:false}));
  add('life_payment_connect_kakao','내 카카오톡 연결',
    '사용자 요청 시 본인 카카오 계정을 연결할 전용 링크를 생성합니다. 사용자가 카카오 로그인과 talk_message 동의를 직접 완료해야 합니다. 카카오 앱 키/리다이렉트 URL은 서버에 먼저 설정되어야 합니다.',
    {},s=>({ok:true,connect_url:s.connectionUrl()}));
  add('life_payment_send_to_me','결제정보를 내 카카오톡으로 보내기',
    '사용자가 내 카톡으로 보내라고 명시한 경우에만 호출합니다. 연결된 본인의 나와의 채팅에만 전달합니다. 메시지 전송은 결제가 아닙니다. 같은 건은 중복 발송하지 않고 응답 불명 상태에서는 재시도하지 않습니다.',
    {payment_id:paymentId,explicit_send:required},(s,a)=>s.sendToMe(a.payment_id,a.explicit_send),{external:true});
  add('life_payment_open','준비된 결제 화면 열기',
    '사용자가 요청한 구매 작업 안에서 결제 화면까지 자동으로 이동합니다. 이 단계에는 별도 결제 승인을 요구하지 않습니다. 기존 JH 휴대폰 Secure56/브라우저를 사용합니다. PHONE 이동은 재로그인이 필요할 수 있습니다. 실제 최종 결제는 life_payment_request_approval 링크의 사용자 승인 뒤에만 실행합니다.',
    {payment_id:paymentId,target:z.enum(['PHONE','BROWSER'])},(s,a)=>s.open(a.payment_id,a.target),{external:true});
  add('life_payment_inspect','현재 결제 화면 확인',
    '기존 JH 브라우저의 현재 화면을 읽기만 합니다. 관찰된 정보는 해당 payment_id의 금액·판매처·주문번호와 비교하세요. 화면 관찰 자체는 금융기관 승인 검증이 아니며 payment_verified는 false로 유지됩니다. 모바일 전용 인증 화면은 읽지 않습니다.',
    {payment_id:paymentId},(s,a)=>s.inspect(a.payment_id),{read:true,external:true});
  add('life_payment_report_paid','주인님의 결제 완료 메모',
    '주인님이 직접 결제했다고 말한 경우에만 사용자 메모를 남기고 추가 열기/전송을 막습니다. 공식 거래내역 검증과 구분하여 USER_REPORTED_PAID로 기록합니다.',
    {payment_id:paymentId,user_reported_paid:required},(s,a)=>{if(a.user_reported_paid!==true)fail('USER_PAYMENT_REPORT_REQUIRED');s.reportPaid(a.payment_id);return {ok:true,...s.status(a.payment_id)};});
  add('life_payment_options','가능한 결제수단 확인',
    '실제 판매처 화면에서 현재 가능한 수단과 마스킹된 표시를 읽습니다. 등록 카드·삼성페이·카카오페이·계좌이체 등을 화면에서 확인하며 없는 항목은 추정하지 않습니다. 미지원 사이트는 SITE_ADAPTER_REQUIRED로 멈춥니다. 카드번호/PIN/CVC/OTP 읽기 금지.',
    {payment_id:paymentId},(s,a)=>s.final.options(a.payment_id),{read:true,external:true});
  add('life_payment_select_method','결제수단 준비',
    '사용자 구매 요청과 선택/선호 범위에서 options로 확인한 수단을 선택합니다. 돈을 보내지 않는, 검토된 선택 컨트롤만 사용합니다. 선택 뒤 request_approval에서 최종 금액을 다시 읽습니다.',
    {payment_id:paymentId,option_id:string(80)},(s,a)=>s.final.select(a.payment_id,a.option_id),{external:true});
  add('life_payment_request_approval','최종 결제 승인 요청',
    '최종 결제 직전 금액·판매처·주문·결제수단·조건을 다시 읽고 승인 링크를 만듭니다. 링크와 금액을 사용자 본인에게만 제시하세요. GPT/JH가 이 링크를 열거나 버튼 클릭/HTTP 요청으로 대신 승인하면 안 됩니다. 사용자가 직접 승인하면 일치하는 결제를 1회 실행합니다. 일반 browser_click/type/press_key/evaluate 등으로 이 게이트를 우회하지 마세요. 지문·PIN 인증은 사용자 담당입니다.',
    {payment_id:paymentId},(s,a)=>s.final.capture(a.payment_id),{external:true});
  add('life_payment_verify_result','결제 성공과 영수증 확인',
    '승인 후 또는 사용자의 앱 인증 후 판매처 완료 화면을 읽고 주문번호·금액·수단·거래번호·영수증을 확인합니다. 재결제하지 않습니다. MERCHANT_SCREEN은 판매처 화면 증거이며 금융기관 API 검증과 구분합니다. 결과가 없으면 성공이라고 보고하지 마세요.',
    {payment_id:paymentId},(s,a)=>s.final.verify(a.payment_id),{external:true});
  add('life_payment_result','GPT에 보고할 결제 결과',
    '성공 여부·확인 수준·판매처·주문번호·금액·수단·거래번호·영수증 링크를 반환합니다. 반환 상태 그대로 사용자에게 보고하세요. UNKNOWN/SUBMITTED/인증 대기를 성공으로 바꾸지 마세요.',
    {payment_id:paymentId},(s,a)=>s.final.report(a.payment_id),{read:true});
  add('life_payment_cancel','진행 전 결제 준비 취소',
    '사용자가 취소하거나 새 작업으로 바꿨을 때 미실행 결제 준비와 승인을 폐기합니다. 이미 전송한 결제는 실행을 되돌리지 않고 결과·중복방지 기록을 보존하며 이전 작업 연결만 폐기합니다. 재시작 후 자동 결제 재개 금지.',
    {payment_id:paymentId},(s,a)=>s.final.cancel(a.payment_id));
}
