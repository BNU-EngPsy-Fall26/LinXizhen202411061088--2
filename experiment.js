'use strict';
const app=document.querySelector('#app');
const speeds=[8,16,32,64];
const monitorEvents=16;
const excursionSeconds=3.2;
const pairs=[[25,50],[32,80],[36,60],[40,55],[24,72],[44,80],[35,70],[27,90],[48,60],[50,75],[45,90],[36,80]];
const projectCode=(new URLSearchParams(location.search).get('project')||'').toUpperCase();
const courseProject=/^[A-Z0-9]{6}$/.test(projectCode)?projectCode:'';
const courseEndpoint='https://attention-lab-production.up.railway.app/api/hw2/submit';
const key='flight-attention-v8';
const publishedSummary={
  n:12,rates:[2.81,3.92,5.61,6.67],slope:.0660,
  alignedDetection:85.94,offsetDetection:75.00,alignedRT:508,offsetRT:592,
  alignedError:6.49,offsetError:8.83
};
let records=[];
for(const version of [1,2,3,4,5,6,7,8]){
  try{
    const stored=JSON.parse(localStorage.getItem('flight-attention-v'+version)||'[]');
    const byId=new Map(records.map(record=>[record.id,record]));
    stored.filter(validRecord).forEach(record=>byId.set(record.id,record));
    records=[...byId.values()];
  }catch{}
}
for(const record of globalThis.BUNDLED_RECORDS??[]){
  if(validRecord(record)&&!records.some(existing=>existing.id===record.id))records.push(record);
}
let active=null, participant='', status='';
const uid=()=>globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
function shuffle(values){
  const copy=values.slice();
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}
function setPage(html){app.innerHTML=html;}
function cancel(){if(active){active.dispose();active=null;}}
function navigate(render){
  if(active && !confirm('离开将结束当前任务，本轮数据不会保存。继续离开？')) return;
  cancel();render();
}
function button(id,fn){document.querySelector('#'+id).onclick=fn;}
button('home',()=>navigate(home));button('design',()=>navigate(design));button('results',()=>navigate(results));
function home(){
  setPage('<section class="hero"><div class="eyebrow">飞行训练舱 / 注意与显示</div><h1>看哪块表？<br>读得有多准？</h1><p>进入两项座舱训练。先在多块仪表间巡检，再在两块表盘之间估计指针角度的比例。</p></section><div class="pair"><section class="panel"><div class="eyebrow">01 / 视觉采样</div><h3>四表巡检</h3><p>四根指针持续可见，发现越限按空格。正式任务两轮，每轮约 90 秒。</p><button class="primary" id="w5">进入四表巡检</button></section><section class="panel"><div class="eyebrow">02 / 图形知觉</div><h3>双表盘角度估计</h3><p>比较左右指针转过的角度。24 道正式题，另有练习。</p><button class="primary" id="w7">进入角度估计</button></section></div><footer>请使用配有鼠标与键盘的电脑。正式数据可在结果页导出。</footer>');
  button('w5',()=>intro('w5'));button('w7',()=>intro('w7'));
}
function intro(task){
  const isW5=task==='w5';
  setPage('<div class="eyebrow">任务指导</div><h2>'+(isW5?'四表巡检':'双表盘角度估计')+'</h2><p>'+(isW5?
    '四块表的指针始终可见，变化快慢不同。自由查看各表，同时将鼠标移到你正在看的表盘上。任何指针进入红区时按一次空格。每次只会有一块表越限，按键时无需把鼠标移到越限表上。先练习约 15 秒，再完成两轮各 90 秒的正式巡检。':
    '每个表盘的青色径线标出起点，浅色指针标出终点。沿顺时针方向估计各自转过的角度，再回答「左边是右边的百分之几？」例如左边转 30°、右边转 60°，填 50。先做 4 道有反馈的练习，再做正式题。')+'</p><form id="consent" class="panel"><h3>参与说明</h3><p>本任务用于课程作业，记录匿名编号、任务作答与操作时序。可随时退出。请勿输入真实姓名、学号或联系方式。完成后数据先保存在当前浏览器，研究者可导出记录。'+(courseProject?'本链接还会将匿名任务记录上传到课程收数平台。':'')+'</p><label>匿名编号 <input id="pid" required pattern="[A-Za-z0-9_]{1,20}" placeholder="例如 P01" maxlength="20"></label><p><label><input type="checkbox" required> 我已阅读说明，自愿参与</label></p><button class="primary">开始练习</button></form>');
  document.querySelector('#pid').value=participant;
  document.querySelector('#consent').onsubmit=e=>{
    e.preventDefault();participant=document.querySelector('#pid').value.trim();
    const session={id:uid(),participant,task,trials:[]};
    if(isW5) runW5(session,true);else runW7(session,true);
  };
}
function startFormal(title,fn){
  setPage('<h2>练习完成</h2><p>准备好后开始正式任务。请保持实验窗口可见。</p><button class="primary" id="start">开始'+title+'</button>');
  button('start',fn);
}
function finish(session){
  cancel();records.push(session);status='已记录本轮数据。';
  try {localStorage.setItem(key,JSON.stringify(records));} catch {status='浏览器未能保存数据，请立即导出。';}
  setPage('<div class="eyebrow">任务结束</div><h2>训练完成</h2><p>'+status+'</p><p id="courseStatus" aria-live="polite"></p><div class="actions"><button class="primary" id="goResults">查看数据与结果</button><button id="goHome">返回任务大厅</button></div>');
  button('goResults',results);button('goHome',home);
  if(courseProject) submitCourse(session,document.querySelector('#courseStatus'));
}
function coursePayload(session){
  let trials;
  if(session.task==='w5'){
    const windows=new Map();
    for(const trial of session.trials){
      const windowKey=trial.condition+':'+trial.trial;
      if(!windows.has(windowKey)) windows.set(windowKey,[]);
      windows.get(windowKey).push(trial);
    }
    trials=session.trials.filter(trial=>trial.crossings).map(trial=>({
      ...trial,cond:trial.condition,rt:trial.rtMs??null,correct:Boolean(trial.hits),
      sampling:windows.get(trial.condition+':'+trial.trial)
    }));
  }else{
    trials=session.trials.map(trial=>({
      ...trial,cond:trial.condition,rt:trial.rtMs??null,correct:trial.error<1e-8
    }));
  }
  return {project:courseProject,experiment:session.task==='w5'?'flight_monitoring':'flight_angle_ratio',
    participant:session.participant,condition:'',trials};
}
async function submitCourse(session,message){
  message.textContent='正在上传课程数据，请等到状态更新再离开本页。';
  try{
    const response=await fetch(courseEndpoint,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(coursePayload(session)),signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) throw new Error('HTTP '+response.status);
    message.textContent='本项任务已上传到课程收数平台。';
  }catch{
    message.textContent='未能确认课程上传。请在结果页导出 JSON 并交给研究者。';
  }
}
function dial(start,angle,monitor=false){
  return '<svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="69" fill="#101827" stroke="#566984" stroke-width="2"/>'+
    (monitor?'<g transform="rotate('+start+' 80 80)"><path d="M 25 80 A 55 55 0 0 1 39.78 42.49 M 120.22 42.49 A 55 55 0 0 1 135 80" fill="none" stroke="#ff9292" stroke-width="8" stroke-linecap="round"/><line x1="80" y1="15" x2="80" y2="25" stroke="#bbc7dc" stroke-width="2"/></g>':
    '<line x1="80" y1="17" x2="80" y2="66" stroke="#70d7bf" stroke-width="3" stroke-dasharray="5 3" transform="rotate('+start+' 80 80)"/>')+
    '<line class="needle" x1="80" y1="80" x2="80" y2="25" stroke="#f0f4ff" stroke-width="4" stroke-linecap="round" transform="rotate('+(start+angle)+' 80 80)"/><circle cx="80" cy="80" r="5" fill="#b5efc3"/></svg>';
}
function angleTrials(practice){
  const stimulus=practice?[[20,40],[28,70],[30,60],[35,50]]:pairs;
  const starts=shuffle([0,90,180,270]);
  const conditions=['aligned','offset'];
  const sides=shuffle([1,-1]);
  return shuffle(conditions.flatMap((condition,c)=>stimulus.flatMap(([left,right],i)=>{
    if(practice && i%2!==c) return [];
    const leftStart=starts[i%4];
    const offset=sides[Math.floor(i/4)%2]*90;
    return [{condition,left,right,leftStart,rightStart:(leftStart+(c?offset:0)+360)%360}];
  })));
}
function runW7(session,practice){
  const queue=angleTrials(practice);let index=0;
  function show(){
    if(index===queue.length){
      cancel();
      if(practice) startFormal('角度估计',()=>runW7(session,false));else finish(session);
      return;
    }
    const t=queue[index];
    setPage('<div class="eyebrow">'+(practice?'练习':'正式任务')+' / '+(index+1)+' · '+queue.length+'</div><h2>左边的角度是右边的百分之几？</h2><p>青色虚线为起点，浅色指针为终点。两个表盘均沿顺时针方向读。</p><div class="pair"><div class="panel">'+dial(t.leftStart,t.left)+'左表盘</div><div class="panel">'+dial(t.rightStart,t.right)+'右表盘</div></div><form id="estimate" class="actions"><label>估计值 <input id="estimateValue" type="number" min="0" max="100" step="any" required inputmode="decimal" aria-label="估计百分比"> %</label><button class="primary">提交</button></form><p class="status" id="feedback" aria-live="polite"></p>');
    const input=document.querySelector('#estimateValue'),form=document.querySelector('#estimate');input.focus();
    let onset=Infinity;
    const frame=requestAnimationFrame(()=>{onset=performance.now();});
    const resetTimer=()=>{if(!document.hidden) onset=performance.now();};
    document.addEventListener('visibilitychange',resetTimer);
    active={dispose:()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',resetTimer);}};
    form.onsubmit=e=>{
      e.preventDefault();if(!Number.isFinite(onset))return;
      const response=Number(input.value),target=100*t.left/t.right;
      if(!practice){
        session.trials.push({...t,trial:index+1,response,target,error:Math.abs(response-target),rtMs:Math.round(performance.now()-onset)});
        cancel();index++;show();return;
      }
      form.hidden=true;form.style.display='none';
      const feedback=document.querySelector('#feedback');
      feedback.textContent='参考答案 '+target.toFixed(1)+'%。';
      const next=document.createElement('button');next.textContent='下一题';feedback.after(next);
      next.onclick=()=>{cancel();index++;show();};next.focus();
    };
  }
  show();
}
function monitorSignal(speed){
  const turnMagnitude=()=>25+Math.random()*16;
  let angle=Math.random()*40-20;
  let direction=Math.random()<.5?-1:1;
  let endpoint=direction*turnMagnitude();
  let previous=0;
  return seconds=>{
    let distance=(seconds-previous)*speed;
    previous=seconds;
    while(distance>=Math.abs(endpoint-angle)){
      distance-=Math.abs(endpoint-angle);
      angle=endpoint;
      direction=-direction;
      endpoint=direction*turnMagnitude();
    }
    angle+=direction*distance;
    return angle;
  };
}
function monitorSchedule(blockSize,windowSeconds){
  const instruments=shuffle(Array.from({length:Math.max(4,blockSize)},(_,i)=>i%4)).slice(0,blockSize);
  return instruments.map((meter,i)=>({
    meter,
    start:i*windowSeconds+.4+Math.random()*(windowSeconds-excursionSeconds-.65),
    onset:null, hit:false
  }));
}
function runW5(session,practice,blockIndex=0){
  session.display='visible-speed-smooth-dense-alignment';
  session.order??=shuffle(['aligned','offset']);
  session.speeds??=shuffle(speeds);
  session.offsets??=shuffle([-35,-18,18,35]);
  session.events??=[];
  const condition=practice?'practice':session.order[blockIndex];
  const blockSize=practice?3:monitorEvents, duration=practice?15:90;
  const windowSeconds=duration/blockSize;
  const assigned=session.speeds;
  const directions=condition==='offset'?session.offsets:[0,0,0,0];
  const signals=assigned.map(monitorSignal);
  const pausedSeconds=assigned.map(()=>0);
  const travelSeconds=1.4;
  const targets=monitorSchedule(blockSize,windowSeconds), visits=[], falseAlarms=[];
  setPage('<div class="eyebrow">'+(practice?'练习':'正式巡检 '+(blockIndex+1)+' / 2')+' / 四表巡检</div><h2>看到指针进入红区就按空格</h2><p>鼠标跟随正在看的表盘。发现越限时直接按空格。</p><p id="clock" class="status"></p><div class="gauges">'+assigned.map((_,i)=>'<div class="meter" data-meter="'+i+'">'+dial(directions[i],0,true)+'仪表 '+String.fromCharCode(65+i)+'</div>').join('')+'</div><p class="status" id="w5feedback" aria-live="polite"></p>');
  const meters=[...document.querySelectorAll('[data-meter]')], needles=meters.map(x=>x.querySelector('.needle'));
  const clock=document.querySelector('#clock'),feedback=document.querySelector('#w5feedback');
  let current=-1,entered=0,frame,last=performance.now(),elapsed=0,lastSecond=-1;
  let windowFocused=!document.hidden,redTarget=null;
  function closeVisit(){
    if(current>=0&&elapsed-entered>=.1)visits.push({meter:current,start:entered,end:elapsed});
  }
  meters.forEach((meter,i)=>{
    meter.onpointerenter=()=>{closeVisit();current=i;entered=elapsed;};
    meter.onpointerleave=()=>{if(current===i){closeVisit();current=-1;}};
  });
  function pause(){closeVisit();current=-1;windowFocused=false;}
  function resume(){last=performance.now();windowFocused=!document.hidden;}
  function visibility(){if(document.hidden)pause();else resume();}
  function report(e){
    if(e.code!=='Space'||e.repeat||!windowFocused)return;
    e.preventDefault();
    if(redTarget){
      if(redTarget.hit)return;
      redTarget.hit=true;
      redTarget.rtMs=Math.round((elapsed-redTarget.onset)*1000);
      if(practice)feedback.textContent='已记录一次越限报告。';
    }else{
      falseAlarms.push({meter:current>=0?current:null,time:elapsed});
      if(practice)feedback.textContent='此刻没有指针在红区。';
    }
  }
  document.addEventListener('keydown',report);document.addEventListener('visibilitychange',visibility);
  window.addEventListener('blur',pause);window.addEventListener('focus',resume);
  active={dispose:()=>{
    cancelAnimationFrame(frame);document.removeEventListener('keydown',report);document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('blur',pause);window.removeEventListener('focus',resume);
  }};
  function step(now){
    if(windowFocused)elapsed=Math.min(duration,elapsed+Math.max(0,now-last)/1000);
    last=now;
    const second=Math.ceil(duration-elapsed);
    if(second!==lastSecond){clock.textContent='剩余 '+second+' 秒';lastSecond=second;}
    const target=targets[Math.floor(elapsed/windowSeconds)];
    const phase=target?elapsed-target.start:-1;
    redTarget=null;
    signals.forEach((signal,i)=>{
      let angle;
      if(target?.meter===i&&phase>=0&&phase<excursionSeconds){
        if(target.origin===undefined){
          target.origin=signal(target.start-pausedSeconds[i]);
          target.peak=target.origin<0?-56:56;
          pausedSeconds[i]+=excursionSeconds;
        }
        const ramp=Math.min(1,phase/travelSeconds,(excursionSeconds-phase)/travelSeconds);
        const blend=(1-Math.cos(ramp*Math.PI))/2;
        angle=target.origin+(target.peak-target.origin)*blend;
      }else{
        angle=signal(elapsed-pausedSeconds[i]);
      }
      needles[i].setAttribute('transform','rotate('+(directions[i]+angle)+' 80 80)');
      const over=Math.abs(angle)>=47;
      if(over){target.onset??=elapsed;redTarget=target;}
      needles[i].setAttribute('stroke',over?'#ff9292':'#f0f4ff');
    });
    if(elapsed<duration){frame=requestAnimationFrame(step);return;}
    closeVisit();cancel();
    if(practice){startFormal('四表巡检',()=>runW5(session,false));return;}
    targets.forEach((event,i)=>{
      const from=i*windowSeconds,to=from+windowSeconds;
      assigned.forEach((speed,meter)=>{
        const isTarget=event.meter===meter;
        session.trials.push({trial:i+1,condition,meter:String.fromCharCode(65+meter),speed,seconds:windowSeconds,reference:directions[meter],
          visits:visits.filter(v=>v.meter===meter&&v.start>=from&&v.start<to).length,
          dwellSeconds:visits.filter(v=>v.meter===meter).reduce((sum,v)=>sum+Math.max(0,Math.min(v.end,to)-Math.max(v.start,from)),0),
          crossings:Number(isTarget),hits:Number(isTarget&&event.hit),rtMs:isTarget?event.rtMs:undefined,
          falseAlarms:falseAlarms.filter(e=>e.meter===meter&&e.time>=from&&e.time<to).length});
      });
      session.events.push({condition,trial:i+1,kind:'crossing',...event,speed:assigned[event.meter]});
    });
    session.events.push(...falseAlarms.map(e=>({condition,kind:'falseAlarm',...e})));
    if(blockIndex===0){
      setPage('<h2>第一轮完成</h2><p>休息一下，准备好后开始第二轮。</p><button class="primary" id="nextBlock">开始第二轮</button>');
      active={dispose(){}};
      button('nextBlock',()=>{cancel();runW5(session,false,1);});
    }else finish(session);
  }
  step(last);
}
function design(){
  setPage('<div class="eyebrow">研究说明</div><h2>两项实验</h2><section class="panel"><h3>W5 四表巡检</h3><p>在同一任务中呈现四档常态角速度（8、16、32、64°/秒），每位参与者随机分配表位。指针在两次随机折返之间匀速移动，越限时平滑进入最近的红区，再平滑回到原来的摆动。四根指针始终可见。以鼠标停留位置作为查看位置的操作性代理，用每块表的鼠标访问次数除以有效任务时长，比较访问频率随角速度如何变化。鼠标位置不能等同于真实眼动。原研究操纵的是信号带宽，本版用角速度操纵变化快慢。</p><p>新增参照方向对齐与错开两种条件，同一人各做一轮。表盘的正常方向、红区和指针一起旋转。每轮各表越限四次，事件不重叠。比较两种布局的检出率及命中后的反应时。</p><a href="https://doi.org/10.1109/THFE.1964.231647">Senders（1964）</a></section><br><section class="panel"><h3>W7 双表盘角度估计</h3><p>将角度比例估计改编成左右两个指针表盘。检验起点方向对齐时，绝对估计误差是否小于错开时。每位被试完成两种条件，各 12 题。两种条件共用角度配对，随机混排。</p><a href="https://faculty.washington.edu/aragon/classes/hcde411/w13/readings/cleveland84.pdf">Cleveland 与 McGill（1984）</a></section>');
}
function mean(values){return values.length?values.reduce((s,v)=>s+v,0)/values.length:NaN;}
function fmt(n){return Number.isFinite(n)?n.toFixed(2):'—';}
function uniqueSessions(task){
  return [...new Map(records.filter(r=>r.task===task).map(r=>[r.participant,r])).values()];
}
function results(){
  const w5=uniqueSessions('w5'),w7=uniqueSessions('w7');
  if(!w5.length&&!w7.length){
    const p=publishedSummary;
    setPage('<div class="eyebrow">研究记录</div><h2>数据与结果</h2><p>汇总包含 '+p.n+' 组匿名记录。鼠标位置是操作性代理，不能等同于真实眼动。完整说明见仓库 README。</p><div class="scroll"><table><thead><tr><th>任务</th><th>条件</th><th>被试均值</th></tr></thead><tbody>'+speeds.map((speed,index)=>'<tr><td>四表巡检</td><td>'+speed+' °/秒</td><td>'+p.rates[index].toFixed(2)+' 次／分</td></tr>').join('')+'<tr><td>四表巡检</td><td>鼠标访问率随角速度变化的平均斜率</td><td>'+p.slope.toFixed(2)+' 次／分／(°/秒)</td></tr><tr><td>四表巡检</td><td>参照对齐 · 越限检出</td><td>'+p.alignedDetection.toFixed(2)+'% · '+p.alignedRT.toFixed(2)+' ms</td></tr><tr><td>四表巡检</td><td>参照错开 · 越限检出</td><td>'+p.offsetDetection.toFixed(2)+'% · '+p.offsetRT.toFixed(2)+' ms</td></tr><tr><td>四表巡检</td><td>检出率差值（对齐减错开）</td><td>'+(p.alignedDetection-p.offsetDetection).toFixed(2)+' 个百分点</td></tr><tr><td>双表盘</td><td>起点对齐</td><td>'+p.alignedError.toFixed(2)+' 个百分点</td></tr><tr><td>双表盘</td><td>起点错开</td><td>'+p.offsetError.toFixed(2)+' 个百分点</td></tr><tr><td>双表盘</td><td>被试内差值（错开减对齐）</td><td>'+(p.offsetError-p.alignedError).toFixed(2)+' 个百分点</td></tr></tbody></table></div>');
    return;
  }
  const rate=(session,bw)=>{
    const rows=session.trials.filter(t=>t.speed===bw);
    return 60*rows.reduce((s,t)=>s+t.visits,0)/rows.reduce((s,t)=>s+t.seconds,0);
  };
  const errors=(session,condition)=>mean(session.trials.filter(t=>t.condition===condition).map(t=>t.error));
  const paired=mean(w7.map(s=>errors(s,'offset')-errors(s,'aligned')));
  const slope=mean(w5.map(s=>{
    const center=mean(speeds);
    return speeds.reduce((sum,bw)=>sum+(bw-center)*rate(s,bw),0)/speeds.reduce((sum,bw)=>sum+(bw-center)**2,0);
  }));
  const detection=(session,condition)=>{
    const rows=session.trials.filter(t=>t.condition===condition);
    return 100*rows.reduce((sum,t)=>sum+t.hits,0)/rows.reduce((sum,t)=>sum+t.crossings,0);
  };
  const hitRT=(session,condition)=>mean(session.trials.filter(t=>t.condition===condition&&Number.isFinite(t.rtMs)).map(t=>t.rtMs));
  const detectionRows=['aligned','offset'].map((c,i)=>'<tr><td>四表巡检</td><td>参照'+(i?'错开':'对齐')+' · 越限检出</td><td>'+fmt(mean(w5.map(s=>detection(s,c))))+'% · '+fmt(mean(w5.map(s=>hitRT(s,c)).filter(Number.isFinite)))+' ms</td></tr>').join('');
  const detectionDifference=mean(w5.map(s=>detection(s,'aligned')-detection(s,'offset')));
  const both=w5.filter(a=>w7.some(b=>a.participant===b.participant)).length;
  setPage('<div class="eyebrow">研究记录</div><h2>数据与结果</h2><p>四表巡检 '+w5.length+' 组记录 · 双表盘 '+w7.length+' 组记录 · 两项都完成 '+both+' 组。鼠标位置是操作性代理，不能等同于真实眼动。越限检出与鼠标位置分开统计。</p><div class="actions"><button id="csv">导出 CSV</button><button id="json">导出 JSON</button><label>合并他人数据 <input id="import" type="file" multiple accept=".json,application/json"></label></div><p class="status" id="report" aria-live="polite"></p><div class="scroll"><table><thead><tr><th>任务</th><th>条件</th><th>被试均值</th></tr></thead><tbody>'+speeds.map(bw=>'<tr><td>四表巡检</td><td>'+bw+' °/秒</td><td>'+fmt(mean(w5.map(s=>rate(s,bw))))+' 次／分</td></tr>').join('')+'<tr><td>四表巡检</td><td>鼠标访问率随角速度变化的平均斜率</td><td>'+fmt(slope)+' 次／分／(°/秒)</td></tr>'+detectionRows+'<tr><td>四表巡检</td><td>检出率差值（对齐减错开）</td><td>'+fmt(detectionDifference)+' 个百分点</td></tr><tr><td>双表盘</td><td>起点对齐</td><td>'+fmt(mean(w7.map(s=>errors(s,'aligned'))))+' 个百分点</td></tr><tr><td>双表盘</td><td>起点错开</td><td>'+fmt(mean(w7.map(s=>errors(s,'offset'))))+' 个百分点</td></tr><tr><td>双表盘</td><td>被试内差值（错开减对齐）</td><td>'+fmt(paired)+' 个百分点</td></tr></tbody></table></div>');
  button('json',()=>download('flight-data.json','application/json',JSON.stringify(records,null,2)));
  button('csv',()=>{
    const columns=['id','participant','task','display','trial','condition','meter','speed','reference','seconds','visits','dwellSeconds','crossings','hits','falseAlarms','left','right','leftStart','rightStart','response','target','error','rtMs'];
    const rows=records.flatMap(s=>s.trials.map(t=>({...t,id:s.id,participant:s.participant,task:s.task,display:s.display})));
    const lines=rows.map(row=>columns.map(k=>'"'+String(row[k]??'').replaceAll('"','""')+'"').join(','));
    download('flight-data.csv','text/csv;charset=utf-8','\uFEFF'+[columns.join(','),...lines].join('\r\n'));
  });
  document.querySelector('#import').onchange=async e=>{
    let added=0,skipped=0;
    for(const file of e.target.files){
      try{
        const incoming=JSON.parse(await file.text());
        if(!Array.isArray(incoming))throw Error();
        for(const record of incoming){
          if(!validRecord(record)){skipped++;continue;}
          if(records.some(r=>r.id===record.id))continue;
          records.push(record);added++;
        }
      }catch{skipped++;}
    }
    let warning='';
    try{localStorage.setItem(key,JSON.stringify(records));}catch{warning=' 浏览器未能保存合并结果，请立即导出。';}
    results();document.querySelector('#report').textContent='新增 '+added+' 轮，跳过 '+skipped+' 项无效数据。'+warning;
  };
}
function validRecord(record){
  if(!record||typeof record.id!=='string'||typeof record.participant!=='string'||!Array.isArray(record.trials))return false;
  if(record.task==='w7')return ['aligned','offset'].every(c=>record.trials.filter(t=>t&&t.condition===c&&Number.isFinite(t.error)).length===12)&&record.trials.length===24;
  return record.task==='w5'&&record.display==='visible-speed-smooth-dense-alignment'&&record.trials.length===2*speeds.length*monitorEvents&&['aligned','offset'].every(c=>speeds.every(bw=>record.trials.filter(t=>t&&t.condition===c&&t.speed===bw&&t.seconds>0&&Number.isFinite(t.visits)&&Number.isFinite(t.hits)&&Number.isFinite(t.crossings)).length===monitorEvents));
}
function download(name,type,contents){
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
home();
