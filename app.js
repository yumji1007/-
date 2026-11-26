(() => {
  "use strict";
  const WORDS = (window.WORDS || []).filter(w => w.south !== w.north);
  const STORE_KEY = "malieum-learning-v1";
  const pageNames = {home:"대시보드",cards:"단어 암기하기",match:"단어 매칭 게임",quiz:"단어 퀴즈",review:"오답 복습",records:"나의 학습 기록"};
  const categories = ["일상생활","음식","학교·교육","스포츠","컴퓨터·과학기술","의류","교통","문화·예술","사회·직업"];
  let state = loadState();
  let page = "home", cardDirection = "south", cardLevel = 1, matchLevel = 1, cardQueue = [], cardIndex = 0, flipped = false;
  let game = null, quiz = null, reviewMode = false, timerInterval = null;
  const content = document.getElementById("content");
  const safe = (value) => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      const validIds=new Set(WORDS.map(word=>word.id));
      const mastered=Object.fromEntries(Object.entries(saved.mastered||{}).filter(([id])=>validIds.has(id)));
      const wordStats=Object.fromEntries(Object.entries(saved.wordStats||{}).filter(([id])=>validIds.has(id)));
      return {xp:saved.xp||0, mastered, mistakes:(saved.mistakes||[]).filter(id=>validIds.has(id)), sessions:saved.sessions||[], best:saved.best||0, sound:saved.sound!==false, wordStats};
    } catch (error) {
      console.error("학습 기록을 읽지 못했습니다.", error);
      return {xp:0,mastered:{},mistakes:[],sessions:[],best:0,sound:true,wordStats:{}};
    }
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (error) { console.error("학습 기록을 저장하지 못했습니다.", error); toast("기록을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요."); }
    updateSidebar();
  }
  function toast(message) {
    const node=document.createElement("div"); node.className="toast"; node.textContent=message;
    document.getElementById("toast-region").appendChild(node); setTimeout(()=>node.remove(),2800);
  }
  function sound(correct) {
    if (!state.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx=new AudioContext(), oscillator=ctx.createOscillator(), gain=ctx.createGain();
      oscillator.type="sine"; oscillator.frequency.value=correct?660:220;
      gain.gain.setValueAtTime(.08,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.18);
      oscillator.onended=()=>ctx.close();
    } catch(error) { console.warn("효과음을 재생하지 못했습니다.",error); }
  }
  function shuffle(items) { const result=[...items]; for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result; }
  function levelForXP(xp){return Math.floor(xp/100)+1;}
  function masteredCount(){return Object.values(state.mastered).filter(count=>count>=3).length;}
  function accuracy(){let total=0,correct=0;Object.values(state.wordStats).forEach(s=>{total+=s.seen||0;correct+=s.correct||0});return total?Math.round(correct/total*100):0;}
  function updateSidebar(){
    document.getElementById("wrong-count").textContent=state.mistakes.length;
    document.getElementById("side-level").textContent=`Lv. ${levelForXP(state.xp)}`;
    const soundButton=document.getElementById("sound-toggle");soundButton.setAttribute("aria-pressed",String(state.sound));
  }
  function updateHeader(){
    document.getElementById("breadcrumb-current").textContent=pageNames[page]||"대시보드";
    const now=new Date();document.getElementById("today-date").textContent=new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"short"}).format(now);
    document.querySelectorAll(".nav-item").forEach(button=>button.classList.toggle("active",button.dataset.page===page));
  }
  function navigate(next){
    clearInterval(timerInterval);timerInterval=null;
    if(next==="match"&&game?.ended)game=null;
    if(next==="cards"&&!cardQueue.length){reviewMode=false;cardQueue=shuffle(getWords(cardLevel));cardIndex=0;flipped=false;}
    page=next;updateHeader();
    document.getElementById("sidebar").classList.remove("open");
    ({home:renderHome,cards:renderCards,match:renderMatch,quiz:renderQuiz,review:renderReview,records:renderRecords}[page]||renderHome)();
  }
  function heading(kicker,title,description,actions=""){
    return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
  }
  function renderHome(){
    const latest=state.sessions.slice(-3).reverse();
    content.innerHTML=`
      <section class="hero"><div class="hero-copy"><div class="hero-kicker">LANGUAGE BRINGS US CLOSER</div><h1>서로 다른 말,<br><em>하나로 이어지는 우리</em></h1><p>말을 알아가며 마음을 잇는 작은 공부를 시작해요.</p><div class="hero-actions"><button class="btn btn-primary" data-action="start-match">매칭 게임 시작 <span>→</span></button><button class="btn" data-action="go-cards">단어 먼저 보기</button></div></div><div class="hero-art" aria-hidden="true"><div class="hero-card one">남한말<span>어떤 말일까요?</span></div><div class="hero-card two">북한말<span>새로운 말 한 조각</span></div></div></section>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-head"><span>누적 경험치</span><span class="stat-symbol">✦</span></div><div class="stat-value">${state.xp}<small>XP</small></div></div>
        <div class="stat-card"><div class="stat-head"><span>나의 레벨</span><span class="stat-symbol">◇</span></div><div class="stat-value">Lv. ${levelForXP(state.xp)}<small>학습 중</small></div><div class="progress-track"><i style="width:${state.xp%100}%"></i></div></div>
        <div class="stat-card"><div class="stat-head"><span>암기 완료</span><span class="stat-symbol">✓</span></div><div class="stat-value">${masteredCount()}<small>/ ${WORDS.length} 단어</small></div></div>
        <div class="stat-card"><div class="stat-head"><span>최고 점수</span><span class="stat-symbol">↗</span></div><div class="stat-value">${state.best}<small>점</small></div></div>
      </div>
      <div class="section-title"><h2>오늘의 학습</h2><button data-page="records">학습 기록 보기 →</button></div>
      <div class="menu-grid">
        <button class="menu-card" data-page="cards"><span class="menu-icon">▤</span><strong>단어 암기하기</strong><small>카드를 넘기며 새 단어 익히기</small></button>
        <button class="menu-card" data-page="match"><span class="menu-icon">⤧</span><strong>단어 매칭 게임</strong><small>같은 뜻의 단어 카드 연결하기</small></button>
        <button class="menu-card" data-page="quiz"><span class="menu-icon">✳</span><strong>단어 퀴즈</strong><small>배운 단어를 가볍게 확인하기</small></button>
        <button class="menu-card" data-page="review"><span class="menu-icon">↻</span><strong>오답 복습</strong><small>헷갈린 단어 ${state.mistakes.length}개 다시 보기</small></button>
        <button class="menu-card" data-page="records"><span class="menu-icon">▥</span><strong>나의 학습 기록</strong><small>꾸준히 쌓이는 나의 학습 여정</small></button>
        <button class="menu-card" data-action="source-note"><span class="menu-icon">◎</span><strong>단어 데이터 안내</strong><small>출처와 검증 원칙 확인하기</small></button>
      </div>
      <div class="dashboard-bottom">
        <section class="panel"><div class="panel-heading"><h3>최근 학습</h3><span>최근 3회</span></div>${latest.length?`<div class="recent-list">${latest.map(s=>`<div class="recent-item"><span class="recent-badge">⤧</span><div><strong>${s.mode==="review"?"오답 복습 게임":"단어 매칭 게임"}</strong><small>${safe(s.date)} · ${s.pairs}쌍 학습</small></div><span class="recent-score">${s.score}점</span></div>`).join("")}</div>`:`<div class="empty-hint">아직 학습 기록이 없어요.<br>첫 게임을 시작해 나만의 기록을 만들어 보세요.</div>`}</section>
        <section class="panel"><div class="panel-heading"><h3>나의 학습 진행률</h3><span>${WORDS.length}개 단어</span></div><div class="record-big">${WORDS.length?Math.round(masteredCount()/WORDS.length*100):0}<small style="font-size:12px;color:#97a39f">%</small></div><div class="progress-track"><i style="width:${WORDS.length?masteredCount()/WORDS.length*100:0}%"></i></div><div class="record-caption" style="margin-top:9px">단어마다 3회 이상 정답을 맞히면 암기 완료로 표시돼요.</div></section>
      </div>${sourceNote()}`;
    updateSidebar();
  }
  function sourceNote(){
    return `<aside class="source-note" id="source-note"><strong>단어 데이터 안내</strong><br>현재 ${WORDS.length}쌍을 겨레말큰사전의 개별 표제어 자료와 대조해 수록했어요. 카드마다 원문 출처가 연결되어 있습니다. 뜻풀이나 예문은 학습을 위해 새로 작성했어요. <a href="https://www.gyeoremal.or.kr/words/living_view.php?sq=167" target="_blank" rel="noopener">아이스크림 관련 원문</a>은 북에서도 ‘아이스크림’을 쓰며 ‘얼음보숭이’보다 ‘에스키모’를 더 많이 쓴다고 설명합니다. 이를 반영해 잘못된 짝 ‘아이스크림–얼음보숭이’를 제거했어요. 일부 카드는 남북의 뜻이 다른 게 아니라 표기 차이를 익히는 카드입니다. 출처: <a href="https://www.gyeoremal.or.kr/words/index.php" target="_blank" rel="noopener">겨레말큰사전 남북 언어 자료</a>.</aside>`;
  }
  function getWords(level, includeAll=false){
    return WORDS.filter(w=>(includeAll||w.level<=level));
  }
  function startCards(review=false){
    reviewMode=review;
    let candidates=review?WORDS.filter(w=>state.mistakes.includes(w.id)):getWords(cardLevel);
    if(!candidates.length){toast("복습할 오답이 없어요. 게임을 먼저 해볼까요?");return;}
    cardQueue=shuffle(candidates);cardIndex=0;flipped=false;navigate(review?"review":"cards");renderCards();
  }
  function renderCards(){
    const isReview=page==="review"&&reviewMode;
    if(!cardQueue.length){
      content.innerHTML=`${heading(isReview?"REVIEW":"FLASHCARDS",isReview?"오답 복습":"단어 암기하기",isReview?"틀렸던 단어를 다시 확인해요.":"카드를 눌러 남북한의 단어를 비교해 보세요.")}<section class="panel empty-state"><span style="font-size:25px">✦</span><strong>${isReview?"복습할 오답이 없어요":"학습할 단어가 없어요"}</strong><span>${isReview?"매칭 게임에서 틀린 단어가 여기에 모여요.":"다른 난이도를 선택해 주세요."}</span><br><button class="btn btn-primary" data-page="match">매칭 게임 시작</button></section>${sourceNote()}`;
      return;
    }
    cardIndex=Math.min(cardIndex,cardQueue.length-1);
    const word=cardQueue[cardIndex],front=cardDirection==="south"?word.south:word.north,back=cardDirection==="south"?word.north:word.south;
    const done=state.mastered[word.id]||0;
    content.innerHTML=`${heading(isReview?"REVIEW MODE":"FLASHCARDS",isReview?"오답 복습":"단어 암기하기",isReview?"다시 보면 더 오래 기억나요.":"카드를 누르면 뜻과 예문, 짝이 되는 단어를 확인할 수 있어요.",isReview?`<button class="btn" data-action="clear-review">복습 종료</button>`:`<button class="btn" data-action="start-match">게임으로 연습 →</button>`)}
      <section class="panel" style="max-width:780px;margin:0 auto"><div class="game-toolbar"><div class="segmented"><button data-direction="south" class="${cardDirection==="south"?"selected":""}">남한말 → 북한말</button><button data-direction="north" class="${cardDirection==="north"?"selected":""}">북한말 → 남한말</button></div><span class="record-caption">분야 · ${safe(word.category)} &nbsp; / &nbsp; ${isReview?"복습":`초급·중급·고급`}</span></div>
      <div class="flash-progress"><span>${cardIndex+1} / ${cardQueue.length} 단어</span><strong>반복 정답 ${done} / 3</strong></div><div class="progress-track"><i style="width:${(cardIndex+1)/cardQueue.length*100}%"></i></div>
      <div class="flashcard-wrap"><div class="flashcard ${flipped?"flipped":""}" id="flashcard" role="button" tabindex="0" aria-label="단어 카드 뒤집기"><div class="flash-face flash-front"><span class="flash-label">${cardDirection==="south"?"SOUTH KOREA":"NORTH KOREA"}</span><strong class="flash-word">${safe(front)}</strong><span class="flash-hint">눌러서 짝 단어 확인하기 ↻</span></div><div class="flash-face flash-back"><span class="flash-label">${cardDirection==="south"?"NORTH KOREA":"SOUTH KOREA"} · ${safe(word.category)}</span><strong class="flash-word">${safe(back)}</strong><span class="flash-meaning">${safe(word.meaning)}</span><span class="flash-example">“${safe(word.example)}”</span><a class="source-link" href="${safe(word.source)}" target="_blank" rel="noopener">출처 원문 확인 ↗</a></div></div></div>
      <div class="flash-actions"><button class="btn" data-action="card-again">다시 학습</button><button class="btn btn-primary" data-action="card-known">암기 완료</button></div><div class="flash-side-note">암기 완료를 여러 번 선택해 3회 정답을 쌓으면 학습 기록에 반영돼요.</div></section>${sourceNote()}`;
    const flip=document.getElementById("flashcard");flip.addEventListener("click",()=>{flipped=!flipped;flip.classList.toggle("flipped",flipped);});flip.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();flip.click();}});
  }
  function cardAnswer(known){
    const word=cardQueue[cardIndex];if(!word)return;
    if(known){
      state.mastered[word.id]=(state.mastered[word.id]||0)+1;
      const stats=state.wordStats[word.id]||{seen:0,correct:0};stats.seen++;stats.correct++;state.wordStats[word.id]=stats;
      state.xp+=5;if(state.mastered[word.id]===3)toast(`${word.north} 암기 완료! +5 XP`);
      saveState();
    }else{
      if(!cardQueue.slice(cardIndex+1).some(w=>w.id===word.id))cardQueue.push(word);
      toast("괜찮아요. 뒤에서 다시 만나요.");
    }
    cardIndex++;flipped=false;
    if(cardIndex>=cardQueue.length){cardQueue=[];toast("카드 학습을 마쳤어요!");}
    renderCards();
  }
  function beginMatch(review=false){
    reviewMode=review;
    const level=matchLevel;
    const candidates=review?WORDS.filter(w=>state.mistakes.includes(w.id)):getWords(level);
    if(!candidates.length){toast(review?"복습할 오답이 없어요.":"선택한 난이도의 단어가 없어요.");return;}
    const count=review?Math.min(8,candidates.length):level*2+2;
    const pairs=shuffle(candidates).slice(0,Math.min(count,candidates.length));
    game={level,pairs,south:shuffle(pairs.map(w=>w.id)),north:shuffle(pairs.map(w=>w.id)),matched:new Set(),selected:null,wrong:null,errors:new Set(),score:0,correct:0,combo:0,maxCombo:0,started:Date.now(),ended:false};
    clearInterval(timerInterval);timerInterval=setInterval(()=>{if(game&&!game.ended){const el=document.getElementById("elapsed");if(el)el.textContent=fmtTime(Math.floor((Date.now()-game.started)/1000));}},1000);
    renderMatchBoard();
  }
  function fmtTime(seconds){return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;}
  function renderMatch(){
    const mistakes=state.mistakes.length;
    content.innerHTML=`${heading("WORD MATCH",reviewMode?"틀린 단어 다시 맞추기":"단어 매칭 게임",reviewMode?`${mistakes}개의 오답 카드로 다시 도전해요.`:"같은 뜻의 남한말과 북한말을 찾아 짝을 지어 주세요.")}<section class="game-layout"><div class="game-main"><div class="game-toolbar"><div class="segmented" id="difficulty"><button data-level="1" class="${matchLevel===1?"selected":""}">초급 · 4쌍</button><button data-level="2" class="${matchLevel===2?"selected":""}">중급 · 6쌍</button><button data-level="3" class="${matchLevel===3?"selected":""}">고급 · 8쌍</button></div><button class="btn btn-small" data-action="restart">↻ 다시 시작</button></div><div class="game-meta"><div class="meta-box"><small>경과 시간</small><strong id="elapsed">00:00</strong></div><div class="meta-box"><small>점수</small><strong id="score">0</strong></div><div class="meta-box"><small>연속 정답</small><strong id="combo">0</strong></div><div class="meta-box"><small>남은 카드</small><strong id="remaining">${matchLevel*2+2}</strong></div></div><div class="match-board" id="match-board"><div class="empty-state" style="grid-column:1/-1;padding:35px 10px"><strong>준비가 되면 시작해요</strong><span>난이도를 고르고 카드를 맞춰 보세요.</span><br><button class="btn btn-primary" data-action="start-game">게임 시작</button></div></div><div class="game-message" id="game-message" aria-live="polite"></div></div><aside class="game-side"><h3>이번 게임</h3><div class="side-info"><strong>정답 횟수 <span id="correct-count">0</span></strong><p>맞힌 쌍마다 기본 점수 100점, 연속 정답은 추가 점수를 받아요.</p></div><div class="side-info"><strong>게임 방법</strong><p>왼쪽 남한말과 오른쪽 북한말 카드를 하나씩 선택하세요. 같은 뜻이면 카드가 사라져요.</p></div><div class="side-info"><strong>학습 보상</strong><p>게임 경험치와 암기 기록은 이 기기에 저장됩니다. 단어를 3회 이상 맞히면 암기 완료예요.</p></div><button class="btn btn-soft" data-action="sound-toggle-inline">♫ 효과음 ${state.sound?"켜짐":"꺼짐"}</button></aside></section>${sourceNote()}`;
    const levelButton=content.querySelector(`[data-level="${matchLevel}"]`);if(levelButton)levelButton.classList.add("selected");
    if(game)renderMatchBoard();
  }
  function renderMatchBoard(){
    if(!game)return;const board=document.getElementById("match-board");if(!board)return;
    const active=(side,id)=>game.matched.has(id)?"matched":game.wrong?.includes(`${side}:${id}`)?"wrong":game.selected?.side===side&&game.selected.id===id?"selected":"";
    board.innerHTML=`<div class="match-column"><div class="column-label">남한말 · SOUTH</div>${game.south.map(id=>{const w=game.pairs.find(x=>x.id===id);return `<button class="match-card south-card ${active("s",id)}" data-side="s" data-id="${id}" ${game.matched.has(id)?"disabled":""}>${safe(w.south)}</button>`}).join("")}</div><div class="match-column"><div class="column-label north">북한말 · NORTH</div>${game.north.map(id=>{const w=game.pairs.find(x=>x.id===id);return `<button class="match-card north-card ${active("n",id)}" data-side="n" data-id="${id}" ${game.matched.has(id)?"disabled":""}>${safe(w.north)}</button>`}).join("")}</div>`;
    document.getElementById("score").textContent=game.score;document.getElementById("combo").textContent=game.combo;document.getElementById("correct-count").textContent=game.correct;document.getElementById("remaining").textContent=(game.pairs.length-game.matched.size)*2;
    board.querySelectorAll(".match-card:not(:disabled)").forEach(button=>button.addEventListener("click",()=>selectMatch(button.dataset.side,button.dataset.id)));
  }
  function selectMatch(side,id){
    if(!game||game.ended||game.matched.has(id)||game.wrong)return;
    if(game.selected?.side===side&&game.selected.id===id){game.selected=null;renderMatchBoard();return;}
    if(!game.selected){game.selected={side,id};renderMatchBoard();return;}
    const first=game.selected,second={side,id};
    if(first.side===side){game.selected=second;renderMatchBoard();return;}
    const match=first.id===second.id;
    if(match){
      game.matched.add(id);game.combo++;game.maxCombo=Math.max(game.maxCombo,game.combo);game.correct++;
      game.score+=100+(game.combo>1?Math.min(50,(game.combo-1)*10):0);game.selected=null;
      state.mistakes=state.mistakes.filter(wid=>wid!==id);
      state.mastered[id]=(state.mastered[id]||0)+1;
      const stat=state.wordStats[id]||{seen:0,correct:0};stat.seen++;stat.correct++;state.wordStats[id]=stat;
      sound(true);saveState();renderMatchBoard();
      const message=document.getElementById("game-message");if(message)message.textContent=game.combo>1?`정답! ${game.combo}콤보 보너스 ✦`:"정답이에요! 좋은 연결이에요.";
      if(game.matched.size===game.pairs.length)setTimeout(finishGame,500);
    }else{
      game.combo=0;game.wrong=[`${first.side}:${first.id}`,`${side}:${id}`];
      game.errors.add(first.id);game.errors.add(id);
      [first.id,id].forEach(wid=>{if(!state.mistakes.includes(wid))state.mistakes.push(wid);const s=state.wordStats[wid]||{seen:0,correct:0};s.seen++;state.wordStats[wid]=s;});
      saveState();sound(false);renderMatchBoard();
      const message=document.getElementById("game-message");if(message)message.textContent="다른 뜻의 단어예요. 오답 목록에 담아 두었어요.";
      setTimeout(()=>{if(!game||game.ended)return;game.wrong=null;game.selected=null;renderMatchBoard();},650);
    }
  }
  function finishGame(){
    if(!game||game.ended)return;game.ended=true;clearInterval(timerInterval);timerInterval=null;
    const elapsed=Math.floor((Date.now()-game.started)/1000),total=game.pairs.length,percent=total?Math.round(game.correct/total*100):0;
    const earned=Math.round(game.score/10)+total*5;state.xp+=earned;state.best=Math.max(state.best,game.score);
    const session={mode:reviewMode?"review":"match",date:new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric"}).format(new Date()),pairs:total,score:game.score,elapsed,accuracy:percent,combo:game.maxCombo,words:game.pairs.map(w=>w.id),wrongs:[...game.errors]};
    state.sessions.push(session);state.sessions=state.sessions.slice(-50);saveState();renderResult(session);
  }
  function renderResult(session){
    page="result";updateHeader();
    const learned=session.words.map(id=>WORDS.find(w=>w.id===id)).filter(Boolean);
    const wrong=learned.filter(w=>(session.wrongs||[]).includes(w.id));
    content.innerHTML=`${heading("GAME COMPLETE","오늘의 게임을 마쳤어요!",`${earnedMessage()} · +${Math.round(session.score/10)+session.pairs*5} XP`)}<section class="result-card"><div class="result-mark">✦</div><h2>오늘 배운 단어만큼<br>서로를 이해하는 마음도 가까워졌어요!</h2><p>함께한 언어의 시간이 차곡차곡 쌓이고 있어요.</p></section><div class="result-stats"><div class="result-stat"><small>최종 점수</small><strong>${session.score}</strong></div><div class="result-stat"><small>게임 소요 시간</small><strong>${fmtTime(session.elapsed)}</strong></div><div class="result-stat"><small>정답률</small><strong>${session.accuracy}%</strong></div><div class="result-stat"><small>최고 연속 정답</small><strong>${session.combo} 콤보</strong></div></div><div class="result-columns"><section class="result-panel"><h3>이번에 만난 단어 · ${learned.length}쌍</h3><div class="word-chip-list">${learned.map(w=>`<span class="word-chip">${safe(w.south)} · ${safe(w.north)}</span>`).join("")}</div></section><section class="result-panel"><h3>다시 살펴볼 단어 · ${wrong.length}쌍</h3>${wrong.length?`<div class="word-chip-list">${wrong.map(w=>`<span class="word-chip wrong-chip">${safe(w.south)} · ${safe(w.north)}</span>`).join("")}</div>`:`<div class="empty-hint">틀린 단어 없이 모두 연결했어요. 훌륭해요!</div>`}</section></div><section class="panel"><div class="panel-heading"><h3>전체 단어 암기 진행률</h3><span>${masteredCount()} / ${WORDS.length} 단어</span></div><div class="progress-track"><i style="width:${WORDS.length?masteredCount()/WORDS.length*100:0}%"></i></div><div class="record-caption" style="margin-top:8px">${WORDS.length?Math.round(masteredCount()/WORDS.length*100):0}% · 단어마다 3회 이상 정답을 맞히면 암기 완료돼요.</div></section><div class="result-actions"><button class="btn" data-page="records">학습 기록 보기</button>${wrong.length?`<button class="btn btn-soft" data-action="review-now">틀린 단어 복습</button>`:""}<button class="btn btn-primary" data-action="play-again">한 판 더 하기 →</button></div>${sourceNote()}`;
  }
  function earnedMessage(){return `레벨 ${levelForXP(state.xp)} · 누적 ${state.xp} XP`;}
  function renderQuiz(){
    const candidates=getWords(3);    if(!quiz)quiz={items:shuffle(candidates).slice(0,10),index:0,correct:0,answered:false};
    if(!quiz.items.length){content.innerHTML=`${heading("QUICK QUIZ","단어 퀴즈","현재 퀴즈로 낼 단어가 없어요.")}`;return;}
    if(quiz.index>=quiz.items.length){const pct=Math.round(quiz.correct/quiz.items.length*100);content.innerHTML=`${heading("QUIZ COMPLETE","퀴즈 끝!",`${quiz.items.length}문제 중 ${quiz.correct}문제를 맞혔어요.`)}<section class="result-card"><div class="result-mark">✳</div><h2>${pct}% 정답</h2><p>퀴즈도 반복해서 풀면 단어가 더 오래 기억돼요.</p></section><div class="result-actions"><button class="btn" data-page="home">대시보드</button><button class="btn btn-primary" data-action="new-quiz">다시 도전</button></div>`;return;}
    const word=quiz.items[quiz.index];
    const options=shuffle([word,...shuffle(candidates.filter(w=>w.id!==word.id)).slice(0,3)]);
    quiz.current=word;quiz.options=options;
    content.innerHTML=`${heading("QUICK QUIZ","단어 퀴즈","남한말과 같은 뜻을 가진 북한말을 골라 보세요.")}<section class="quiz-question"><div class="quiz-top"><span>QUESTION ${quiz.index+1} / ${quiz.items.length}</span><span>${quiz.correct}개 정답</span></div><div class="quiz-word"><small>SOUTH KOREA · ${safe(word.category)}</small><strong>${safe(word.south)}</strong></div><div class="quiz-options">${options.map(option=>`<button class="quiz-option" data-answer="${option.id}">${safe(option.north)}</button>`).join("")}</div><div class="quiz-feedback" id="quiz-feedback" aria-live="polite"></div><div class="quiz-next"><button class="btn btn-primary" id="quiz-next" style="display:none">다음 문제 →</button></div></section>${sourceNote()}`;
    content.querySelectorAll(".quiz-option").forEach(button=>button.addEventListener("click",()=>answerQuiz(button.dataset.answer)));
  }
  function answerQuiz(answer){
    if(quiz.answered)return;quiz.answered=true;const word=quiz.current,correct=answer===word.id;
    content.querySelectorAll(".quiz-option").forEach(button=>{button.disabled=true;if(button.dataset.answer===word.id)button.classList.add("correct");else if(button.dataset.answer===answer)button.classList.add("wrong");});
    const feedback=document.getElementById("quiz-feedback");
    if(correct){quiz.correct++;state.mastered[word.id]=(state.mastered[word.id]||0)+1;state.xp+=5;const s=state.wordStats[word.id]||{seen:0,correct:0};s.seen++;s.correct++;state.wordStats[word.id]=s;feedback.textContent="정답이에요! +5 XP";}
    else{if(!state.mistakes.includes(word.id))state.mistakes.push(word.id);const s=state.wordStats[word.id]||{seen:0,correct:0};s.seen++;state.wordStats[word.id]=s;feedback.textContent=`아쉬워요. ${word.south}은(는) 북한말로 ${word.north}예요.`;}
    sound(correct);saveState();const next=document.getElementById("quiz-next");next.style.display="inline-block";
    next.addEventListener("click",()=>{quiz.index++;quiz.answered=false;renderQuiz();},{once:true});
  }
  function renderReview(){
    if(reviewMode&&cardQueue.length){renderCards();return;}
    reviewMode=false;const wrongWords=WORDS.filter(w=>state.mistakes.includes(w.id));
    content.innerHTML=`${heading("REVIEW","오답 복습","매칭 게임과 퀴즈에서 틀린 단어를 모아 다시 연습해요.",wrongWords.length?`<button class="btn btn-primary" data-action="review-game">오답으로 게임하기 →</button>`:"")}
      <section class="panel">${wrongWords.length?`<div class="panel-heading"><h3>다시 볼 단어</h3><span>${wrongWords.length}쌍</span></div><div class="recent-list">${wrongWords.map(w=>`<div class="recent-item"><span class="recent-badge" style="background:#fbefed;color:#b37c73">↻</span><div><strong>${safe(w.south)} <span style="color:#aab4b1">↔</span> ${safe(w.north)}</strong><small>${safe(w.meaning)}</small></div><button class="btn btn-small" data-review-word="${w.id}">뜻 보기</button></div>`).join("")}</div>`:`<div class="empty-state"><span style="font-size:25px">✦</span><strong>복습할 오답이 없어요</strong><span>매칭 게임이나 퀴즈에서 틀린 단어가 이곳에 쌓여요.</span><br><button class="btn btn-primary" data-page="match">매칭 게임 시작</button></div>`}</section>${sourceNote()}`;
  }
  function renderRecords(){
    const days=new Set(state.sessions.map(s=>s.date)).size, totalWords=new Set(state.sessions.flatMap(s=>s.words||[])).size;
    content.innerHTML=`${heading("MY LEARNING","나의 학습 기록","작은 학습이 쌓여 만든 나만의 기록이에요.",`<button class="btn btn-small" data-action="export">기록 내보내기</button>`)}
      <div class="records-grid"><section class="panel"><div class="panel-heading"><h3>나의 성취</h3><span>차근차근 쌓이는 중</span></div><div class="record-big">Lv. ${levelForXP(state.xp)}</div><div class="record-caption">${state.xp} XP · 다음 레벨까지 ${100-state.xp%100} XP</div><div class="progress-track"><i style="width:${state.xp%100}%"></i></div><div class="side-info"><strong>개인 최고 기록</strong><p>${state.best}점</p></div><div class="side-info"><strong>총 학습 횟수</strong><p>${state.sessions.length}회 · ${days}일 학습</p></div></section>
      <section class="panel"><div class="panel-heading"><h3>단어 진행률</h3><span>${masteredCount()} / ${WORDS.length} 암기 완료</span></div><div class="record-big">${WORDS.length?Math.round(masteredCount()/WORDS.length*100):0}%</div><div class="progress-track"><i style="width:${WORDS.length?masteredCount()/WORDS.length*100:0}%"></i></div><div class="record-caption" style="margin-top:8px">같은 단어를 3회 이상 정답으로 학습하면 완료로 기록해요.</div><div class="side-info"><strong>학습 정확도</strong><p>${accuracy()}%</p></div><div class="side-info"><strong>이번 기기에서 만난 단어</strong><p>${totalWords}개</p></div></section></div>
      <section class="panel" style="margin-top:14px"><div class="panel-heading"><h3>분야별 단어</h3><span>학습 카드 기준</span></div>${categories.map(cat=>{const count=WORDS.filter(w=>w.category===cat).length;return `<div class="category-row"><span>${cat}</span><div class="progress-track"><i style="width:${WORDS.length?count/WORDS.length*100:0}%"></i></div><strong>${count}</strong></div>`}).join("")}</section>
      <section class="panel" style="margin-top:14px"><div class="panel-heading"><h3>학습 업적</h3><span>암기 완료 단어 기준</span></div><div class="word-chip-list">${[5,10,20].map(target=>`<span class="word-chip ${masteredCount()>=target?"":"wrong-chip"}">${masteredCount()>=target?"✓":"○"} ${target}개 암기 ${masteredCount()>=target?"달성":"도전 중"}</span>`).join("")}</div></section>
      <section class="panel" style="margin-top:14px"><div class="panel-heading"><h3>최근 게임 기록</h3><span>최대 50회 저장</span></div>${state.sessions.length?`<div class="recent-list">${state.sessions.slice(-8).reverse().map(s=>`<div class="recent-item"><span class="recent-badge">⤧</span><div><strong>${s.mode==="review"?"오답 복습":"매칭 게임"} · ${s.pairs}쌍</strong><small>${safe(s.date)} · ${fmtTime(s.elapsed)} · 정답률 ${s.accuracy}% · 최고 ${s.combo}콤보</small></div><span class="recent-score">${s.score}점</span></div>`).join("")}</div>`:`<div class="empty-hint">첫 게임을 시작하면 학습 기록이 이곳에 저장돼요.</div>`}</section>${sourceNote()}`;
  }
  function startReviewGame(){
    if(!state.mistakes.length){toast("복습할 오답이 없어요.");return;}
    reviewMode=true;navigate("match");beginMatch(true);
  }
  document.addEventListener("click",event=>{
    const pageButton=event.target.closest("[data-page]");if(pageButton){event.preventDefault();navigate(pageButton.dataset.page);return;}
    const actionButton=event.target.closest("[data-action]");if(!actionButton)return;
    const action=actionButton.dataset.action;
    if(action==="start-match"){reviewMode=false;navigate("match");renderMatch();}
    if(action==="go-cards"){reviewMode=false;cardLevel=1;cardQueue=shuffle(getWords(cardLevel));cardIndex=0;navigate("cards");}
    if(action==="start-game"){game={level:1};beginMatch(false);}
    if(action==="restart"){reviewMode=false;beginMatch(false);}
    if(action==="play-again"){reviewMode=false;navigate("match");renderMatch();}
    if(action==="review-now")startCards(true);
    if(action==="review-game")startReviewGame();
    if(action==="new-quiz"){quiz=null;navigate("quiz");}
    if(action==="card-known")cardAnswer(true);
    if(action==="card-again")cardAnswer(false);
    if(action==="clear-review"){reviewMode=false;cardQueue=[];navigate("review");}
    if(action==="sound-toggle-inline"){state.sound=!state.sound;saveState();renderMatch();}
    if(action==="source-note")document.getElementById("source-note")?.scrollIntoView({behavior:"smooth",block:"center"});
    if(action==="export")exportRecords();
  });
  document.addEventListener("click",event=>{
    const dir=event.target.closest("[data-direction]");if(dir){cardDirection=dir.dataset.direction;flipped=false;renderCards();return;}
    const level=event.target.closest("[data-level]");if(level){matchLevel=Number(level.dataset.level);renderMatch();return;}
    const reviewWord=event.target.closest("[data-review-word]");if(reviewWord){reviewMode=true;cardQueue=[WORDS.find(w=>w.id===reviewWord.dataset.reviewWord)].filter(Boolean);cardIndex=0;flipped=true;navigate("cards");return;}
  });
  function exportRecords(){
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),xp:state.xp,mastered:state.mastered,mistakes:state.mistakes,sessions:state.sessions},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="말로-잇는-우리-학습기록.json";a.click();URL.revokeObjectURL(url);toast("학습 기록을 내보냈어요.");
  }
  document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>navigate(button.dataset.page)));
  document.getElementById("sound-toggle").addEventListener("click",()=>{state.sound=!state.sound;saveState();});
  document.getElementById("mobile-menu").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
  content.addEventListener("change",event=>{if(event.target.id==="match-level")cardLevel=Number(event.target.value);});
  renderHome();updateHeader();updateSidebar();
})();
