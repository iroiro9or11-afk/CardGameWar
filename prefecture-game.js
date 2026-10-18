/* 都道府県カード戦争 v1.0.12 — offline campaign layer over the original card editor/battle engine */
'use strict';

let campaignState = null;
let campaignBattleOverride = null;
let campaignBattlePending = null;
let campaignHeadlessBattle = false;
let prefProcessingPromise = null;
let prefCurrentHolderTab = 'unit';
let prefCurrentMarketTab = 'unit';
let prefMarketOwnOnly = false;
let prefHolderSearch = '';
let prefMarketSearch = '';
let prefPendingNotice = '';
let prefTurnStartAbs = 1;

const PREF_STATE_KEY = 'prefecture_campaign_state_v1';
const PREF_PLAYER_ID = '京都府';
const PREF_UNIT_LIMIT = 10;
const PREF_RIVAL_UNIT_LIMIT = 5;
const PREF_MAX_BATTLE_UNITS = 5;
const PREF_BATTLE_ACTIVE = 3;
const PREF_CARD_LIFETIME = 52;
const PREF_MARKET_LIFETIME = 5;
const PREF_FUNDING_WEEKS = [1, 14, 27, 40];
const PREF_FUNDING_BY_TIER = { S: 1000000000, A: 700000000, B: 500000000, C: 300000000, D: 150000000, E: 100000000 };
const PREF_GACHA = {
  A: { label: 'Aランクガチャ', price: 50000000, odds: [{kind:'unit',rank:5,weight:20},{kind:'unit',rank:4,weight:70},{kind:'magic',weight:10}] },
  B: { label: 'Bランクガチャ', price: 10000000, odds: [{kind:'unit',rank:5,weight:1},{kind:'unit',rank:4,weight:50},{kind:'unit',rank:3,weight:29},{kind:'magic',weight:20}] },
  C: { label: 'Cランクガチャ', price: 2000000, odds: [{kind:'unit',rank:4,weight:10},{kind:'unit',rank:3,weight:40},{kind:'magic',weight:50}] },
  magic: { label: 'マジックカードガチャ', price: 1000000, odds: [{kind:'magic',weight:100}] }
};
const PREF_REGIONS = [
 '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
 '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
 '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
 '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
];
const PREF_RANK_COUNTS = [{tier:'S',count:1},{tier:'A',count:3},{tier:'B',count:5},{tier:'C',count:10},{tier:'D',count:10},{tier:'E',count:18}];
const PREF_RANK_UNIT_RECIPE = { S:[5,5,5,5,5], A:[5,5,4,4,4], B:[5,4,4,4,4], C:[4,4,4,4,4], D:[4,4,4,3,3], E:[4,3,3,3,3] };
const PREF_TIER_VALUE = { S:6, A:5, B:4, C:3, D:2, E:1 };
const PREF_TIER_COLORS = { S:'text-fuchsia-200 bg-fuchsia-950/70 border-fuchsia-500/50', A:'text-amber-200 bg-amber-950/70 border-amber-500/50', B:'text-cyan-200 bg-cyan-950/70 border-cyan-500/50', C:'text-emerald-200 bg-emerald-950/70 border-emerald-500/50', D:'text-slate-200 bg-slate-800/70 border-slate-600', E:'text-slate-300 bg-slate-900 border-slate-700' };
const PREF_NAMES = ['ヤマダタロウ','サトウハナコ','スズキレン','タナカユウ','イトウミサキ','ワタナベカイト','ナカムラアオイ','コバヤシハル','カトウユナ','ヨシダソウタ','エミリージャクソン','アレックスカーター','オリビアベネット','ノアウィリアムズ','ソフィアミラー','リアムデイビス','ルナヴァイス','カイヴァルグ','エルナフェリス','ゼノアルカ','ミリアローゼ','レオンハルト','アリアクロウ','ユリウスノクス','セラフィナ','ガブリエルロウ','ミカエルヴェイン','クロエマルタン','イザベルデュラン','エンゾロッシ','ニコラスグレイ','エヴァンストーン','ハナミズキ','カミヤシオン','ホシノミナト','クガレイ','キリサキユウト','ミナセアキラ','アサクラヒナ','フジサワトオル','リリィスター','レイヴンフォール','ノエルヴァレン','シオンアーク','ミライオリオン','タチバナユキ','カゲヤマジン','アマノセツナ','ルーファスベル','エリスムーン','マコトヤマモト','ナナセユイ','ヴァルタークロイツ'];
const PREF_PERSONALITIES = [
  {id:'aggressive',name:'積極対戦派',battle:0.82,investigate:0.18,focus:'勝利と高ランクカードを重視',intelligence:'expert'},
  {id:'careful',name:'慎重派',battle:0.42,investigate:0.58,focus:'資金維持と安定した戦力を重視',intelligence:'master'},
  {id:'scout',name:'情報収集派',battle:0.36,investigate:0.64,focus:'相手の情報収集と有利な対戦を重視',intelligence:'expert'},
  {id:'collector',name:'カード収集派',battle:0.54,investigate:0.46,focus:'市場とガチャでカードを集める',intelligence:'normal'},
  {id:'trickster',name:'技巧派',battle:0.63,investigate:0.37,focus:'属性やスキル効果の相性を重視',intelligence:'master'}
];

function prefRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function prefShuffle(arr) { const out=[...(arr||[])]; for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out; }
function prefClamp(n,min,max) { n=Number(n); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min; }
function prefEsc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function prefCardTemplates() { return (Array.isArray(allCards)?allCards:[]).filter(c=>!c.campaignInstance); }
function prefTemplate(id) { return prefCardTemplates().find(c=>String(c.id)===String(id)) || null; }
function prefCardForInstance(id) { return (Array.isArray(allCards)?allCards:[]).find(c=>String(c.id)===String(id)) || null; }
function prefCardValue(card) { return Math.max(10000, Number(card?.value)|| (card?.cardType==='magic'?1000000:5000000)); }
function prefValueFromInstance(instance) { const c=prefCardForInstance(instance?.id); return prefCardValue(c || prefTemplate(instance?.templateId)); }
function prefFormatMoney(amount) {
  const n=Math.round(Number(amount)||0); const a=Math.abs(n); const sign=n<0?'-':'';
  if(a>=100000000) { const value=a/100000000; const text=value>=10?value.toFixed(value%1===0?0:1):value.toFixed(value%1===0?0:2); return `${sign}${text}億円`; }
  if(a>=10000) return `${sign}${Math.round(a/10000).toLocaleString('ja-JP')}万円`;
  return `${sign}${a.toLocaleString('ja-JP')}円`;
}
function prefFormatWinRate(region) { const s=region?.yearStats||{}; const games=(s.wins||0)+(s.losses||0); return games ? `${((s.wins||0)/games*100).toFixed(1)}%` : '—'; }
function prefAllTimeWinRate(region) { const s=region?.allTimeStats||{}; const games=(s.wins||0)+(s.losses||0); return games ? ((s.wins||0)/games) : 0; }
function prefYearMatchText(region) { const s=region?.yearStats||{}; return `${s.wins||0}勝 ${s.draws||0}分 ${s.losses||0}敗`; }
function prefAbsTurn(state=campaignState) { return Math.max(1, Number(state?.absoluteTurn)||((Number(state?.year||1)-1)*52+Number(state?.week||1))); }
function prefTierForPosition(pos) { if(pos===1)return 'S'; if(pos<=4)return 'A'; if(pos<=9)return 'B'; if(pos<=19)return 'C'; if(pos<=29)return 'D'; return 'E'; }
function prefRankStars(card) { return Math.max(1,Math.min(5,Math.round(Number(card?.rank ?? estimateUnitRank(card?.stats||{}))||1))); }
function prefRegion(regionId) { return campaignState?.regions?.[regionId] || null; }
function prefPlayerRegion() { return prefRegion(PREF_PLAYER_ID); }
function prefInstances(filter=()=>true) { return Object.values(campaignState?.instances||{}).filter(filter); }
function prefOwnedInstances(regionId, kind=null) {
  return prefInstances(x=>x.zone==='owner' && x.ownerId===regionId && (!kind || x.kind===kind));
}
function prefOwnedUnits(regionId) { return prefOwnedInstances(regionId,'unit').sort((a,b)=>(a.acquiredAtAbs||0)-(b.acquiredAtAbs||0)); }
function prefOwnedMagics(regionId) { return prefOwnedInstances(regionId,'magic').sort((a,b)=>(a.acquiredAtAbs||0)-(b.acquiredAtAbs||0)); }
function prefMarketListings(kind=null, ownOnly=false) {
  return prefInstances(x=>x.zone==='market' && (!kind || x.kind===kind) && (!ownOnly || x.sellerRegionId===PREF_PLAYER_ID));
}
function prefGachaUnits() { return prefInstances(x=>x.zone==='gacha' && x.kind==='unit'); }
function prefGachaMagicTemplateIds() { return prefCardTemplates().filter(c=>c.cardType==='magic').map(c=>c.id); }
function prefRegionLabel(regionId) { const r=prefRegion(regionId); return r ? `${r.prefecture}（${r.repName}）` : String(regionId||'不明'); }
function prefTierClass(tier) { return PREF_TIER_COLORS[tier] || PREF_TIER_COLORS.E; }
function prefLog(message, kind='info') {
  if(!campaignState) return;
  campaignState.logs=Array.isArray(campaignState.logs)?campaignState.logs:[];
  campaignState.logs.unshift({year:campaignState.year,week:campaignState.week,abs:prefAbsTurn(),message:String(message),kind,at:Date.now()});
  campaignState.logs=campaignState.logs.slice(0,250);
}
async function prefSave() {
  if(!campaignState) return;
  await saveToStore('settings',{key:PREF_STATE_KEY,value:campaignState});
}
function prefSyncCampaignClones() {
  allCards=(Array.isArray(allCards)?allCards:[]).filter(c=>!c.campaignInstance);
  if(!campaignState?.instances) return;
  const templates=new Map(prefCardTemplates().map(c=>[String(c.id),c]));
  Object.values(campaignState.instances).forEach(inst=>{
    if(inst.zone==='consumed') return;
    const template=templates.get(String(inst.templateId)); if(!template) return;
    allCards.push({...template,id:inst.id,campaignInstance:true,templateId:inst.templateId,copyException:!!inst.copyException});
  });
}
function prefCreateInstance(templateId, zone, ownerId=null, options={}) {
  const template=prefTemplate(templateId); if(!template) return null;
  const id=generateUniqueId('prefcard');
  const abs=prefAbsTurn();
  const inst={id,templateId:template.id,kind:template.cardType==='magic'?'magic':'unit',zone,ownerId:ownerId||null,
    sellerRegionId:options.sellerRegionId||null,listedAtAbs:options.listedAtAbs||null,marketExpiresAbs:options.marketExpiresAbs||null,
    acquiredAtAbs:zone==='owner'?abs:null,expiresAtAbs:zone==='owner'&&template.cardType==='unit'?abs+PREF_CARD_LIFETIME:null,
    copyException:!!options.copyException,initialUnavailable:!!options.initialUnavailable,source:options.source||'campaign'};
  campaignState.instances[id]=inst;
  if(zone!=='consumed') allCards.push({...template,id,campaignInstance:true,templateId:template.id,copyException:inst.copyException});
  return inst;
}
function prefSetInstanceOwner(inst, ownerId, resetLifetime=true) {
  if(!inst) return;
  inst.zone='owner'; inst.ownerId=ownerId; inst.sellerRegionId=null; inst.listedAtAbs=null; inst.marketExpiresAbs=null;
  inst.acquiredAtAbs=prefAbsTurn();
  if(inst.kind==='unit') inst.expiresAtAbs=resetLifetime?prefAbsTurn()+PREF_CARD_LIFETIME:(inst.expiresAtAbs||prefAbsTurn()+PREF_CARD_LIFETIME);
  else inst.expiresAtAbs=null;
}
function prefListInstance(inst, sellerRegionId, source='manual') {
  if(!inst) return;
  inst.zone='market'; inst.ownerId=null; inst.sellerRegionId=sellerRegionId||null;
  inst.listedAtAbs=prefAbsTurn(); inst.marketExpiresAbs=prefAbsTurn()+PREF_MARKET_LIFETIME;
  inst.expiresAtAbs=null; inst.acquiredAtAbs=null; inst.marketSource=source;
}
function prefSendToGacha(inst, reason='return') {
  if(!inst) return;
  inst.zone='gacha'; inst.ownerId=null; inst.sellerRegionId=null; inst.listedAtAbs=null; inst.marketExpiresAbs=null; inst.expiresAtAbs=null; inst.acquiredAtAbs=null; inst.returnReason=reason;
}
function prefCardDisplay(cardId, {small=false, selectable=false, extra='' }={}) {
  const inst=campaignState?.instances?.[cardId]; const card=prefCardForInstance(cardId) || prefTemplate(inst?.templateId); if(!inst||!card)return '';
  const html=getCardHTML({id:cardId,cardType:card.cardType,name:card.name,mainAttr:card.mainAttr,subAttrs:card.subAttrs||[],hp:card.stats?.hp||0,atk:card.stats?.atk||0,prio:card.stats?.priority??999,rank:card.rank,img:getCardImage(card),desc:card.desc||card.description||''});
  return `<div class="pref-compact-card min-w-0" data-pref-action="details" data-id="${prefEsc(cardId)}"><div class="${small?'opacity-95':''}">${html}</div>${extra}</div>`;
}
function prefGradeValue(region) { return PREF_TIER_VALUE[region?.tier||'E']||1; }
function prefCardHasOwnerTemplate(templateId, exceptRegionId=null) {
  return prefOwnedInstancesAny().some(inst=>String(inst.templateId)===String(templateId) && inst.ownerId!==exceptRegionId);
}
function prefOwnedInstancesAny() { return prefInstances(x=>x.zone==='owner' && x.kind==='unit'); }
function prefIsInitialDuplicateTemplate(instanceId) { return !!campaignState?.instances?.[instanceId]?.copyException; }
function prefEligibleGachaUnitInstances() {
  // Startup pools below 240 templates may retain unassigned template records internally so that
  // every authored character remains accounted for; they are deliberately not drawable at start.
  // A character template already represented by an owner or market listing cannot be acquired again.
  const unavailable = new Set(prefInstances(x=>x.kind==='unit' && ['owner','market'].includes(x.zone)).map(x=>String(x.templateId)));
  return prefGachaUnits().filter(inst=>!inst.initialUnavailable && !unavailable.has(String(inst.templateId)));
}
function prefNewStats() { return {assetMetric:0,wins:0,losses:0,draws:0,battles:0,investigations:0,marketIncome:0,marketExpense:0,aidIncome:0}; }
function prefDefaultRegion(prefecture, isPlayer, repName, personality, initialPosition) {
  const tier=prefTierForPosition(initialPosition);
  return {id:prefecture,prefecture,repName,personality:personality.id,personalityLabel:personality.name,personalityFocus:personality.focus,
    aiIntelligence:personality.intelligence||'normal',isPlayer:!!isPlayer,funds:0,initialPosition,rankPosition:initialPosition,rankEndPosition:initialPosition,rankTieCount:1,tier,
    supportTier:tier,unitSlots:PREF_RIVAL_UNIT_LIMIT,lastBattleAbs:0,nonBattleStreak:0,resignations:0,yearStats:prefNewStats(),allTimeStats:{wins:0,losses:0,draws:0,battles:0,assetMetric:0},
    lastCommand:null,lastCommandAbs:0,lastLoadout:{active:[],reserve:[]}};
}
function prefAssignInitialRanks() {
  const others=prefShuffle(PREF_REGIONS.filter(x=>x!==PREF_PLAYER_ID));
  const order=[]; let idx=0;
  for(const group of PREF_RANK_COUNTS){for(let i=0;i<group.count;i++){if(idx<others.length)order.push({prefecture:others[idx++],tier:group.tier});}}
  return order;
}
function prefBuildInitialCardPool(templateCards, state) {
  const units=templateCards.filter(c=>c.cardType==='unit');
  const magic=templateCards.filter(c=>c.cardType==='magic');
  const unitCount=units.length;
  const allowInitialDuplicates=unitCount<240;
  const unused=new Set(units.map(c=>String(c.id)));
  const allTemplates=new Map(units.map(c=>[String(c.id),c]));
  // Allocate each template at most once until the unique templates are all used. Only then are startup copies allowed.
  function takeInitialUnit(desiredRank) {
    const avail=[...unused].map(id=>allTemplates.get(id)).filter(Boolean);
    let chosen=null;
    for(let r=desiredRank;r>=1&&!chosen;r--){const list=avail.filter(c=>prefRankStars(c)===r); if(list.length)chosen=prefRandom(list);}
    if(!chosen && avail.length) chosen=avail.sort((a,b)=>Math.abs(prefRankStars(a)-desiredRank)-Math.abs(prefRankStars(b)-desiredRank) || prefRankStars(a)-prefRankStars(b))[0];
    if(chosen){unused.delete(String(chosen.id)); return prefCreateInstance(chosen.id,'owner',null,{source:'initial',copyException:false});}
    if(allowInitialDuplicates && units.length){
      const candidates=units.filter(c=>prefRankStars(c)<=desiredRank).sort((a,b)=>prefRankStars(b)-prefRankStars(a));
      const fallback=candidates.length?candidates.filter(c=>prefRankStars(c)===prefRankStars(candidates[0])):units;
      const source=prefRandom(fallback);
      return prefCreateInstance(source.id,'owner',null,{source:'initial-duplicate',copyException:true});
    }
    return null;
  }
  function takeInitialUnitFromAny(desiredRank) { return takeInitialUnit(desiredRank); }
  const assigned={};
  // Player starts with 3 three-star characters where possible.
  const playerUnits=[];
  for(let i=0;i<3;i++){const inst=takeInitialUnitFromAny(3);if(inst)playerUnits.push(inst);}
  // The other 46 regions are initially ordered by the defined strength tiers.
  const rankRows=prefAssignInitialRanks();
  for(let pos=1;pos<=rankRows.length;pos++){
    const row=rankRows[pos-1]; row.position=pos;
    if(!assigned[row.prefecture])assigned[row.prefecture]=[];
    const recipes=PREF_RANK_UNIT_RECIPE[row.tier]||PREF_RANK_UNIT_RECIPE.E;
    for(const r of recipes){const inst=takeInitialUnitFromAny(r); if(inst)assigned[row.prefecture].push(inst);}
  }
  // Below the 240-card completeness threshold the starting gacha must have zero drawable characters.
  // If 234–239 templates were authored, there are more templates than starting owner slots but still
  // fewer than the full holder capacity; keep those few records accounted for as locked pool entries.
  [...unused].forEach(id=>prefCreateInstance(id,'gacha',null,{source:'initial-pool',initialUnavailable:allowInitialDuplicates}));
  return { playerUnits, assigned, rankRows, magic };
}
function prefCreateNewCampaign() {
  const templates=prefCardTemplates();
  const units=templates.filter(c=>c.cardType==='unit');
  const magics=templates.filter(c=>c.cardType==='magic');
  if(!units.length) { alert('先にキャラカードを1枚以上作成してください。'); return null; }
  if(!magics.length) { alert('先にマジックカードを1枚以上作成してください。'); return null; }
  // discard the old campaign copies first; never touch the created card library in IndexedDB.
  allCards=allCards.filter(c=>!c.campaignInstance);
  const state={version:1,year:1,week:1,absoluteTurn:1,phase:'ready',gameOver:false,gameOverReason:'',yearReview:null,
    instances:{},regions:{},rankingOrder:[],rankingInitialized:false,logs:[],investigations:[],supportApplied:[],lastLoadout:{active:[],reserve:[]},turnProcessing:null,pendingAcquisition:null,yearHistory:[],templateUnitCount:units.length,initialDuplicatesAllowed:units.length<240};
  campaignState=state;
  const pool=prefBuildInitialCardPool(templates,state);
  // Map allocated card instances into prefecture ownership. Player has 3; rivals have up to 5.
  const player=prefDefaultRegion(PREF_PLAYER_ID,true,(playerName&&playerName!=='あなた')?playerName:'京都府代表',PREF_PERSONALITIES[0],47);
  state.regions[PREF_PLAYER_ID]=player;
  pool.playerUnits.forEach(inst=>{inst.ownerId=PREF_PLAYER_ID; inst.zone='owner'; inst.acquiredAtAbs=1; inst.expiresAtAbs=1+PREF_CARD_LIFETIME;});
  // Rival identities are drawn from custom rivals already saved in the original game where possible.
  const customized=(Array.isArray(allRivals)?allRivals:[]).filter(r=>r && r.name && !/^CPU\s*ライバル$/i.test(r.name) && r.id!=='rival_def_1');
  const usedNames=new Set([player.repName]);
  let fallbackNameIdx=0;
  for(const row of pool.rankRows){
    const existing=customized.shift();
    let repName=existing?.name || PREF_NAMES[fallbackNameIdx++ % PREF_NAMES.length];
    let guard=0; while(usedNames.has(repName)&&guard++<20) repName=PREF_NAMES[fallbackNameIdx++ % PREF_NAMES.length];
    usedNames.add(repName);
    let personality=PREF_PERSONALITIES.find(x=>x.id===existing?.personality) || null;
    if(!personality && existing?.intelligence==='master') personality=PREF_PERSONALITIES[2];
    else if(!personality && existing?.intelligence==='expert') personality=PREF_PERSONALITIES[0];
    if(!personality) personality=prefRandom(PREF_PERSONALITIES);
    // Reuse saved rival guidance as campaign AI configuration, without requiring a predefined deck.
    const region=prefDefaultRegion(row.prefecture,false,repName,personality,row.position);
    region.profileRivalId=existing?.id||null;
    region.cardPreference=existing?.cardPreference||'rank-value';
    region.tier=row.tier; region.supportTier=row.tier; region.aiIntelligence=existing?.intelligence||personality.intelligence||'normal';
    state.regions[row.prefecture]=region;
    (pool.assigned[row.prefecture]||[]).forEach(inst=>{inst.ownerId=row.prefecture;inst.zone='owner';inst.acquiredAtAbs=1;inst.expiresAtAbs=1+PREF_CARD_LIFETIME;});
  }
  // Player starts with all default/created magic card templates; rivals start with a small no-duplicate selection each.
  magics.forEach(c=>{const inst=prefCreateInstance(c.id,'owner',PREF_PLAYER_ID,{source:'initial-magic'}); if(inst)inst.expiresAtAbs=null;});
  Object.values(state.regions).filter(r=>!r.isPlayer).forEach(region=>{
    const pickCount=Math.min(3,magics.length);
    prefShuffle(magics).slice(0,pickCount).forEach(c=>{const inst=prefCreateInstance(c.id,'owner',region.id,{source:'initial-magic'}); if(inst)inst.expiresAtAbs=null;});
  });
  // Initial rank order places Kyoto at 47th. Funds begin at zero; the week-1 aid payment is the opening capital.
  state.rankingOrder=[...pool.rankRows.map(x=>x.prefecture),PREF_PLAYER_ID];
  state.rankingInitialized=true;
  state.rankingOrder.forEach((id,i)=>{const r=state.regions[id];r.rankPosition=i+1;r.rankEndPosition=i+1;r.rankTieCount=1;r.tier=prefTierForPosition(i+1);r.supportTier=r.tier;});
  prefLog('京都府代表として全国47位から参戦。第1週の資金提供が初期資金になります。','success');
  prefLog(`初期配布完了：キャラカード原本${units.length}枚。${units.length<240?'必要枠に満たないため、初期配布に限り複製を許可。初期ガチャのキャラカードは0枚です。':'初期配布後のキャラカードはガチャに残ります。'}`,'info');
  prefOpenWeek();
  prefSave().then(()=>{prefSyncCampaignClones();prefRenderAll();}).catch(console.error);
  return state;
}

async function prefLoadState() {
  const rec=await getFromStore('settings',PREF_STATE_KEY);
  campaignState=rec?.value||null;
  if(campaignState && (!campaignState.regions || !campaignState.instances)) campaignState=null;
  if(campaignState){
    prefSyncCampaignClones();
    // Cards authored after the campaign started are immediately placed in the shared character gacha.
    const known=new Set(Object.values(campaignState.instances).map(i=>String(i.templateId)));
    for(const t of prefCardTemplates().filter(c=>c.cardType==='unit')){
      if(!known.has(String(t.id))){const inst=prefCreateInstance(t.id,'gacha',null,{source:'created-after-start'}); if(inst)prefLog(`新規キャラカード「${t.name}」がガチャに追加されました。`,'success');}
    }
    if(campaignState.turnProcessing && campaignState.turnProcessing.stage==='battles') {
      const tx=campaignState.turnProcessing;
      if(tx.pairIndex==null)tx.pairIndex=0;
      // v1.0.10以前の保存データには player-preview の段階がありません。
      // プレイヤー対戦が未決着なら、AIの処理済み結果を保持したまま編成確認へ戻します。
      prefRecoverPendingBattlePreview(tx, true);
    }
    await prefSave();
  }
}
const prefOriginalLoadAllData = loadAllData;
loadAllData = async function() {
  await prefOriginalLoadAllData();
  await prefLoadState();
};

// After a template is edited or created, reconstruct all game card instances from the refreshed saved templates.
async function prefAfterTemplateSave(beforeIds, kind) {
  allCards=await getAllFromStore('cards');
  if(campaignState){
    const known=new Set(Object.values(campaignState.instances).map(i=>String(i.templateId)));
    if(kind==='unit'){
      for(const t of prefCardTemplates().filter(c=>c.cardType==='unit')){
        if(!beforeIds.has(String(t.id)) && !known.has(String(t.id))){prefCreateInstance(t.id,'gacha',null,{source:'created-after-start'});prefLog(`新規キャラカード「${t.name}」がガチャに追加されました。`,'success');}
      }
    }
    prefSyncCampaignClones();
    await prefSave();
  }
}
const prefOriginalSaveUnit = saveCustomCard;
saveCustomCard = async function() {
  if(campaignState?.turnProcessing){prefShowModal('ターン処理中','ターン処理中はカードライブラリを変更できません。AI対戦が終わってから保存してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
  const before=new Set(prefCardTemplates().map(c=>String(c.id)));
  await prefOriginalSaveUnit();
  await prefAfterTemplateSave(before,'unit');
  if(campaignState) { switchView('deck'); renderPrefDashboard(); }
};
const prefOriginalSaveMagic = saveCustomMagicCard;
saveCustomMagicCard = async function() {
  if(campaignState?.turnProcessing){prefShowModal('ターン処理中','ターン処理中はカードライブラリを変更できません。AI対戦が終わってから保存してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
  const before=new Set(prefCardTemplates().map(c=>String(c.id)));
  await prefOriginalSaveMagic();
  await prefAfterTemplateSave(before,'magic');
  if(campaignState) { switchView('deck'); renderPrefDashboard(); }
};
const prefOriginalRenderDeckList = renderDeckList;
renderDeckList = function() {
  const keep=allCards; allCards=keep.filter(c=>!c.campaignInstance);
  try { prefOriginalRenderDeckList(); } finally { allCards=keep; }
};

function prefAssetToken(value) {
  const v=Number(value)||0; if(v===0)return {sign:0,exp:0,lead:0,key:'z'};
  const sign=v>0?1:-1, a=Math.abs(v), exp=Math.floor(Math.log10(a));
  const scale=Math.pow(10,Math.max(0,exp-1));
  const lead=Math.floor(a/scale + 1e-9);
  return {sign,exp,lead,key:`${sign}:${exp}:${lead}`};
}
function prefCompareAssetGroups(a,b) {
  const x=a.token,y=b.token;
  if(x.sign!==y.sign) return y.sign-x.sign; // positive, zero, negative
  if(x.sign===1) return (y.exp-x.exp)||(y.lead-x.lead);
  if(x.sign===-1) return (x.exp-y.exp)||(x.lead-y.lead); // closer to zero ranks higher
  return 0;
}
function prefCalculateRankings() {
  if(!campaignState)return;
  const regions=Object.values(campaignState.regions||{});
  const groups=new Map();
  regions.forEach(r=>{const token=prefAssetToken(r.yearStats?.assetMetric||0);if(!groups.has(token.key))groups.set(token.key,{token,rows:[]});groups.get(token.key).rows.push(r);});
  const sortedGroups=[...groups.values()].sort(prefCompareAssetGroups);
  const ordered=[];let pos=1;
  for(const group of sortedGroups){
    group.rows.sort((a,b)=>prefAllTimeWinRate(a)-prefAllTimeWinRate(b));
    // The second criterion is current-year win rate; within an identical asset bucket higher win rate leads.
    group.rows.sort((a,b)=>prefYearWinRate(b)-prefYearWinRate(a) || a.prefecture.localeCompare(b.prefecture,'ja'));
    let i=0;
    while(i<group.rows.length){
      const rate=prefYearWinRate(group.rows[i]); let j=i+1;
      while(j<group.rows.length && Math.abs(prefYearWinRate(group.rows[j])-rate)<1e-10)j++;
      const ties=group.rows.slice(i,j); const start=pos; const end=pos+ties.length-1;
      ties.forEach(r=>{r.rankPosition=start;r.rankEndPosition=end;r.rankTieCount=ties.length;r.tier=prefTierForPosition(end);ordered.push(r.id);});
      pos=end+1; i=j;
    }
  }
  campaignState.rankingOrder=ordered;
  campaignState.rankingInitialized=true;
}
function prefYearWinRate(region) { const s=region?.yearStats||{}; const played=(s.wins||0)+(s.losses||0); return played?(s.wins||0)/played:0; }
function prefRankOf(regionId) { const r=prefRegion(regionId); return r?.rankPosition||47; }
function prefTierBadge(tier) { return `<span class="inline-flex items-center justify-center min-w-8 px-2 py-1 rounded-md border font-black ${prefTierClass(tier)}">${prefEsc(tier)}</span>`; }
function prefRankLabel(region) { const pos=region?.rankPosition||47; return `${pos}位${(region?.rankTieCount||1)>1?'タイ':''}`; }
function prefBook(regionId, delta, reason='income', noAllTime=false) {
  const r=prefRegion(regionId); if(!r)return;
  delta=Math.round(Number(delta)||0);
  r.funds=(Number(r.funds)||0)+delta;
  if(!r.yearStats)r.yearStats=prefNewStats();
  if(!r.allTimeStats)r.allTimeStats={wins:0,losses:0,draws:0,battles:0,assetMetric:0};
  r.yearStats.assetMetric=(Number(r.yearStats.assetMetric)||0)+delta;
  if(!noAllTime)r.allTimeStats.assetMetric=(Number(r.allTimeStats.assetMetric)||0)+delta;
  if(reason==='market-sale')r.yearStats.marketIncome=(r.yearStats.marketIncome||0)+Math.max(0,delta);
  if(reason==='market-buy')r.yearStats.marketExpense=(r.yearStats.marketExpense||0)+Math.max(0,-delta);
  if(reason==='aid')r.yearStats.aidIncome=(r.yearStats.aidIncome||0)+Math.max(0,delta);
}
function prefApplyFundingIfNeeded() {
  if(!campaignState)return;
  const key=`${campaignState.year}-${campaignState.week}`;
  if(!PREF_FUNDING_WEEKS.includes(campaignState.week) || campaignState.supportApplied.includes(key))return;
  Object.values(campaignState.regions).forEach(r=>{
    const amount=PREF_FUNDING_BY_TIER[r.supportTier||r.tier||'E']||PREF_FUNDING_BY_TIER.E;
    prefBook(r.id,amount,'aid');
    if(r.id===PREF_PLAYER_ID)prefLog(`第${campaignState.week}週の資金提供：${prefFormatMoney(amount)}（ランク${r.supportTier||r.tier}）を受領。`,'success');
  });
  campaignState.supportApplied.push(key);
}
function prefExpireMarket() {
  if(!campaignState)return;
  const abs=prefAbsTurn();
  prefMarketListings().filter(inst=>inst.marketExpiresAbs!=null && abs>=inst.marketExpiresAbs).forEach(inst=>{
    const card=prefCardForInstance(inst.id); const name=card?.name||'カード';
    if(inst.kind==='unit')prefSendToGacha(inst,'market-expired');
    else {inst.zone='consumed';inst.ownerId=null;inst.sellerRegionId=null;}
    prefLog(`市場の「${name}」は購入期限を過ぎたため市場から消えました。`,'info');
  });
}
function prefExpireOwnedUnits() {
  if(!campaignState)return;
  const abs=prefAbsTurn();
  prefOwnedInstancesAny().filter(inst=>inst.expiresAtAbs!=null && abs>=inst.expiresAtAbs).forEach(inst=>{
    const ownerName=prefRegion(inst.ownerId)?.prefecture||'代表';const card=prefCardForInstance(inst.id); prefSendToGacha(inst,'expired');
    prefLog(`${ownerName}の「${card?.name||'キャラカード'}」が所持期限切れでガチャに戻りました。`,'warning');
  });
}
function prefOpenWeek() {
  if(!campaignState)return;
  prefExpireMarket(); prefExpireOwnedUnits(); prefApplyFundingIfNeeded();
  prefTurnStartAbs=prefAbsTurn();
}

function prefCardScoreForRegion(region, inst) {
  const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(!c)return 0;
  const tier=PREF_TIER_VALUE[region.tier||'E']||1; const rank=prefRankStars(c); const val=Math.log10(Math.max(10000,prefCardValue(c)));
  const personality=region.personality||'careful';
  let score;
  if(personality==='trickster')score=rank*6+val+((c.skills||[]).length)*1.6;
  else if(personality==='collector')score=rank*4+val*2;
  else if(personality==='scout')score=rank*5+((c.skills||[]).filter(s=>s.type==='passive').length)*2+val;
  else if(personality==='aggressive')score=rank*7+Number(c.stats?.atk||0)/1000+val;
  else score=rank*5+val+Number(c.stats?.hp||0)/3000;
  const focus=region.cardPreference||'rank-value';
  if(focus==='highest-rank')score+=rank*3;
  else if(focus==='strongest-stats')score+=(Number(c.stats?.hp||0)/1000)+(Number(c.stats?.atk||0)/500);
  else if(focus==='skill-effects')score+=(c.skills||[]).length*2.5+(c.skills||[]).filter(x=>x.type==='passive').length*2;
  else if(focus==='attribute-diversity'){
    const existing=prefOwnedUnits(region.id).filter(x=>String(x.id)!==String(inst.id)).map(x=>prefCardForInstance(x.id)||prefTemplate(x.templateId)).filter(Boolean);
    const attr=String(c.mainAttr||'');
    score+=attr&&!existing.some(x=>String(x.mainAttr||'')===attr)?4:0;
  }
  return score + tier*0.01;
}

function prefAiReplacementChoice(region, unitInstances, incomingInst) {
  if(!unitInstances.length)return null;
  const personality=region.personality||'careful';
  let scored=unitInstances.map(inst=>({inst,score:prefCardScoreForRegion(region,inst)}));
  if(personality==='aggressive')scored.sort((a,b)=>{const ca=prefCardForInstance(a.inst.id),cb=prefCardForInstance(b.inst.id);return Number(ca?.stats?.atk||0)-Number(cb?.stats?.atk||0)||a.score-b.score;});
  else if(personality==='collector')scored.sort((a,b)=>prefCardValue(prefCardForInstance(a.inst.id))-prefCardValue(prefCardForInstance(b.inst.id))||a.score-b.score);
  else scored.sort((a,b)=>a.score-b.score);
  const weakest=scored[0];
  if(incomingInst && prefCardScoreForRegion(region,incomingInst)<=weakest.score && personality!=='collector')return incomingInst.id;
  if(incomingInst && personality==='collector' && prefValueFromInstance(incomingInst)<=prefCardValue(prefCardForInstance(weakest.inst.id)))return incomingInst.id;
  return weakest.inst.id;
}
function prefAcquireInstance(regionId, instId, options={}) {
  const region=prefRegion(regionId);const inst=campaignState?.instances?.[instId];if(!region||!inst)return false;
  const card=prefCardForInstance(instId)||prefTemplate(inst.templateId); if(!card)return false;
  if(inst.kind==='magic'){
    const already=prefOwnedMagics(regionId).some(x=>String(x.templateId)===String(inst.templateId));
    if(already){prefListInstance(inst,regionId,'duplicate-gacha');prefLog(`${region.prefecture}は重複したマジックカード「${card.name}」を市場へ出品しました。`,'info');return true;}
    prefSetInstanceOwner(inst,regionId,false);inst.expiresAtAbs=null;
    return true;
  }
  const units=prefOwnedUnits(regionId);
  if(units.length>= (region.isPlayer?PREF_UNIT_LIMIT:PREF_RIVAL_UNIT_LIMIT)){
    if(region.isPlayer){
      inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.expiresAtAbs=null;
      campaignState.pendingAcquisition={instanceId:instId,regionId,reason:options.reason||'acquire'};
      prefShowReplaceModal(); return 'pending';
    }
    const chosen=prefAiReplacementChoice(region,units,inst);
    if(chosen===instId){prefListInstance(inst,regionId,'ai-rejected-card');return true;}
    const old=campaignState.instances[chosen];if(old)prefListInstance(old,regionId,'ai-replacement');
  }
  prefSetInstanceOwner(inst,regionId,true);
  return true;
}
function prefShowReplaceModal() {
  const pending=campaignState?.pendingAcquisition;if(!pending)return;
  const inst=campaignState.instances[pending.instanceId],card=prefCardForInstance(pending.instanceId)||prefTemplate(inst?.templateId);const owned=prefOwnedUnits(PREF_PLAYER_ID);
  if(!inst||!card){campaignState.pendingAcquisition=null;return;}
  const entries=[...owned.map(x=>({id:x.id,card:prefCardForInstance(x.id)||prefTemplate(x.templateId),incoming:false})),{id:inst.id,card,incoming:true}];
  prefShowModal('カードホルダーがいっぱいです',`<p class="text-sm text-slate-300 mb-3">新しいキャラカード「<b class="text-amber-200">${prefEsc(card.name||'新カード')}</b>」を獲得しました。市場へ出すカードを選んでください。新しいカードを選ぶと、今回は受け取らずに市場へ出品します。</p><div class="max-h-[58vh] overflow-y-auto pr-1"><div class="grid grid-cols-3 sm:grid-cols-5 gap-2">${entries.map(x=>`<button data-pref-action="replace-held" data-id="${prefEsc(x.id)}" class="min-w-0 rounded-lg border ${x.incoming?'border-amber-500 bg-amber-950/30':'border-slate-700 bg-slate-900'} p-1 hover:border-amber-400"><div class="pointer-events-none">${prefCardDisplay(x.id,{small:true})}</div><div class="text-[10px] ${x.incoming?'text-amber-200':'text-rose-300'} font-black mt-1">${x.incoming?'新カードを市場へ':'これを市場へ'}</div></button>`).join('')}</div></div>`,[]);
  document.getElementById('pref-modal-close-btn')?.classList.add('hidden');
}
function prefCommitReplace(oldId) {
  const pending=campaignState?.pendingAcquisition;if(!pending)return;
  const old=campaignState.instances[oldId],newInst=campaignState.instances[pending.instanceId];
  if(!newInst)return;
  if(String(oldId)===String(newInst.id)) {
    const card=prefCardForInstance(newInst.id)||prefTemplate(newInst.templateId);
    prefListInstance(newInst,PREF_PLAYER_ID,'capacity-rejected');
    campaignState.pendingAcquisition=null;
    prefLog(`カードホルダーの上限により、新しい「${card?.name||'キャラカード'}」は市場へ出品されました。`,'info');
    prefSave().then(()=>{prefSyncCampaignClones();prefRenderAll();prefCloseModal();}).catch(console.error);
    return;
  }
  if(!old||old.zone!=='owner'||old.ownerId!==PREF_PLAYER_ID)return;
  const oldCard=prefCardForInstance(oldId)||prefTemplate(old.templateId);
  prefListInstance(old,PREF_PLAYER_ID,'capacity-replacement');
  prefSetInstanceOwner(newInst,PREF_PLAYER_ID,true);
  campaignState.pendingAcquisition=null;
  prefLog(`「${oldCard?.name||'キャラカード'}」を市場へ出品し、新しいキャラカードをホルダーに加えました。`,'success');
  prefSave().then(()=>{prefSyncCampaignClones();prefRenderAll();prefCloseModal();}).catch(console.error);
}

function prefRehydrateInitialRankingIfNeeded() {
  if(!campaignState||campaignState.rankingInitialized)return;
  const arr=Object.values(campaignState.regions).sort((a,b)=>(a.initialPosition||47)-(b.initialPosition||47));
  campaignState.rankingOrder=arr.map(r=>r.id);campaignState.rankingInitialized=true;
}
function prefCurrentRegionRankList() {
  if(!campaignState)return [];
  const map=campaignState.regions;
  const order=campaignState.rankingOrder?.length?campaignState.rankingOrder:Object.keys(map);
  const seen=new Set(); const rows=[];
  for(const id of order){if(map[id]&&!seen.has(id)){seen.add(id);rows.push(map[id]);}}
  Object.values(map).forEach(r=>{if(!seen.has(r.id)){seen.add(r.id);rows.push(r);}});
  return rows;
}
function prefDashboardCardStat(label,value,small='') { return `<div class="pref-stat-card"><div class="pref-stat-label">${prefEsc(label)}</div><div class="pref-stat-value">${prefEsc(value)}</div>${small?`<div class="text-[10px] text-slate-500 mt-1">${prefEsc(small)}</div>`:''}</div>`; }
function prefRenderDashboard() {
  const week=document.getElementById('pref-top-week');if(!week)return;
  const has=!!campaignState&&!campaignState.gameOver;
  document.getElementById('pref-game-start')?.classList.toggle('hidden',has);
  document.getElementById('pref-dashboard')?.classList.toggle('hidden',!has);
  if(!has){
    const unitCount=prefCardTemplates().filter(c=>c.cardType==='unit').length;
    const magicCount=prefCardTemplates().filter(c=>c.cardType==='magic').length;
    const txt=document.getElementById('pref-start-description');if(txt)txt.textContent=`作成済みキャラカード ${unitCount}枚・マジックカード ${magicCount}枚。初期配布に足りない場合だけ、ゲーム開始時のキャラカード複製を許可します。カード作成データはゲームオーバー後も残ります。`;
    week.innerHTML='<div class="text-[10px] text-amber-200 font-bold">ゲーム未開始</div><div class="text-xl font-black text-white">第1年度</div>';return;
  }
  const p=prefPlayerRegion();if(!p)return;
  week.innerHTML=`<div class="text-[10px] text-amber-200 font-bold">${campaignState.year}年度</div><div class="text-2xl font-black text-white">第${campaignState.week}週</div><div class="text-[10px] text-slate-400 mt-1">全52週</div>`;
  const units=prefOwnedUnits(PREF_PLAYER_ID),magics=prefOwnedMagics(PREF_PLAYER_ID);
  const currentMetric=p.yearStats?.assetMetric||0;const supports=PREF_FUNDING_BY_TIER[p.supportTier||p.tier||'E'];
  document.getElementById('pref-stats').innerHTML=[
    prefDashboardCardStat('現在の所持資金',prefFormatMoney(p.funds),'ガチャ費用はランキング指標に含めない'),
    prefDashboardCardStat('全国ランキング',prefRankLabel(p),`ランク ${p.tier||'E'}`),
    prefDashboardCardStat('年間獲得資産額',prefFormatMoney(currentMetric),`今年度 ${prefYearMatchText(p)}`),
    prefDashboardCardStat('勝率',prefFormatWinRate(p),`次回資金提供 ${prefFormatMoney(supports)}`)
  ].join('');
  const battleBtn=document.querySelector('[data-pref-action="choose-battle"]');const investBtn=document.querySelector('[data-pref-action="choose-investigation"]');
  const lastBattle=p.lastBattleAbs>0 && p.lastBattleAbs===prefAbsTurn()-1;const mustBattle=(p.nonBattleStreak||0)>=3;
  if(battleBtn){battleBtn.disabled=lastBattle;battleBtn.classList.toggle('opacity-40',battleBtn.disabled);battleBtn.classList.toggle('cursor-not-allowed',battleBtn.disabled);battleBtn.innerHTML=`<div class="text-2xl">⚔️</div><div class="font-black text-rose-200 mt-2">対戦コマンド</div><div class="text-xs text-slate-400 mt-1">先に対戦相手を決め、その後で編成を確定</div><div class="text-[10px] text-rose-300 mt-3">${lastBattle?'連戦禁止：今週は対戦できません':prefOwnedUnits(PREF_PLAYER_ID).length<3?'キャラカード3枚未満：補充せず対戦を選ぶとゲームオーバー':'4ターンに1回以上の対戦が必要'}</div>`;}
  if(investBtn){investBtn.disabled=mustBattle;investBtn.classList.toggle('opacity-40',mustBattle);investBtn.classList.toggle('cursor-not-allowed',mustBattle);investBtn.innerHTML=`<div class="text-2xl">🔎</div><div class="font-black text-cyan-200 mt-2">調査コマンド</div><div class="text-xs text-slate-400 mt-1">他の代表のカードや行動傾向を調査</div><div class="text-[10px] text-cyan-300 mt-3">${mustBattle?'3ターン連続未対戦：今週は対戦必須':'成功率は相手とのランク差で変動'}</div>`;}
  const summary=document.getElementById('pref-week-summary');
  if(summary){summary.innerHTML=`<div class="flex justify-between gap-2"><span class="text-slate-400">代表</span><b class="text-white">${prefEsc(p.repName)}</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">所持キャラ</span><b class="text-amber-200">${units.length} / 10枚</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">マジック</span><b class="text-violet-200">${magics.length}枚</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">連続未対戦</span><b class="${mustBattle?'text-rose-300':'text-white'}">${p.nonBattleStreak||0} / 3ターン</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">通算成績</span><b class="text-white">${p.allTimeStats.wins||0}勝 ${p.allTimeStats.draws||0}分 ${p.allTimeStats.losses||0}敗</b></div><p class="text-[10px] leading-relaxed text-slate-500 border-t border-slate-800 pt-2 mt-2">次年度の資金提供額は、今年度最終ランキングのランクにより決定します。</p>`;}
  const ownedSummary=document.getElementById('pref-owned-summary');if(ownedSummary){ownedSummary.innerHTML=units.slice(0,5).map(i=>`<div>${prefCardDisplay(i.id,{small:true})}</div>`).join('')||'<p class="col-span-5 text-xs text-slate-500">キャラカードを所持していません。</p>';ownedSummary.querySelectorAll('[data-pref-action="details"]').forEach(el=>el.addEventListener('click',ev=>{ev.stopPropagation();prefOpenCardDetail(el.dataset.id);}));}
  const logs=document.getElementById('pref-recent-log');if(logs){logs.innerHTML=(campaignState.logs||[]).slice(0,8).map(l=>`<div class="flex gap-2 border-b border-slate-800/70 pb-2"><span class="shrink-0 text-amber-300 font-black">${l.year||campaignState.year}/${l.week||campaignState.week}</span><span class="text-slate-300 leading-relaxed">${prefEsc(l.message)}</span></div>`).join('')||'<p class="text-slate-500">まだ出来事はありません。</p>';}
  const status=document.getElementById('pref-command-status');if(status)status.textContent=campaignState.turnProcessing?.stage==='player-preview'?'対戦相手決定・編成確定待ち':campaignState.turnProcessing?'ターン処理中':p.lastCommandAbs===prefAbsTurn()?(p.lastCommand==='battle'?'対戦コマンドを選択済み':'調査コマンドを選択済み'):'コマンド未選択';
  document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');
  const processing=!!campaignState.turnProcessing;
  const waitingForLoadout=campaignState.turnProcessing?.stage==='player-preview';
  document.getElementById('pref-turn-progress')?.classList.toggle('hidden',!processing||waitingForLoadout);
  if(processing){document.getElementById('pref-command-panel')?.classList.add('hidden');} else {document.getElementById('pref-command-panel')?.classList.remove('hidden');}
}

function prefRenderHolder() {
  if(!campaignState){prefShowNoGame('pref-holder-list');return;}
  const units=prefOwnedUnits(PREF_PLAYER_ID),magics=prefOwnedMagics(PREF_PLAYER_ID);
  const uc=document.getElementById('pref-holder-unit-count'),mc=document.getElementById('pref-holder-magic-count');if(uc)uc.textContent=`${units.length}/10`;if(mc)mc.textContent=`${magics.length}`;
  const list=document.getElementById('pref-holder-list');if(!list)return;
  if(prefCurrentHolderTab==='autobuy'){
    const player=prefPlayerRegion();player.autoBuyMagicTemplateIds=Array.isArray(player.autoBuyMagicTemplateIds)?player.autoBuyMagicTemplateIds:[];
    const templates=prefCardTemplates().filter(c=>c.cardType==='magic').filter(c=>normalizeCardSearchText(c.name||'').includes(normalizeCardSearchText(prefHolderSearch)));
    list.innerHTML=templates.map(c=>{const enabled=player.autoBuyMagicTemplateIds.includes(String(c.id));const owned=magics.some(i=>String(i.templateId)===String(c.id));const market=prefMarketListings('magic').some(i=>String(i.templateId)===String(c.id)&&i.sellerRegionId!==PREF_PLAYER_ID);return `<div class=\"rounded-xl border border-slate-800 bg-slate-900 p-2 ${owned?'':'opacity-50'}\"><div class=\"pointer-events-none\">${prefCardDisplay(c.id,{small:true})}</div><div class=\"text-xs font-black mt-2\">${prefEsc(c.name)}</div><div class=\"text-[10px] text-slate-400\">${owned?'所持中':market?'未所持・市場に出品中':'未所持'}</div><label class=\"flex items-center gap-2 mt-2 text-xs\"><input type=\"checkbox\" data-pref-action=\"toggle-autobuy\" data-id=\"${prefEsc(c.id)}\" ${enabled?'checked':''}>自動購入を許可</label></div>`}).join('')||'<div class=\"col-span-full text-slate-500\">マジックカードが登録されていません。</div>';
    const actions=document.getElementById('pref-holder-actions');if(actions)actions.innerHTML=`<input id=\"pref-holder-search\" type=\"search\" value=\"${prefEsc(prefHolderSearch)}\" oninput=\"setPrefHolderSearch(this.value)\" placeholder=\"カード名で検索\" class=\"w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs\"><p class=\"text-xs text-slate-400\">許可したマジックが未所持で市場に出品され、購入しても資金がマイナスにならない場合、ターン処理中に自動購入します。</p>`;
    return;
  }
  const shown=(prefCurrentHolderTab==='unit'?units:magics).filter(inst=>{const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);return normalizeCardSearchText(c?.name||'').includes(normalizeCardSearchText(prefHolderSearch));});
  list.innerHTML=shown.map(inst=>{
    const card=prefCardForInstance(inst.id);const extra=prefCurrentHolderTab==='unit'?`<div class="mt-1 text-[10px] font-bold text-emerald-300">価値 ${prefFormatMoney(prefCardValue(card))}</div><div class="text-[9px] text-slate-500">残り${Math.max(0,(inst.expiresAtAbs||prefAbsTurn()+PREF_CARD_LIFETIME)-prefAbsTurn())}ターン</div>`:`<div class="mt-1 text-[10px] font-bold text-emerald-300">価値 ${prefFormatMoney(prefCardValue(card))}</div>`;
    return `<div class="rounded-xl border border-slate-800 bg-slate-900 p-1 sm:p-2">${prefCardDisplay(inst.id,{small:true,extra})}<div class="pref-card-actions"><button data-pref-action="details" data-id="${prefEsc(inst.id)}" class="bg-slate-800 hover:bg-slate-700 text-slate-200">詳細</button><button data-pref-action="list-card" data-id="${prefEsc(inst.id)}" class="bg-emerald-800/90 hover:bg-emerald-700 text-emerald-100">市場へ出品</button></div></div>`;
  }).join('') || `<div class="col-span-full rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">${prefCurrentHolderTab==='unit'?'キャラカードを所持していません。市場やガチャで補充してください。':'マジックカードを所持していません。'}</div>`;
  const actions=document.getElementById('pref-holder-actions');if(actions){actions.innerHTML=`<div class="flex flex-wrap items-center gap-2 w-full"><input id="pref-holder-search" type="search" value="${prefEsc(prefHolderSearch)}" oninput="setPrefHolderSearch(this.value)" placeholder="カード名で検索（部分一致）" class="min-w-[180px] flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs"><span class="text-xs text-slate-400">${prefCurrentHolderTab==='unit'?'最大10枚。売り出すと期限の進行が停止します。':'同じマジックカードは重複所持できません。'}</span></div>`;}
}
function prefShowNoGame(id) { const el=document.getElementById(id);if(el)el.innerHTML=`<div class="col-span-full rounded-xl border border-slate-800 bg-slate-900 p-8 text-center"><p class="text-slate-300 text-sm">ゲームデータがありません。</p><button data-pref-action="new-game" class="mt-3 px-5 py-3 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black">新しいゲームを開始</button></div>`; }
function prefRenderMarket() {
  if(!campaignState){prefShowNoGame('pref-market-list');return;}
  const list=document.getElementById('pref-market-list');if(!list)return;
  const input=document.getElementById('pref-market-search');
  const search=normalizeCardSearchText(String(input?.value??prefMarketSearch).trim());
  prefMarketSearch=search;
  const base=prefMarketListings(prefMarketOwnOnly?null:(prefCurrentMarketTab==='unit'?'unit':'magic'),prefMarketOwnOnly)
    .filter(inst=>prefMarketOwnOnly ? inst.sellerRegionId===PREF_PLAYER_ID : inst.sellerRegionId!==PREF_PLAYER_ID)
    .filter(inst=>{
      const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
      return !!card&&(!search||normalizeCardSearchText(card.name||'').includes(search));
    });
  const sortedInstancesForKind=kind=>{
    const prepared=base.filter(inst=>inst.kind===kind).map(inst=>{
      const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
      if(!card)return null;
      return {...card,id:inst.id,__marketValue:prefCardValue(card),__marketExpiresAbs:Number(inst.marketExpiresAbs)||0};
    }).filter(Boolean);
    const sorted=typeof filterAndSortCardBrowserItems==='function'
      ?filterAndSortCardBrowserItems(prepared,`market-${kind}`)
      :prepared;
    return sorted.map(card=>campaignState.instances?.[card.id]).filter(Boolean);
  };
  let listings=prefMarketOwnOnly
    ?[...sortedInstancesForKind('unit'),...sortedInstancesForKind('magic')]
    :sortedInstancesForKind(prefCurrentMarketTab==='unit'?'unit':'magic');
  list.innerHTML=listings.map(inst=>{
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(!card)return '';
    const remaining=Math.max(0,(inst.marketExpiresAbs||prefAbsTurn())-prefAbsTurn());
    const seller=inst.sellerRegionId===PREF_PLAYER_ID?'あなたの出品':'出品者非公開';
    const own=inst.sellerRegionId===PREF_PLAYER_ID;
    return `<div class="rounded-xl border ${own?'border-emerald-500/40':'border-slate-800'} bg-slate-900 p-2 sm:p-3">${prefCardDisplay(inst.id,{small:true})}<div class="mt-2"><div class="font-black text-emerald-200">市場価値 ${prefFormatMoney(prefCardValue(card))}</div><div class="text-[10px] text-slate-500 mt-1">${prefEsc(seller)}</div><div class="text-[10px] ${remaining<=1?'text-rose-300':'text-slate-400'} mt-1">${inst.kind==='unit'?`購入期限まであと${remaining}ターン`:`市場から消えるまであと${remaining}ターン`}</div></div><div class="pref-card-actions"><button data-pref-action="details" data-id="${prefEsc(inst.id)}" class="bg-slate-800 hover:bg-slate-700 text-slate-200">詳細</button>${own?`<button data-pref-action="withdraw-listing" data-id="${prefEsc(inst.id)}" class="bg-amber-800 hover:bg-amber-700 text-amber-100">出品取消</button>`:`<button data-pref-action="buy-card" data-id="${prefEsc(inst.id)}" class="bg-emerald-600 hover:bg-emerald-500 text-slate-950">購入</button>`}</div></div>`;
  }).join('')||`<div class="col-span-full rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">${prefMarketOwnOnly?'あなたが出品しているカードはありません。':'現在、この条件に合う市場カードはありません。'}</div>`;
  const tabStyles={active:'px-4 py-2 rounded-lg bg-amber-600 text-xs font-black',inactive:'px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-black'};
  const unitButton=document.querySelector('[data-pref-action="market-tab-unit"]');if(unitButton)unitButton.className=!prefMarketOwnOnly&&prefCurrentMarketTab==='unit'?tabStyles.active:tabStyles.inactive;
  const magicButton=document.querySelector('[data-pref-action="market-tab-magic"]');if(magicButton)magicButton.className=!prefMarketOwnOnly&&prefCurrentMarketTab==='magic'?'px-4 py-2 rounded-lg bg-purple-700 text-xs font-black':tabStyles.inactive;
  const ownButton=document.querySelector('[data-pref-action="market-tab-own"]');if(ownButton)ownButton.className=prefMarketOwnOnly?'px-4 py-2 rounded-lg bg-emerald-600 text-xs font-black':tabStyles.inactive;
}
function openPrefMarketBrowserSettings(anchor){
  if(typeof openCardBrowserSettings==='function')openCardBrowserSettings(`market-${prefCurrentMarketTab}`,anchor);
}
function setPrefMarketSearch(value){prefMarketSearch=String(value||'').slice(0,100);renderPrefMarket();}
function setPrefHolderSearch(value){const input=document.getElementById('pref-holder-search');const pos=input?.selectionStart??String(value||'').length;prefHolderSearch=String(value||'').slice(0,100);prefRenderHolder();const next=document.getElementById('pref-holder-search');if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch{}}}

function prefRenderGacha() {
  if(!campaignState){prefShowNoGame('pref-gacha-cards');return;}
  const p=prefPlayerRegion();const list=document.getElementById('pref-gacha-cards');if(!list)return;
  const eligible=prefEligibleGachaUnitInstances();const counts=[1,2,3,4,5].map(rank=>eligible.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===rank).length);
  document.getElementById('pref-gacha-pool-counts').innerHTML=counts.map((n,i)=>`<div class="rounded-xl border border-amber-500/20 bg-slate-900 p-2 text-center"><div class="text-[9px] text-slate-400">★${i+1}</div><div class="text-amber-200 font-black text-lg">${n}</div><div class="text-[9px] text-slate-500">残存</div></div>`).join('');
  const allowed=[];const tier=p.tier||'E';if(['S','A','B'].includes(tier))allowed.push('A');if(['S','A','B','C','D'].includes(tier))allowed.push('B');allowed.push('C','magic');
  list.innerHTML=allowed.map(key=>{const g=PREF_GACHA[key];const unlocked=(key==='A'?['S','A','B'].includes(tier):key==='B'?['S','A','B','C','D'].includes(tier):true);const probs=g.odds.map(o=>`${o.kind==='magic'?'マジックカード':`★${o.rank}`} ${o.weight}%`).join(' / ');
    return `<div class="relative overflow-hidden rounded-2xl border ${key==='A'?'border-amber-400/50':key==='B'?'border-cyan-400/40':key==='C'?'border-violet-400/40':'border-purple-500/40'} bg-gradient-to-br from-slate-900 to-slate-950 p-4"><div class="absolute -right-4 -top-4 text-7xl opacity-10">${key==='magic'?'📜':'✨'}</div><div class="relative"><div class="text-[10px] text-slate-400 font-bold">${key==='magic'?'MAGIC ONLY':`CLASS ${key}`}</div><h3 class="text-lg font-black ${key==='A'?'text-amber-200':key==='B'?'text-cyan-200':key==='C'?'text-violet-200':'text-purple-200'} mt-1">${prefEsc(g.label)}</h3><div class="text-2xl font-black text-white mt-2">${prefFormatMoney(g.price)}</div><div class="text-[10px] text-slate-400 mt-2 leading-relaxed">排出率：${prefEsc(probs)}</div><button data-pref-action="pull-gacha" data-id="${prefEsc(key)}" class="mt-4 w-full py-3 rounded-xl font-black text-sm ${unlocked?'bg-violet-600 hover:bg-violet-500 text-white':'bg-slate-800 text-slate-500 cursor-not-allowed'}" ${unlocked?'':'disabled'}>1回引く</button></div></div>`;
  }).join('');
  document.getElementById('pref-gacha-note').textContent=`現在の京都府ランク：${tier}。AランクガチャはBランク以上、BランクガチャはDランク以上で解放されます。キャラカードの排出候補が無いときは、設定確率にかかわらずマジックカードが排出されます。重複マジックは自動で市場に出品されます。`;
}
function prefRenderRanking() {
  if(!campaignState){const b=document.getElementById('pref-ranking-body');if(b)b.innerHTML='<tr><td colspan="6" class="p-8 text-center text-slate-500">ゲームを開始してください。</td></tr>';return;}
  const rows=prefCurrentRegionRankList();const p=prefPlayerRegion();
  document.getElementById('pref-ranking-header').innerHTML=`<div class="flex flex-wrap justify-between gap-2"><span>第${campaignState.year}年度・第${campaignState.week}週</span><span>京都府：<b class="text-amber-200">${prefRankLabel(p)} / ランク${p.tier}</b></span><span>年間資産額は資金提供を含む収支指標</span></div>`;
  document.getElementById('pref-ranking-body').innerHTML=rows.map((r,i)=>`<tr class="${r.id===PREF_PLAYER_ID?'bg-amber-950/25':''}"><td class="p-3 font-black text-amber-200 whitespace-nowrap">${prefEsc(prefRankLabel(r))}</td><td class="p-3 font-bold whitespace-nowrap">${prefEsc(r.prefecture)} ${r.id===PREF_PLAYER_ID?'<span class="text-[9px] text-amber-300">PLAYER</span>':''}</td><td class="p-3 text-slate-300 whitespace-nowrap">${prefEsc(r.repName)}</td><td class="p-3 text-right tabular-nums ${Number(r.yearStats?.assetMetric||0)<0?'text-rose-300':'text-white'}">${prefFormatMoney(r.yearStats?.assetMetric||0)}</td><td class="p-3 text-right text-cyan-200 tabular-nums">${prefEsc(prefFormatWinRate(r))}</td><td class="p-3 text-center">${prefTierBadge(r.tier)}</td></tr>`).join('');
}
function prefRenderInvestigations() {
  const wrap=document.getElementById('pref-investigation-list');if(!wrap)return;
  if(!campaignState){wrap.innerHTML='<p class="text-sm text-slate-500">ゲームを開始してください。</p>';return;}
  const list=[...(campaignState.investigations||[])].reverse();
  wrap.innerHTML=list.map(item=>`<article class="rounded-xl border border-slate-800 bg-slate-900 p-4"><div class="flex flex-wrap justify-between gap-2"><h3 class="font-black text-cyan-200">${prefEsc(item.targetPrefecture)}・${prefEsc(item.targetRepName)}</h3><span class="text-[10px] text-slate-500">${item.year}年度 第${item.week}週の調査</span></div><div class="text-xs text-slate-400 mt-1">調査成功率 ${Math.round(item.chance*100)}% · ${item.success?'成功':'失敗'}</div>${item.success?`<div class="mt-3 text-sm text-slate-200">${prefEsc(item.summary||'情報が得られました。')}</div>${item.cards?.length?`<div class="mt-3"><div class="text-[10px] font-black text-amber-200 mb-2">調査時点で判明したキャラカード</div><div class="grid grid-cols-3 sm:grid-cols-5 gap-2">${item.cards.map(c=>`<div class="rounded-lg bg-slate-950 border border-slate-800 p-2"><div class="text-[10px] font-black text-white">${prefEsc(c.name)}</div><div class="text-amber-300 text-[10px]">${'★'.repeat(c.rank)}${'☆'.repeat(5-c.rank)}</div><div class="text-[9px] text-slate-500">${prefEsc(c.mainAttr||'')}</div></div>`).join('')}</div></div>`:''}`:`<div class="mt-3 text-sm text-rose-300">調査に失敗しました。情報は得られませんでした。</div>`}</article>`).join('') || '<div class="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">調査結果はまだありません。</div>';
}

// Inline handlers in the retained editor/market markup use these legacy-friendly names.
function renderPrefDashboard(){prefRenderDashboard();}
function renderPrefMarket(){prefRenderMarket();}

function prefRecoverPendingBattlePreview(tx=campaignState?.turnProcessing, silent=false) {
  if(!campaignState||!tx||tx.stage==='player-preview')return tx?.stage==='player-preview';
  const playerAction=tx.actions?.[PREF_PLAYER_ID];
  if(playerAction?.type!=='battle'||!Array.isArray(tx.pairs))return false;
  const pair=tx.pairs.find(item=>(item.a===PREF_PLAYER_ID||item.b===PREF_PLAYER_ID)&&item.status!=='done');
  if(!pair)return false;
  const pairIndex=tx.pairs.indexOf(pair);
  const savedCursor=Number.isInteger(tx.pairIndex)?Math.max(0,tx.pairIndex):0;
  // Battle outcomes are committed atomically before a pair becomes "done". A pending or
  // player-running pair therefore has no saved result and can safely return to preview.
  pair.status='pending';
  tx.stage='player-preview';
  // Keep any earlier unfinished AI matches queued; resume from the saved cursor, but never beyond this player pair.
  tx.pairIndex=Math.min(savedCursor,pairIndex);
  tx.currentPairId=null;
  const units=prefOwnedUnits(PREF_PLAYER_ID);
  const candidate=campaignState.draftLoadout||playerAction.loadout||prefDefaultLoadout(PREF_PLAYER_ID);
  let active=(candidate.active||[]).filter(id=>units.some(unit=>String(unit.id)===String(id))).slice(0,3);
  let reserve=(candidate.reserve||[]).filter(id=>units.some(unit=>String(unit.id)===String(id))&&!active.some(x=>String(x)===String(id))).slice(0,2);
  // Preserve as much of the previously selected lineup as possible; fill missing slots only if needed.
  for(const unit of units){
    if(active.length>=3)break;
    if(!active.some(x=>String(x)===String(unit.id))&&!reserve.some(x=>String(x)===String(unit.id)))active.push(unit.id);
  }
  for(const unit of units){
    if(reserve.length>=2)break;
    if(!active.some(x=>String(x)===String(unit.id))&&!reserve.some(x=>String(x)===String(unit.id)))reserve.push(unit.id);
  }
  campaignState.draftLoadout={active,reserve};
  if(!silent)prefLog('保存データの復旧：未決着の対戦を、対戦相手決定後の編成確認に戻しました。','warning');
  return true;
}
function prefEnsurePreviewResumeButton() {
  const button=document.getElementById('campaign-preview-resume');if(!button)return;
  // Keep the rescue control outside all switchable views so it cannot disappear when navigating.
  if(button.parentElement!==document.body)document.body.appendChild(button);
  const tx=campaignState?.turnProcessing;
  const waiting=tx?.stage==='player-preview';
  const recoverable=!!tx && tx.stage!=='player-preview' && tx.stage==='battles' && tx.actions?.[PREF_PLAYER_ID]?.type==='battle' && (tx.pairs||[]).some(pair=>(pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID)&&pair.status!=='done') && !campaignBattlePending;
  const processing=!!tx && !waiting && !recoverable && !campaignBattlePending;
  button.classList.toggle('hidden',!(waiting||recoverable||processing));
  button.dataset.prefAction=waiting?'battle-preview-continue':recoverable?'recover-pending-battle':'resume-turn-processing';
  button.textContent=waiting?'⚔️ 編成を確定して対戦開始':recoverable?'🛠️ 対戦準備を復旧する':'🔄 ターン処理を再開する';
  button.title=waiting?'対戦相手決定後の編成確認へ進みます':recoverable?'保存済みの未決着対戦を編成確認へ戻します':'保存済みのターン処理を再開します';
}
function prefRenderAll() {
  prefSyncCampaignClones();
  prefRenderDashboard();prefRenderHolder();prefRenderMarket();prefRenderGacha();prefRenderRanking();prefRenderInvestigations();prefEnsurePreviewResumeButton();
}
const prefOriginalSwitchView = switchView;
switchView = function(viewId) {
  prefOriginalSwitchView(viewId);
  if(viewId==='prefecture')prefRenderDashboard();
  if(viewId==='pref-holder')prefRenderHolder();
  if(viewId==='pref-market')prefRenderMarket();
  if(viewId==='pref-gacha')prefRenderGacha();
  if(viewId==='pref-ranking')prefRenderRanking();
  if(viewId==='pref-investigations')prefRenderInvestigations();
};

function prefShowModal(title, body, buttons=[]) {
  const modal=document.getElementById('pref-modal');if(!modal)return;
  const closeButton=document.getElementById('pref-modal-close-btn');if(closeButton)closeButton.classList.remove('hidden');
  document.getElementById('pref-modal-title').textContent=title;
  document.getElementById('pref-modal-body').innerHTML=body;
  document.getElementById('pref-modal-footer').innerHTML=buttons.map(b=>`<button data-pref-action="${prefEsc(b.action)}" ${b.id?`data-id="${prefEsc(b.id)}"`:''} class="px-4 py-2.5 rounded-lg text-xs font-black ${b.style==='primary'?'bg-amber-500 hover:bg-amber-400 text-slate-950':b.style==='danger'?'bg-rose-700 hover:bg-rose-600 text-white':b.style==='green'?'bg-emerald-500 hover:bg-emerald-400 text-slate-950':'bg-slate-800 hover:bg-slate-700 text-slate-100'}">${prefEsc(b.label)}</button>`).join('');
  modal.classList.remove('hidden');modal.classList.add('flex');
}
function prefCloseModal() { const modal=document.getElementById('pref-modal');if(modal){modal.classList.add('hidden');modal.classList.remove('flex');} }
function prefOpenCardDetail(id) {
  const inst=campaignState?.instances?.[id];const card=prefCardForInstance(id)||prefTemplate(inst?.templateId);if(!card)return;
  openCardDetail(id,{readOnly:true});
  const body=document.getElementById('detail-card-body');if(body){
    const expires=inst?.kind==='unit'&&inst.zone==='owner'&&inst.expiresAtAbs!=null?`<div><b>残り期限：</b>${Math.max(0,inst.expiresAtAbs-prefAbsTurn())}ターン（52ターン経過でガチャへ戻ります）</div>`:'';
    const value=`<div><b>市場価値：</b>${prefFormatMoney(prefCardValue(card))}</div>`;
    let autoBuy='';if(card.cardType==='magic'&&campaignState?.regions?.[PREF_PLAYER_ID]){const player=prefPlayerRegion();player.autoBuyMagicTemplateIds=Array.isArray(player.autoBuyMagicTemplateIds)?player.autoBuyMagicTemplateIds:[];const templateId=String(inst?.templateId||card.id);const checked=player.autoBuyMagicTemplateIds.includes(templateId);autoBuy=`<label class=\"flex items-center gap-2 mt-2 text-sm text-cyan-200\"><input type=\"checkbox\" data-pref-action=\"toggle-autobuy\" data-id=\"${prefEsc(templateId)}\" ${checked?'checked':''}>このマジックカードの自動購入を許可</label><div class=\"text-[10px] text-slate-400\">未所持で市場に出品されている場合、資金がマイナスにならない範囲で自動購入します。</div>`;}
    body.insertAdjacentHTML('beforeend',`<div class=\"mt-3 pt-3 border-t border-slate-700 text-sm text-emerald-200 space-y-2\">${value}${expires}${autoBuy}</div>`);
  }
}

function prefShowReplaceListingConfirm(id) {
  const inst=campaignState?.instances?.[id];const card=prefCardForInstance(id);if(!inst||!card)return;
  const count=inst.kind==='unit'?prefOwnedUnits(PREF_PLAYER_ID).length:prefOwnedMagics(PREF_PLAYER_ID).length;
  const warning=inst.kind==='unit'&&count<=3?'<div class="mt-3 rounded-lg bg-rose-950/60 border border-rose-500/40 p-3 text-xs text-rose-200">キャラカードが3枚未満になると対戦できません。対戦コマンドを選ぶとゲームオーバーになります。先にガチャや市場で補充してください。</div>':'';
  prefShowModal('カードを市場へ出品',`<div class="flex gap-4 items-start"><div class="w-28 shrink-0">${prefCardDisplay(id,{small:true})}</div><div class="min-w-0"><div class="font-black text-white">${prefEsc(card.name)}</div><div class="text-sm text-emerald-200 mt-2">出品価格：${prefFormatMoney(prefCardValue(card))}</div><p class="text-xs text-slate-400 mt-2">出品中はキャラカードの所持期限が進みません。5ターン以内に購入されなければ、キャラはガチャへ戻り、マジックは市場から消えます。</p>${warning}</div></div>`,[{label:'キャンセル',action:'close-modal',style:'slate'},{label:'出品する',action:'confirm-list-card',id,style:'primary'}]);
}
function prefListPlayerCard(id) {
  const inst=campaignState?.instances?.[id];if(!inst||inst.zone!=='owner'||inst.ownerId!==PREF_PLAYER_ID)return;
  const card=prefCardForInstance(id);if(!card)return;
  prefListInstance(inst,PREF_PLAYER_ID,'player-listing');prefLog(`「${card.name}」を${prefFormatMoney(prefCardValue(card))}で市場へ出品しました。`,'info');
  prefSave().then(()=>{prefRenderAll();switchView('pref-holder');}).catch(console.error);
}
function prefWithdrawListing(id) {
  const inst=campaignState?.instances?.[id];if(!inst||inst.zone!=='market'||inst.sellerRegionId!==PREF_PLAYER_ID)return;
  if(inst.kind==='unit')prefSetInstanceOwner(inst,PREF_PLAYER_ID,true);else prefSetInstanceOwner(inst,PREF_PLAYER_ID,false);
  prefLog(`市場出品を取り消し、カードをホルダーへ戻しました。`,'info');prefSave().then(()=>{prefRenderAll();renderPrefMarket();}).catch(console.error);
}
function prefConfirmPurchaseDialog(id) {
  const inst=campaignState?.instances?.[id];const card=prefCardForInstance(id)||prefTemplate(inst?.templateId);if(!inst||inst.zone!=='market'||!card)return;
  const p=prefPlayerRegion();const price=prefCardValue(card);const duplicate=inst.kind==='magic'&&prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId));
  const duplicateUnit=inst.kind==='unit'&&prefOwnedUnits(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId));
  prefShowModal('カード購入の確認',`<div class="flex gap-4 items-start"><div class="w-28 shrink-0">${prefCardDisplay(id,{small:true})}</div><div class="min-w-0"><div class="font-black text-white">${prefEsc(card.name)}</div><div class="text-xl font-black text-emerald-200 mt-2">${prefFormatMoney(price)}</div><div class="text-xs text-slate-400 mt-2">購入後の所持資金：${prefFormatMoney((p.funds||0)-price)}</div>${duplicate?'<p class="text-rose-300 text-xs mt-2">同じマジックカードをすでに所持しているため購入できません。</p>':''}${duplicateUnit?'<p class="text-rose-300 text-xs mt-2">同じキャラカードを所持しているため購入できません。</p>':''}${p.funds<price?'<p class="text-rose-300 text-xs mt-2">資金が不足しています。</p>':''}</div></div>`,[{label:'キャンセル',action:'close-modal',style:'slate'},...(duplicate||duplicateUnit||p.funds<price?[]:[{label:'購入する',action:'confirm-buy-card',id,style:'primary'}])]);
}
async function prefBuyCard(id) {
  const inst=campaignState?.instances?.[id];const card=prefCardForInstance(id)||prefTemplate(inst?.templateId);const p=prefPlayerRegion();
  if(!inst||inst.zone!=='market'||!card||!p)return;
  const price=prefCardValue(card);if(p.funds<price){prefShowModal('資金不足','購入する資金がありません。',[{label:'戻る',action:'close-modal',style:'slate'}]);return;}
  if(inst.kind==='magic'&&prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId))){prefShowModal('購入できません','同じマジックカードを重複して所持することはできません。',[{label:'戻る',action:'close-modal'}]);return;}
  if(inst.kind==='unit'&&prefOwnedUnits(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId))){prefShowModal('購入できません','同じキャラカードを所持しています。',[{label:'戻る',action:'close-modal'}]);return;}
  const seller=inst.sellerRegionId;
  prefBook(PREF_PLAYER_ID,-price,'market-buy');
  if(seller&&seller!==PREF_PLAYER_ID)prefBook(seller,price,'market-sale');
  else if(seller===PREF_PLAYER_ID){prefBook(PREF_PLAYER_ID,price,'market-sale');}
  const result=prefAcquireInstance(PREF_PLAYER_ID,id,{reason:'market-buy'});
  prefLog(`市場で「${card.name}」を${prefFormatMoney(price)}で購入しました。`,'success');
  await prefSave();prefSyncCampaignClones();prefCloseModal();prefRenderAll();
  if(result==='pending')prefShowReplaceModal();else switchView('pref-market');
}

function prefResolveGachaTier(key) {
  const g=PREF_GACHA[key];if(!g)return null;
  const roll=Math.random()*100;let cursor=0;let result=null;
  for(const odds of g.odds){cursor+=odds.weight;if(roll<cursor){result=odds;break;}}
  if(!result)return {kind:'magic'};
  if(result.kind==='magic')return result;
  const eligible=prefEligibleGachaUnitInstances();
  for(let r=Number(result.rank);r>=1;r--){const list=eligible.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===r);if(list.length)return {kind:'unit',rank:r,instance:prefRandom(list),fallback:r!==Number(result.rank)};}
  return {kind:'magic',fallback:true,noUnits:true};
}
async function prefPullGacha(key) {
  const p=prefPlayerRegion(),g=PREF_GACHA[key];if(!p||!g)return;
  const allowed=key==='A'?['S','A','B'].includes(p.tier):key==='B'?['S','A','B','C','D'].includes(p.tier):true;
  if(!allowed){prefShowModal('ガチャ未解放',`このガチャは都道府県ランク${key==='A'?'B':key==='B'?'D':'—'}以上で解放されます。`,[{label:'戻る',action:'close-modal'}]);return;}
  if(p.funds<g.price){prefShowModal('資金不足',`${g.label}を引くには${prefFormatMoney(g.price)}必要です。`,[{label:'戻る',action:'close-modal'}]);return;}
  // Gacha expenditure reduces current cash, but does not directly reduce the annual ranking asset metric.
  p.funds-=g.price;
  const selected=prefResolveGachaTier(key);
  let resultCard=null;
  if(selected.kind==='unit'&&selected.instance){
    resultCard=selected.instance;
    prefAcquireInstance(PREF_PLAYER_ID,resultCard.id,{reason:'gacha'});
    const card=prefCardForInstance(resultCard.id)||prefTemplate(resultCard.templateId);
    prefLog(`ガチャからキャラカード「${card?.name||'カード'}」（★${prefRankStars(card)}）が排出されました。`,'success');
  } else {
    const templates=prefCardTemplates().filter(c=>c.cardType==='magic');
    const template=prefRandom(templates);
    if(!template){p.funds+=g.price;prefShowModal('ガチャ停止','マジックカードの作成データがありません。',[{label:'戻る',action:'close-modal'}]);return;}
    resultCard=prefCreateInstance(template.id,'pending',null,{source:'gacha'});
    const already=prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(template.id));
    if(already){prefListInstance(resultCard,PREF_PLAYER_ID,'duplicate-gacha');prefLog(`重複したマジックカード「${template.name}」を自動的に市場へ出品しました。`,'info');}
    else {prefAcquireInstance(PREF_PLAYER_ID,resultCard.id,{reason:'gacha'});}
    prefLog(`ガチャからマジックカード「${template.name}」が排出されました。`,'success');
  }
  await prefSave();prefSyncCampaignClones();prefRenderAll();
  const c=resultCard?(prefCardForInstance(resultCard.id)||prefTemplate(resultCard.templateId)):null;
  const fallback=selected.fallback?`<p class="text-xs text-amber-200 mt-2">希望ランクのカードが残っていないため、${selected.noUnits?'マジックカードに切り替えました':`★${selected.rank}で代用しました`}。</p>`:'';
  const location=resultCard&&campaignState.instances[resultCard.id]?.zone==='market'?'<p class="text-xs text-cyan-200 mt-2">重複または所持上限のため市場へ出品されました。</p>':'';
  const cardBlock=c?`<div class="mx-auto w-44 mt-3">${prefCardDisplay(resultCard.id,{small:true})}</div><div class="text-center mt-2"><div class="font-black text-white text-lg">${prefEsc(c.name)}</div><div class="text-emerald-200 font-black mt-1">価値 ${prefFormatMoney(prefCardValue(c))}</div></div>`:'<p class="text-slate-400 text-sm">カードの登録データが見つかりませんでした。</p>';
  prefShowModal('✨ ガチャ結果',`<div class="text-center"><div class="inline-flex px-3 py-1 rounded-full bg-violet-950 border border-violet-500/50 text-violet-200 text-xs font-black">${prefEsc(g.label)} · ${prefFormatMoney(g.price)}</div><div class="text-4xl mt-3 animate-pulse">${c?.cardType==='magic'?'📜':'🌟'}</div>${cardBlock}${fallback}${location}</div>`,[{label:'結果を確認',action:'gacha-result-close',style:'primary'}]);
}

function prefShowBattleSelection(finalizing=false) {
  if(!campaignState)return;
  const p=prefPlayerRegion();const units=prefOwnedUnits(PREF_PLAYER_ID);
  if(units.length<3){prefTriggerGameOver('キャラカードが3枚未満の状態で対戦コマンドを選択しました。');return;}
  if(p.lastBattleAbs>0 && p.lastBattleAbs===prefAbsTurn()-1){prefShowModal('連戦禁止','前週に対戦したため、今週は対戦コマンドを選べません。',[{label:'了解',action:'close-modal',style:'primary'}]);return;}
  const provisional=finalizing?(campaignState.turnProcessing?.actions?.[PREF_PLAYER_ID]?.loadout||p.lastLoadout||{}):(p.lastLoadout||{});
  let active=(provisional.active||[]).filter(id=>units.some(x=>x.id===id));let reserve=(provisional.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id));
  if(active.length!==3){active=units.slice(0,3).map(x=>x.id);reserve=units.slice(3,5).map(x=>x.id);}
  if(reserve.length>2)reserve=reserve.slice(0,2);
  if(active.length<3){const rest=units.filter(x=>!active.includes(x.id)&&!reserve.includes(x.id));while(active.length<3&&rest.length)active.push(rest.shift().id);}
  const box=document.getElementById('pref-battle-selection');box.classList.remove('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');
  if(finalizing){document.getElementById('pref-command-panel')?.classList.remove('hidden');document.getElementById('pref-turn-progress')?.classList.add('hidden');document.getElementById('campaign-preview-resume')?.classList.add('hidden');}
  const pair=finalizing?(campaignState.turnProcessing?.pairs||[]).find(pair=>pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID):null;
  const rivalId=pair?(pair.a===PREF_PLAYER_ID?pair.b:pair.a):null;const rival=rivalId?prefRegion(rivalId):null;
  box.innerHTML=`<div class="flex flex-wrap justify-between gap-2 items-start"><div><h3 class="text-lg font-black text-rose-200">${finalizing?'対戦前の最終編成を確定':'対戦用の5枚を選出'}</h3><p class="text-xs text-slate-400 mt-1">${finalizing?`対戦相手：${prefEsc(rival?.prefecture||'決定済みの代表')}。出撃3体と控え2体までを選び、この編成で対戦を開始します。`:'出撃3体を必ず選択。残り2枚までは控えにできます。'} カードをタップして役割を変更できます。</p></div><button data-pref-action="cancel-command" class="px-3 py-2 bg-slate-800 rounded-lg text-xs font-bold">${finalizing?'編成を戻す':'キャンセル'}</button></div><div id="pref-loadout-counter" class="mt-3 text-xs font-black text-amber-200"></div><div id="pref-loadout-list" class="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3"></div><div class="flex flex-wrap gap-2 mt-4"><button data-pref-action="auto-loadout" class="px-4 py-3 rounded-lg bg-slate-800 text-xs font-black">自動選出</button><button data-pref-action="${finalizing?'confirm-final-loadout':'confirm-battle'}" class="flex-1 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-sm">${finalizing?'この編成を確定して対戦開始':'仮編成で対戦相手を決定'}</button></div>${finalizing?'<p class="text-[10px] text-amber-200 mt-2">対戦相手は確定済みです。ここで編成を確定すると戦闘が始まります。</p>':'<p class="text-[10px] text-slate-500 mt-2">対戦相手が決まった後に、編成を変更して最終確定できます。</p>'}`;
  campaignState.draftLoadout={active,reserve};prefRenderLoadout();
}
function prefRenderLoadout() {
  const box=document.getElementById('pref-loadout-list');if(!box||!campaignState)return;
  const units=prefOwnedUnits(PREF_PLAYER_ID);const draft=campaignState.draftLoadout||{active:[],reserve:[]};
  box.innerHTML=units.map(inst=>{
    const pos=draft.active.includes(inst.id)?'active':draft.reserve.includes(inst.id)?'reserve':'none';
    const card=prefCardForInstance(inst.id);const label=pos==='active'?'出撃':pos==='reserve'?'控え':'未選択';const cls=pos==='active'?'border-rose-400 bg-rose-950/40':pos==='reserve'?'border-cyan-400 bg-cyan-950/40':'border-slate-700 bg-slate-900';
    return `<button data-pref-action="toggle-loadout" data-id="${prefEsc(inst.id)}" class="rounded-xl border-2 ${cls} p-1 text-left min-w-0"><div class="pointer-events-none">${prefCardDisplay(inst.id,{small:true})}</div><div class="mt-1 text-center text-[10px] font-black ${pos==='active'?'text-rose-200':pos==='reserve'?'text-cyan-200':'text-slate-500'}">${label}</div><div class="text-[9px] text-slate-500 text-center">${prefFormatMoney(prefCardValue(card))}</div></button>`;
  }).join('');
  const count=document.getElementById('pref-loadout-counter');if(count)count.textContent=`出撃 ${draft.active.length}/3　／　控え ${draft.reserve.length}/2　／　所持 ${units.length}/10`;
}
function prefToggleLoadout(id) {
  const draft=campaignState?.draftLoadout;if(!draft)return;
  if(draft.active.includes(id)){
    draft.active=draft.active.filter(x=>x!==id);if(draft.reserve.length<2)draft.reserve.push(id);
  }else if(draft.reserve.includes(id)){
    draft.reserve=draft.reserve.filter(x=>x!==id);
  }else if(draft.active.length<3){draft.active.push(id);}
  else if(draft.reserve.length<2){draft.reserve.push(id);}
  else {prefPendingNotice='出撃3体と控え2体まで選択できます。';}
  prefRenderLoadout();
}
function prefAutoLoadout() {
  const units=prefOwnedUnits(PREF_PLAYER_ID);const ranked=units.slice().sort((a,b)=>{
    const ca=prefCardForInstance(a.id),cb=prefCardForInstance(b.id);return prefRankStars(cb)-prefRankStars(ca)||prefCardValue(cb)-prefCardValue(ca);
  });
  campaignState.draftLoadout={active:ranked.slice(0,3).map(x=>x.id),reserve:ranked.slice(3,5).map(x=>x.id)};prefRenderLoadout();
}
function prefShowInvestigationSelection() {
  if(!campaignState)return;
  const p=prefPlayerRegion();if((p.nonBattleStreak||0)>=3){prefShowModal('対戦が必要です','3ターン連続で対戦しなかったため、今週は対戦コマンドを選択する必要があります。',[{label:'了解',action:'close-modal'}]);return;}
  const options=prefCurrentRegionRankList().filter(r=>r.id!==PREF_PLAYER_ID);
  const box=document.getElementById('pref-investigation-selection');box.classList.remove('hidden');document.getElementById('pref-battle-selection')?.classList.add('hidden');
  box.innerHTML=`<div class="flex flex-wrap justify-between gap-2 items-start"><div><h3 class="text-lg font-black text-cyan-200">調査する代表を選ぶ</h3><p class="text-xs text-slate-400 mt-1">調査結果は調査時点のスナップショットとして保存されます。</p></div><button data-pref-action="cancel-command" class="px-3 py-2 bg-slate-800 rounded-lg text-xs font-bold">キャンセル</button></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><label class="text-xs text-slate-300 font-bold">調査対象<select id="pref-invest-target" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm">${options.map(r=>`<option value="${prefEsc(r.id)}">${prefEsc(prefRankLabel(r))} · ${prefEsc(r.prefecture)} · ${prefEsc(r.repName)}（${r.tier}）</option>`).join('')}</select></label><label class="text-xs text-slate-300 font-bold">調査内容<select id="pref-invest-topic" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm"><option value="cards">所持キャラカード</option><option value="behavior">行動方針・性格</option><option value="both">カードと行動方針</option></select></label></div><button data-pref-action="confirm-investigation" class="mt-4 w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-black text-sm">調査コマンドを実行</button>`;
}

function prefDecideAiCommand(region) {
  if(region.lastBattleAbs>0 && region.lastBattleAbs===prefAbsTurn()-1)return {type:'investigate',target:prefRandom(Object.keys(campaignState.regions).filter(x=>x!==region.id)),topic:region.personality==='scout'?'both':'cards'};
  if((region.nonBattleStreak||0)>=3 && prefOwnedUnits(region.id).length>=3)return {type:'battle'};
  const p=PREF_PERSONALITIES.find(x=>x.id===region.personality)||PREF_PERSONALITIES[1];
  const units=prefOwnedUnits(region.id).length;
  let battleProb=p.battle;
  if(units<3)battleProb=0;
  if(region.funds<15000000)battleProb=Math.min(battleProb,0.35);
  if(Math.random()<battleProb)return {type:'battle'};
  const target=prefRandom(Object.keys(campaignState.regions).filter(x=>x!==region.id));
  return {type:'investigate',target,topic:region.personality==='scout'?'both':region.personality==='careful'?'behavior':'cards'};
}
function prefAiGachaAllowed(region,key) {
  if(region.funds<PREF_GACHA[key].price)return false;
  if(key==='A')return ['S','A','B'].includes(region.tier);
  if(key==='B')return ['S','A','B','C','D'].includes(region.tier);
  return true;
}
function prefAiTryEconomy(region) {
  const units=prefOwnedUnits(region.id),magics=prefOwnedMagics(region.id);
  const needUnits=units.length<3;
  // A rival first checks the market for a unit if it is short on battle-ready cards.
  let marketUnits=prefMarketListings('unit',false).filter(inst=>{
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    if(!card||region.funds<prefCardValue(card)||inst.sellerRegionId===region.id)return false;
    if(units.some(x=>String(x.templateId)===String(inst.templateId)))return false;
    if(prefOwnedInstancesAny().some(x=>String(x.templateId)===String(inst.templateId)&&x.ownerId!==region.id&&!x.copyException&&!inst.copyException))return false;
    return true;
  }).sort((a,b)=>prefCardValue(prefCardForInstance(a.id))-prefCardValue(prefCardForInstance(b.id)));
  if(marketUnits.length && (needUnits || (units.length<5 && Math.random()<(region.personality==='collector'?0.45:0.17)))){
    const inst=marketUnits[0],card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId),price=prefCardValue(card);const seller=inst.sellerRegionId;
    prefBook(region.id,-price,'market-buy');if(seller)prefBook(seller,price,'market-sale');prefSetInstanceOwner(inst,region.id,true);
    if(units.length>=5){const old=prefAiReplacementChoice(region,units,inst);if(old===inst.id)prefListInstance(inst,region.id,'ai-rejected-card');else if(campaignState.instances[old])prefListInstance(campaignState.instances[old],region.id,'ai-replacement');}
    prefLog(`${region.prefecture}が市場でキャラカード「${card.name}」を購入しました。`,'info');return;
  }
  // A single no-cost-per-turn decision may draw a gacha; the gacha fee itself is still paid normally.
  const wantsShop=needUnits || Math.random()<(region.personality==='collector'?0.48:region.personality==='careful'?0.15:0.25);
  if(wantsShop){
    let key='C';if(prefAiGachaAllowed(region,'B')&&region.tier!=='E'&&Math.random()<0.45)key='B';if(prefAiGachaAllowed(region,'A')&&Math.random()<0.12)key='A';
    if(prefAiGachaAllowed(region,key)){
      region.funds-=PREF_GACHA[key].price;
      const selected=prefResolveGachaTier(key);
      if(selected.kind==='unit'&&selected.instance){const inst=selected.instance;const card=prefCardForInstance(inst.id);if(prefOwnedUnits(region.id).length<5)prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha'});else{const old=prefAiReplacementChoice(region,prefOwnedUnits(region.id),inst);if(old===inst.id)prefListInstance(inst,region.id,'ai-rejected-card');else{prefListInstance(campaignState.instances[old],region.id,'ai-replacement');prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha'});}}prefLog(`${region.prefecture}がガチャで「${card?.name||'キャラカード'}」を獲得しました。`,'info');}
      else {
        const templates=prefCardTemplates().filter(c=>c.cardType==='magic');if(templates.length){const t=prefRandom(templates),inst=prefCreateInstance(t.id,'pending',null,{source:'ai-gacha'});if(prefOwnedMagics(region.id).some(x=>String(x.templateId)===String(t.id)))prefListInstance(inst,region.id,'duplicate-gacha');else prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha'});}
      }
    }
  }
  // Collectors can buy one affordable magic card from market if it complements their current hand.
  if(region.personality==='collector'&&magics.length<3&&Math.random()<0.3){
    const candidate=prefMarketListings('magic',false).find(inst=>inst.sellerRegionId!==region.id&&region.funds>=prefValueFromInstance(inst)&&!prefOwnedMagics(region.id).some(x=>String(x.templateId)===String(inst.templateId)));
    if(candidate){const price=prefValueFromInstance(candidate),seller=candidate.sellerRegionId;prefBook(region.id,-price,'market-buy');if(seller)prefBook(seller,price,'market-sale');prefSetInstanceOwner(candidate,region.id,false);candidate.expiresAtAbs=null;}
  }
}

function prefPairBattlers(actions) {
  let fighters=Object.entries(actions).filter(([id,a])=>a?.type==='battle').map(([id])=>id);
  fighters.sort((a,b)=>prefRankOf(a)-prefRankOf(b)||String(a).localeCompare(String(b),'ja'));
  let unmatched=null;
  if(fighters.length%2===1){
    const eligible=fighters.filter(id=>id!==PREF_PLAYER_ID);
    const pool=eligible.length?eligible:fighters;
    const selected=pool[Math.floor(Math.random()*pool.length)];
    unmatched=selected;fighters=fighters.filter(id=>id!==selected);
  }
  const pairs=[];
  while(fighters.length>=2){
    const a=fighters.shift();
    // Rank-sorted adjacent pairing minimizes rank differences while preserving a deterministic saved pairing.
    const b=fighters.shift();pairs.push({id:generateUniqueId('prefpair'),a,b,status:'pending',winner:null,draw:false});
  }
  return {pairs,unmatched};
}
function prefApplyCommandStreaks(actions) {
  for(const [id,action] of Object.entries(actions)){
    const region=prefRegion(id);if(!region)continue;
    region.lastCommand=action.type;region.lastCommandAbs=prefAbsTurn();
    if(action.type==='battle'){region.nonBattleStreak=0;region.lastBattleAbs=prefAbsTurn();}
    else region.nonBattleStreak=Math.min(3,(region.nonBattleStreak||0)+1);
  }
}
function prefAutoBuyListedMagics(region){
  if(!campaignState||!region)return;region.autoBuyMagicTemplateIds=Array.isArray(region.autoBuyMagicTemplateIds)?region.autoBuyMagicTemplateIds:[];
  for(const templateId of region.autoBuyMagicTemplateIds){
    if(prefOwnedMagics(region.id).some(i=>String(i.templateId)===String(templateId)))continue;
    const listing=prefMarketListings('magic').find(i=>String(i.templateId)===String(templateId)&&i.sellerRegionId!==region.id);
    if(!listing)continue;const cost=prefValueFromInstance(listing);if(Number(region.funds)<cost||Number(region.funds)-cost<0)continue;
    prefBook(region.id,-cost,'auto-buy-magic');prefSetInstanceOwner(listing,region.id);prefLog(`${region.prefecture}が自動購入設定によりマジックカード「${prefTemplate(templateId)?.name||'カード'}」を${prefFormatMoney(cost)}で購入しました。`,'info');
  }
}
function prefMakeTurnActions(playerAction) {
  const actions={[PREF_PLAYER_ID]:playerAction};
  for(const r of Object.values(campaignState.regions).filter(x=>!x.isPlayer)){
    prefAiTryEconomy(r);
    const action=prefDecideAiCommand(r);
    actions[r.id]=action;
  }
  return actions;
}
async function prefBeginTurn(playerAction) {
  if(!campaignState||campaignState.gameOver||campaignState.turnProcessing)return;
  const p=prefPlayerRegion();
  if(playerAction.type==='battle'&&p.lastBattleAbs>0&&p.lastBattleAbs===prefAbsTurn()-1){prefShowModal('連戦禁止','同じ代表は連続する週に対戦できません。',[{label:'了解',action:'close-modal'}]);return;}
  if(playerAction.type==='investigate'&&(p.nonBattleStreak||0)>=3){prefShowModal('対戦が必要です','3ターン連続で対戦していないため、今週は対戦コマンドを選択してください。',[{label:'了解',action:'close-modal'}]);return;}
  if(playerAction.type==='battle'&&prefOwnedUnits(PREF_PLAYER_ID).length<3){await prefTriggerGameOver('キャラカードが3枚未満の状態で対戦コマンドを選択しました。');return;}
  const tx={id:generateUniqueId('prefturn'),year:campaignState.year,week:campaignState.week,absoluteTurn:prefAbsTurn(),stage:'matching',actions:{[PREF_PLAYER_ID]:playerAction},pairs:[],pairIndex:0,unmatched:null,investigationResult:null,startedAt:Date.now()};
  campaignState.turnProcessing=tx;campaignState.draftLoadout=null;
  if(playerAction.type==='battle') p.lastLoadout=JSON.parse(JSON.stringify(playerAction.loadout||{active:[],reserve:[]}));
  await prefSave();
  // AI shopping and command decisions are now a saved part of the turn transaction.
  for(const region of Object.values(campaignState.regions))prefAutoBuyListedMagics(region);
  const actions=prefMakeTurnActions(playerAction);
  prefApplyCommandStreaks(actions);
  let matched=prefPairBattlers(actions);
  // Normally there are many AI entrants, but if the player is the only entrant, assign an eligible rival so the selected battle command can still proceed.
  if(playerAction.type==='battle'&&matched.unmatched===PREF_PLAYER_ID&&!(matched.pairs||[]).some(pair=>pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID)){
    const fallback=Object.values(campaignState.regions).filter(r=>r.id!==PREF_PLAYER_ID&&prefOwnedUnits(r.id).length>=3&&!(r.lastBattleAbs>0&&r.lastBattleAbs===prefAbsTurn()-1)).sort((a,b)=>Math.abs(prefRankOf(a.id)-prefRankOf(PREF_PLAYER_ID))-Math.abs(prefRankOf(b.id)-prefRankOf(PREF_PLAYER_ID)))[0];
    if(fallback){fallback.lastCommand='battle';fallback.lastCommandAbs=prefAbsTurn();fallback.nonBattleStreak=0;fallback.lastBattleAbs=prefAbsTurn();actions[fallback.id]={type:'battle'};matched=prefPairBattlers(actions);}
  }
  tx.actions=actions;tx.pairs=matched.pairs;tx.unmatched=matched.unmatched;tx.stage='battles';tx.pairIndex=0;
  if(matched.unmatched)prefLog(`${prefRegion(matched.unmatched)?.prefecture||matched.unmatched}は対戦希望者が奇数だったため、今週は対戦不成立（対戦扱い）となりました。`,'info');
  Object.entries(actions).forEach(([id,a])=>{if(id!==PREF_PLAYER_ID&&a.type==='investigate')tx.actions[id]={...a};});
  await prefSave();prefRenderAll();
  const playerPair=(tx.pairs||[]).find(pair=>pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID);
  if(playerPair){
    const opponentId=playerPair.a===PREF_PLAYER_ID?playerPair.b:playerPair.a;const opponent=prefRegion(opponentId);const opponentLoadout=prefBattleOverrideForRegions(PREF_PLAYER_ID,opponentId,playerAction.loadout);
    const opponentCards=opponentLoadout.selectedB.map(id=>{const card=prefCardForInstance(id);return card?`<span class=\"inline-block rounded bg-slate-800 px-2 py-1 m-1\">${prefEsc(card.name)} ★${prefRankStars(card)}</span>`:''}).join('');
    campaignState.draftLoadout=JSON.parse(JSON.stringify(playerAction.loadout||prefDefaultLoadout(PREF_PLAYER_ID)));
    tx.stage='player-preview';await prefSave();prefRenderDashboard();prefEnsurePreviewResumeButton();
    prefShowModal('⚔️ 対戦相手が決定',`<div class="text-center"><div class="text-4xl mb-2">${prefEsc(opponent?.icon||'🏯')}</div><div class="text-2xl font-black text-rose-200">${prefEsc(opponent?.prefecture||opponentId)}</div><div class="text-lg font-bold mt-1">${prefEsc(opponent?.repName||'代表')}</div><div class="mt-2 text-amber-200 font-black">現在順位：${prefRankOf(opponentId)}位（${prefEsc(opponent?.tier||'E')}ランク）</div><div class="text-xs text-slate-400 mt-1">所持資金：${prefFormatMoney(opponent?.funds||0)}</div><div class="text-left mt-4"><div class="font-black text-slate-200 mb-1">対戦相手の選出カード</div>${opponentCards||'カード情報なし'}</div><p class="text-xs text-slate-400 mt-3">相手は確定しました。編成はこの後で変更して最終確定できます。カードホルダーや調査結果を確認してから再開することもできます。</p></div>`,[{label:'閉じる',action:'close-modal'},{label:'編成・調査を確認',action:'battle-preview-back'},{label:'編成を選んで対戦開始',action:'battle-preview-continue',style:'primary'}]);
    return;
  }
  await prefContinueTurn();
}
function prefDefaultLoadout(regionId) {
  const units=prefOwnedUnits(regionId);const r=prefRegion(regionId);
  const saved=r?.lastLoadout||{};
  let active=(saved.active||[]).filter(id=>units.some(x=>x.id===id));let reserve=(saved.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id));
  if(active.length<Math.min(3,units.length)){active=units.slice(0,3).map(x=>x.id);reserve=units.slice(3,5).map(x=>x.id);}
  return {active:active.slice(0,3),reserve:reserve.slice(0,2)};
}
function prefBattleOverrideForRegions(aId,bId,playerLoadout=null) {
  const a=prefRegion(aId),b=prefRegion(bId);
  const unitsA=prefOwnedUnits(aId),unitsB=prefOwnedUnits(bId);
  const magsA=prefOwnedMagics(aId),magsB=prefOwnedMagics(bId);
  const loadA=playerLoadout||prefDefaultLoadout(aId);const loadB=prefDefaultLoadout(bId);
  const selectedA=[...loadA.active,...loadA.reserve].filter(id=>unitsA.some(x=>x.id===id)).slice(0,5);
  const selectedB=[...unitsB.map(x=>x.id)].slice(0,5);
  const activeA=loadA.active.filter(id=>selectedA.includes(id)).slice(0,3);
  while(activeA.length<Math.min(3,selectedA.length)){const id=selectedA.find(x=>!activeA.includes(x));if(!id)break;activeA.push(id);}
  const reserveA=selectedA.filter(id=>!activeA.includes(id)).slice(0,2);
  const activeB=selectedB.slice(0,3);const reserveB=selectedB.slice(3,5);
  return {playerDeck:{id:`pref-${aId}`,name:`${a.prefecture}デッキ`,unitIds:selectedA,magicIds:magsA.map(x=>x.id)},enemyDeck:{id:`pref-${bId}`,name:`${b.prefecture}デッキ`,unitIds:selectedB,magicIds:magsB.map(x=>x.id)},playerActive:activeA,playerReserve:reserveA,enemyIntelligence:b.aiIntelligence||'normal',playerIntelligence:a.aiIntelligence||'expert',playerName:a.repName,enemyName:b.repName,enemyRivalId:null,enemyIconUrl:null,playerIconUrl:null,regionA:aId,regionB:bId,selectedA,selectedB};
}
function prefBattleResultFromEngine() { return {winner:battleState.resultWinner||'draw',usedAMagic:[...(battleState.usedMagicCardIds||[])],usedBMagic:[...(battleState.enemyUsedMagicCardIds||[])],selectedA:(campaignBattleOverride?.selectedA||[]).slice(),selectedB:(campaignBattleOverride?.selectedB||[]).slice()}; }
function prefConsumeMagic(regionId, ids) {
  for(const id of ids||[]){const inst=campaignState.instances[id];if(inst&&inst.kind==='magic'&&inst.zone==='owner'&&inst.ownerId===regionId){inst.zone='consumed';inst.ownerId=null;inst.sellerRegionId=null;}}
}
function prefRandomDestroyUnits(regionId, candidateIds) {
  const valid=(candidateIds||[]).filter(id=>{const inst=campaignState.instances[id];return inst&&inst.zone==='owner'&&inst.ownerId===regionId&&inst.kind==='unit';});
  const destroyed=prefShuffle(valid).slice(0,Math.min(2,valid.length));
  destroyed.forEach(id=>{const card=prefCardForInstance(id);prefSendToGacha(campaignState.instances[id],'battle-loss');prefLog(`${prefRegion(regionId)?.prefecture||regionId}の「${card?.name||'キャラカード'}」が敗北により破壊され、ガチャへ戻りました。`,'warning');});
  return destroyed;
}
function prefResignRival(region) {
  const old=region.repName;let name=prefRandom(PREF_NAMES);let tries=0;while(name===old&&tries++<10)name=prefRandom(PREF_NAMES);
  const personality=prefRandom(PREF_PERSONALITIES);
  region.repName=name;region.personality=personality.id;region.personalityLabel=personality.name;region.personalityFocus=personality.focus;region.aiIntelligence=personality.intelligence||'normal';region.funds=100000000;region.resignations=(region.resignations||0)+1;
  prefLog(`${region.prefecture}の代表${old}が資金マイナスで辞職。${name}が初期資金1億円で就任しました。カードと都道府県の年間成績は引き継がれます。`,'warning');
}
async function prefApplyBattleOutcome(aId,bId,engineResult,selectedA,selectedB) {
  const a=prefRegion(aId),b=prefRegion(bId);if(!a||!b)return;
  prefConsumeMagic(aId,engineResult.usedAMagic||[]);prefConsumeMagic(bId,engineResult.usedBMagic||[]);
  const result=engineResult.winner||'draw';let winnerId=null,loserId=null;
  if(result==='player'){winnerId=aId;loserId=bId;}else if(result==='enemy'){winnerId=bId;loserId=aId;}
  if(result==='draw'){
    a.yearStats.draws=(a.yearStats.draws||0)+1;b.yearStats.draws=(b.yearStats.draws||0)+1;
    a.allTimeStats.draws=(a.allTimeStats.draws||0)+1;b.allTimeStats.draws=(b.allTimeStats.draws||0)+1;
    a.yearStats.battles=(a.yearStats.battles||0)+1;b.yearStats.battles=(b.yearStats.battles||0)+1;
    a.allTimeStats.battles=(a.allTimeStats.battles||0)+1;b.allTimeStats.battles=(b.allTimeStats.battles||0)+1;
    prefLog(`${a.prefecture}と${b.prefecture}の対戦は引き分けでした。`,'info');
  }else{
    const w=prefRegion(winnerId),l=prefRegion(loserId);
    w.yearStats.wins=(w.yearStats.wins||0)+1;l.yearStats.losses=(l.yearStats.losses||0)+1;
    w.allTimeStats.wins=(w.allTimeStats.wins||0)+1;l.allTimeStats.losses=(l.allTimeStats.losses||0)+1;
    w.yearStats.battles=(w.yearStats.battles||0)+1;l.yearStats.battles=(l.yearStats.battles||0)+1;
    w.allTimeStats.battles=(w.allTimeStats.battles||0)+1;l.allTimeStats.battles=(l.allTimeStats.battles||0)+1;
    const amount=Math.max(30000000,Math.floor(Math.max(0,Number(l.funds)||0)*0.30));
    prefBook(winnerId,amount,'battle-win');prefBook(loserId,-amount,'battle-loss');
    const loserDeck=loserId===aId?selectedA:selectedB;
    const destroyed=prefRandomDestroyUnits(loserId,loserDeck);if(loserId===PREF_PLAYER_ID)campaignState.lastPlayerBattleDestroyed=destroyed.map(id=>prefTemplate(campaignState.instances[id]?.templateId)?.name||'キャラカード');else campaignState.lastPlayerBattleDestroyed=[];
    prefLog(`${w.prefecture}が${l.prefecture}に勝利。${prefFormatMoney(amount)}を獲得しました。${l.prefecture}は${prefFormatMoney(amount)}を支払い、キャラカード${destroyed.length}枚を失いました。`,'success');
    if(!l.isPlayer && l.funds<0)prefResignRival(l);
  }
  return {winnerId,loserId,result};
}
async function prefSimulateAiBattle(pair) {
  const override=prefBattleOverrideForRegions(pair.a,pair.b);
  campaignBattleOverride=override;campaignBattlePending=null;campaignHeadlessBattle=true;window.__campaignHeadlessBattle=true;
  try {
    startBattle();
    await new Promise(resolve=>setTimeout(resolve,0));
    let guard=0;
    while(!battleState.resultWinner && guard<20){
      if(battleState.phase!=='decision') await new Promise(resolve=>setTimeout(resolve,0));
      if(battleState.phase==='decision'){
        chooseAiTurnPlan('player');
        await confirmPlayerActions();
      } else if(battleState.phase==='result')break;
      await new Promise(resolve=>setTimeout(resolve,0));
      guard++;
    }
    if(!battleState.resultWinner){battleState.resultWinner='draw';battleState.phase='result';}
    const result=prefBattleResultFromEngine();
    await prefApplyBattleOutcome(pair.a,pair.b,result,override.selectedA,override.selectedB);
    return result.winner;
  } catch(err) {
    console.error('[Prefecture] AI battle simulation failed; fallback to HP evaluator',err);
    const a=prefOwnedUnits(pair.a),b=prefOwnedUnits(pair.b);
    const score=arr=>arr.reduce((sum,i)=>{const c=prefCardForInstance(i.id);return sum+(Number(c?.stats?.hp)||0)*0.2+(Number(c?.stats?.atk)||0)+prefRankStars(c)*250;},0);
    const winner=score(a)>score(b)?'player':score(b)>score(a)?'enemy':'draw';
    await prefApplyBattleOutcome(pair.a,pair.b,{winner,usedAMagic:[],usedBMagic:[]},prefDefaultLoadout(pair.a).active.concat(prefDefaultLoadout(pair.a).reserve),prefDefaultLoadout(pair.b).active.concat(prefDefaultLoadout(pair.b).reserve));
    return winner;
  } finally {
    campaignHeadlessBattle=false;window.__campaignHeadlessBattle=false;campaignBattleOverride=null;campaignBattlePending=null;
    prefSyncCampaignClones();
  }
}

function prefLaunchPlayerBattle(pair) {
  const a=PREF_PLAYER_ID,bId=pair.a===PREF_PLAYER_ID?pair.b:pair.a;
  const loadout=campaignState.turnProcessing.actions[PREF_PLAYER_ID].loadout||prefDefaultLoadout(PREF_PLAYER_ID);
  const override=prefBattleOverrideForRegions(a,bId,loadout);
  campaignBattleOverride=override;
  campaignBattlePending={pairId:pair.id,pairIndex:campaignState.turnProcessing.pairIndex,playerRegionId:a,opponentRegionId:bId,selectedPlayer:override.selectedA,selectedOpponent:override.selectedB};
  pair.status='player-running';campaignState.turnProcessing.currentPairId=pair.id;
  prefSave().then(()=>{prefRenderDashboard();startBattle();}).catch(console.error);
}
async function prefFinalizePlayerBattle(winner) {
  const pending=campaignBattlePending;const tx=campaignState?.turnProcessing;if(!pending||!tx)return;
  const pair=tx.pairs.find(x=>x.id===pending.pairId);if(!pair||pair.status==='done')return;
  const engineResult=prefBattleResultFromEngine();
  await prefApplyBattleOutcome(pending.playerRegionId,pending.opponentRegionId,engineResult,pending.selectedPlayer,pending.selectedOpponent);
  pair.status='done';pair.winner=winner;pair.draw=winner==='draw';tx.pairIndex=Math.max(tx.pairIndex,pending.pairIndex+1);tx.currentPairId=null;
  campaignBattlePending=null;campaignBattleOverride=null;
  prefSyncCampaignClones();await prefSave();
}
async function prefContinueTurn() {
  if(prefProcessingPromise)return prefProcessingPromise;
  if(!campaignState?.turnProcessing)return;
  prefProcessingPromise=(async()=>{
    const tx=campaignState.turnProcessing;
    if(tx.stage==='matching'){
      // The last durable checkpoint precedes AI economy/command selection, so it is safe to rebuild once.
      const playerAction=tx.actions?.[PREF_PLAYER_ID]||{type:'investigate',target:Object.keys(campaignState.regions).find(id=>id!==PREF_PLAYER_ID),topic:'cards'};
      const actions=prefMakeTurnActions(playerAction);prefApplyCommandStreaks(actions);
      const matched=prefPairBattlers(actions);tx.actions=actions;tx.pairs=matched.pairs;tx.unmatched=matched.unmatched;tx.stage='battles';tx.pairIndex=0;
      await prefSave();prefRenderAll();
      if(playerAction.type==='battle'&&prefRecoverPendingBattlePreview(tx,true)){
        await prefSave();prefRenderAll();prefEnsurePreviewResumeButton();
        const playerPair=tx.pairs.find(pair=>(pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID)&&pair.status!=='done');
        const opponentId=playerPair?(playerPair.a===PREF_PLAYER_ID?playerPair.b:playerPair.a):null;
        const opponent=opponentId?prefRegion(opponentId):null;
        if(opponent)prefShowModal('⚔️ 対戦準備を復旧しました',`<div class="text-center"><div class="text-3xl mb-2">${prefEsc(opponent.icon||'🏯')}</div><div class="text-xl font-black text-rose-200">${prefEsc(opponent.prefecture||opponentId)}</div><div class="font-bold mt-1">${prefEsc(opponent.repName||'代表')}</div><p class="text-xs text-slate-300 mt-3">更新前の保存データから、未決着の対戦を復旧しました。編成を確認して対戦を開始できます。</p></div>`,[{label:'あとで再開',action:'close-modal'},{label:'編成を確認',action:'battle-preview-continue',style:'primary'}]);
        return;
      }
    }
    if(tx.stage==='player-preview'){document.getElementById('campaign-preview-resume')?.classList.remove('hidden');return;}
    if(tx.stage==='settling'){
      await prefCompleteTurn(tx);
      return;
    }
    while(tx.pairIndex<(tx.pairs||[]).length){
      const pair=tx.pairs[tx.pairIndex];
      if(!pair){tx.pairIndex++;continue;}
      if(pair.status==='done'){tx.pairIndex++;continue;}
      if(pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID){
        if(pair.status==='player-running' && !campaignBattlePending) { pair.status='pending'; }
        if(!campaignBattlePending)prefLaunchPlayerBattle(pair);
        return;
      }
      pair.status='simulating';tx.currentPairId=pair.id;await prefSave();
      const winner=await prefSimulateAiBattle(pair);
      pair.status='done';pair.winner=winner;pair.draw=winner==='draw';tx.pairIndex++;
      const progress=Math.round(tx.pairIndex/Math.max(1,tx.pairs.length)*100);const bar=document.getElementById('pref-turn-progress-bar'),txt=document.getElementById('pref-turn-progress-text');if(bar)bar.style.width=`${progress}%`;if(txt)txt.textContent=`AI対戦 ${tx.pairIndex}/${tx.pairs.length} 組を処理しました。`;
      await prefSave();prefRenderDashboard();
      // Yield to the browser so the progress label remains responsive during multiple AI battles.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(!tx.investigationsResolved){
      await prefResolveInvestigations(tx);
      tx.investigationsResolved=true;
      tx.stage='settling';
      await prefSave();
    }
    await prefCompleteTurn(tx);
  })().catch(err=>{console.error('[Prefecture] turn processing error',err);prefShowModal('ターン処理を復旧できませんでした',`保存済みの対戦結果は保持されています。ゲーム画面から再開できます。<pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.message||String(err))}</pre>`,[{label:'閉じる',action:'close-modal',style:'primary'}]);}).finally(()=>{prefProcessingPromise=null;});
  return prefProcessingPromise;
}

async function prefResolveInvestigations(tx) {
  const playerAction=tx.actions[PREF_PLAYER_ID];
  for(const [id,action] of Object.entries(tx.actions)){
    if(action.type!=='investigate')continue;
    const investigator=prefRegion(id),target=prefRegion(action.target);if(!investigator||!target)continue;
    const gradeGap=prefGradeValue(target)-prefGradeValue(investigator);
    let chance=prefClamp(0.70-gradeGap*0.12,0.12,0.90);
    if(investigator.personality==='scout')chance=Math.min(0.95,chance+0.12);
    if(investigator.personality==='careful')chance=Math.min(0.92,chance+0.04);
    const success=Math.random()<chance;const topic=action.topic||'cards';const result={year:campaignState.year,week:campaignState.week,absoluteTurn:prefAbsTurn(),investigatorId:id,targetPrefecture:target.prefecture,targetRepName:target.repName,targetTier:target.tier,chance,success,topic,cards:[],summary:''};
    if(success){
      const units=prefOwnedUnits(target.id);const max=gradeGap<=-2?Math.min(units.length,4):gradeGap>=2?Math.min(units.length,1):Math.min(units.length,2);
      if(topic==='cards'||topic==='both'){
        const selected=prefShuffle(units).slice(0,max);result.cards=selected.map(i=>{const c=prefCardForInstance(i.id)||prefTemplate(i.templateId);return {name:c?.name||'不明',rank:prefRankStars(c),mainAttr:c?.mainAttr||'',templateId:i.templateId,observedInstanceId:i.id};});
      }
      if(topic==='behavior'||topic==='both')result.summary=`行動方針：${target.personalityLabel}。${target.personalityFocus}。ランク${target.tier}、調査時点の資金 ${prefFormatMoney(target.funds)}。`;
      if(topic==='cards')result.summary=`調査時点で${result.cards.length}枚のキャラカードを確認しました。`;
      if(topic==='both')result.summary=`行動方針とキャラカードの一部を確認しました。`;
    }
    if(id===PREF_PLAYER_ID){campaignState.investigations.push(result);investigator.yearStats.investigations=(investigator.yearStats.investigations||0)+1;prefLog(success?`調査成功：${target.prefecture}の情報を入手しました。`:`調査失敗：${target.prefecture}の情報を得られませんでした。`,success?'success':'warning');}
    else if(Math.random()<0.25){investigator.yearStats.investigations=(investigator.yearStats.investigations||0)+1;}
  }
}
async function prefCompleteTurn(tx) {
  if(!campaignState||campaignState.turnProcessing!==tx)return;
  if(tx.stage!=='settling'){tx.stage='settling';await prefSave();}
  // Any market listing that reaches its sixth week expires before the next week's command phase.
  const nextAbs=prefAbsTurn()+1;
  prefMarketListings().filter(i=>i.marketExpiresAbs!=null&&nextAbs>=i.marketExpiresAbs).forEach(inst=>{
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    if(inst.kind==='unit')prefSendToGacha(inst,'market-expired');else inst.zone='consumed';
    prefLog(`市場の「${card?.name||'カード'}」は購入期限切れになりました。`,'info');
  });
  prefCalculateRankings();
  campaignState.turnProcessing=null;
  prefLog(`第${campaignState.week}週の行動が完了しました。ランキングを更新しました。`,'info');
  if(prefPlayerRegion().funds<0){campaignState.gameOver=true;campaignState.gameOverReason='対戦による資金移動で所持資金がマイナスになりました。';await prefSave();prefRenderAll();prefShowGameOverModal();return;}
  if(campaignState.week>=52){
    const snapshot=prefCurrentRegionRankList().map(r=>({id:r.id,prefecture:r.prefecture,repName:r.repName,rankPosition:r.rankPosition,rankEndPosition:r.rankEndPosition,rankTieCount:r.rankTieCount,tier:r.tier,funds:r.funds,assetMetric:r.yearStats.assetMetric||0,winRate:prefYearWinRate(r),wins:r.yearStats.wins||0,losses:r.yearStats.losses||0,draws:r.yearStats.draws||0}));
    campaignState.yearReview={year:campaignState.year,rows:snapshot,nextFunding:Object.fromEntries(snapshot.map(r=>[r.id,PREF_FUNDING_BY_TIER[r.tier]||PREF_FUNDING_BY_TIER.E]))};
    campaignState.yearHistory.push(campaignState.yearReview);await prefSave();prefRenderAll();prefShowYearReview();return;
  }
  campaignState.week++;campaignState.absoluteTurn++;
  campaignState.phase='ready';prefOpenWeek();await prefSave();prefSyncCampaignClones();prefRenderAll();
}
function prefShowYearReview() {
  const review=campaignState?.yearReview;if(!review)return;
  const rows=review.rows||[];const player=rows.find(x=>x.id===PREF_PLAYER_ID);
  const rankingRows=rows.map((r,i)=>`<div class="grid grid-cols-[2.8rem_minmax(0,1fr)_auto] sm:grid-cols-[3.3rem_minmax(0,1fr)_minmax(5.5rem,auto)_3rem] items-center gap-2 border-b border-slate-800/80 px-2 py-2 ${r.id===PREF_PLAYER_ID?'bg-amber-950/30 ring-1 ring-inset ring-amber-500/40':''}"><div class="font-black text-amber-200 text-xs">${r.rankPosition}位${r.rankTieCount>1?'同率':''}</div><div class="min-w-0"><div class="text-xs sm:text-sm font-black text-slate-100 truncate">${prefEsc(r.prefecture)}・${prefEsc(r.repName)}</div><div class="text-[10px] text-slate-500">${r.wins||0}勝 ${r.losses||0}敗 ${r.draws||0}分 · 勝率 ${((r.winRate||0)*100).toFixed(1)}%</div></div><div class="text-right"><div class="text-xs sm:text-sm font-black text-emerald-200">${prefFormatMoney(r.assetMetric||0)}</div><div class="text-[10px] text-slate-500">翌年支援 ${prefFormatMoney(review.nextFunding?.[r.id]||PREF_FUNDING_BY_TIER[r.tier]||PREF_FUNDING_BY_TIER.E)}</div></div><div class="hidden sm:flex justify-end">${prefTierBadge(r.tier)}</div></div>`).join('');
  prefShowModal(`🏆 ${review.year}年度・決算報告`,`<div class="max-h-[78vh] overflow-y-auto pr-1"><div class="rounded-xl bg-slate-900 border border-amber-500/30 p-4"><div class="text-xs text-amber-200 font-black">京都府の年間成績</div><div class="text-3xl font-black text-white mt-1">${prefEsc(String(player?.rankPosition||47))}位${(player?.rankTieCount||1)>1?'タイ':''} / ランク${prefEsc(player?.tier||'E')}</div><div class="grid grid-cols-2 gap-3 mt-3"><div><div class="text-[10px] text-slate-500">年間獲得資産額（収入−対象支出）</div><div class="font-black text-emerald-200">${prefFormatMoney(player?.assetMetric||0)}</div></div><div><div class="text-[10px] text-slate-500">年間勝率</div><div class="font-black text-cyan-200">${((player?.winRate||0)*100).toFixed(1)}%</div><div class="text-[10px] text-slate-500">${player?.wins||0}勝 ${player?.losses||0}敗 ${player?.draws||0}分</div></div></div><div class="border-t border-slate-800 mt-3 pt-3 text-xs text-slate-300">次年度の定期資金提供：${prefFormatMoney(review.nextFunding?.[PREF_PLAYER_ID]||PREF_FUNDING_BY_TIER[player?.tier]||PREF_FUNDING_BY_TIER.E)} × 年4回（第1・14・27・40週）</div></div><div class="flex items-end justify-between gap-2 mt-4 mb-2"><h4 class="font-black text-amber-200">全国47都道府県ランキング</h4><span class="text-[10px] text-slate-500">資産額・年間勝率</span></div><div class="rounded-lg border border-slate-800 overflow-hidden"><div class="grid grid-cols-[2.8rem_minmax(0,1fr)_auto] sm:grid-cols-[3.3rem_minmax(0,1fr)_minmax(5.5rem,auto)_3rem] gap-2 px-2 py-2 bg-slate-900 text-[10px] font-black text-slate-500"><div>順位</div><div>都道府県・代表 / 年間成績</div><div class="text-right">獲得資産 / 翌年支援</div><div class="hidden sm:block text-right">ランク</div></div>${rankingRows}</div><p class="text-[10px] text-slate-500 mt-3">年間成績は次年度にリセットされます。通算成績とカード所有は引き継がれ、年度ごとのランキングは決算履歴に保存されます。</p></div>`,[{label:'次年度を開始',action:'next-year',style:'primary'}]);
}
async function prefNextYear() {
  if(!campaignState?.yearReview)return;
  const review=campaignState.yearReview;
  // Freeze next year's support bracket from the just-finished final ranking.
  Object.values(campaignState.regions).forEach(r=>{r.supportTier=r.tier; r.yearStats=prefNewStats();r.lastCommand=null;r.lastCommandAbs=0;r.nonBattleStreak=0;r.lastBattleAbs=0;});
  campaignState.year++;campaignState.week=1;campaignState.absoluteTurn=(campaignState.year-1)*52+1;campaignState.yearReview=null;campaignState.phase='ready';
  prefOpenWeek();prefLog(`第${campaignState.year}年度が始まりました。前年の最終ランクに応じた資金提供が行われます。`,'success');
  await prefSave();prefCloseModal();prefSyncCampaignClones();prefRenderAll();switchView('prefecture');
}
async function prefTriggerGameOver(reason) {
  if(!campaignState)return;
  campaignState.gameOver=true;campaignState.gameOverReason=reason;await prefSave();prefShowGameOverModal();
}
function prefShowGameOverModal() {
  const p=prefPlayerRegion();prefShowModal('💀 GAME OVER',`<div class="text-center"><div class="text-5xl mb-3">🏯</div><p class="font-black text-rose-200 text-lg">京都府代表はゲームオーバーとなりました。</p><p class="text-sm text-slate-300 mt-3">${prefEsc(campaignState?.gameOverReason||'所持資金がマイナスになりました。')}</p><div class="rounded-lg bg-slate-900 border border-slate-800 p-3 mt-4 text-sm"><div class="flex justify-between"><span class="text-slate-400">最終所持資金</span><b class="text-rose-200">${prefFormatMoney(p?.funds||0)}</b></div><div class="flex justify-between mt-1"><span class="text-slate-400">今年度の順位</span><b class="text-white">${prefEsc(prefRankLabel(p))}</b></div></div><p class="text-xs text-slate-500 mt-3">ゲーム進行データをリセットして最初から開始します。作成済みカードは消えません。</p></div>`,[{label:'初めからやり直す',action:'restart-game',style:'danger'}]);
}
async function prefRestartGame() {
  campaignState=null;campaignBattleOverride=null;campaignBattlePending=null;campaignHeadlessBattle=false;window.__campaignHeadlessBattle=false;
  allCards=allCards.filter(c=>!c.campaignInstance);
  await deleteFromStore('settings',PREF_STATE_KEY);prefCloseModal();prefRenderAll();switchView('prefecture');
}

async function prefPullAndAcquireMagic(regionId, templateId) {
  const inst=prefCreateInstance(templateId,'pending',null,{source:'gacha'});if(!inst)return null;
  return prefAcquireInstance(regionId,inst.id,{reason:'gacha'});
}
function prefShowPurchasePanel() {}

async function prefHandleClick(action,id,button) {
  if(action==='close-modal'){prefCloseModal();if(campaignState?.turnProcessing?.stage==='player-preview'){document.getElementById('pref-turn-progress')?.classList.add('hidden');prefEnsurePreviewResumeButton();}return;}
  if(action==='battle-preview-back'){prefCloseModal();prefEnsurePreviewResumeButton();document.getElementById('pref-turn-progress')?.classList.add('hidden');return;}
  if(action==='battle-preview-continue'){prefCloseModal();if(campaignState?.turnProcessing?.stage==='player-preview'){prefEnsurePreviewResumeButton();if(document.querySelector('.view-section:not(.hidden)')?.id!=='view-prefecture')switchView('prefecture');prefShowBattleSelection(true);}return;}
  if(action==='recover-pending-battle'){
    const tx=campaignState?.turnProcessing;
    if(prefRecoverPendingBattlePreview(tx,false)){
      await prefSave();prefRenderAll();switchView('prefecture');prefShowBattleSelection(true);
    } else {
      prefEnsurePreviewResumeButton();prefShowModal('対戦準備を復旧できません','未決着のプレイヤー対戦を特定できませんでした。保存データは消去していません。「最初からやり直す」から新しいキャンペーンを開始することもできます。',[{label:'閉じる',action:'close-modal'}]);
    }
    return;
  }
  if(action==='resume-turn-processing'){
    const tx=campaignState?.turnProcessing;
    if(tx?.stage==='matching'&&prefRecoverPendingBattlePreview(tx,false)){
      await prefSave();prefRenderAll();switchView('prefecture');prefShowBattleSelection(true);return;
    }
    await prefContinueTurn();prefEnsurePreviewResumeButton();return;
  }
  if(action==='toggle-autobuy'){const p=prefPlayerRegion();p.autoBuyMagicTemplateIds=Array.isArray(p.autoBuyMagicTemplateIds)?p.autoBuyMagicTemplateIds:[];const key=String(id||button?.dataset?.id||'');const enabled=button?.checked??!p.autoBuyMagicTemplateIds.includes(key);p.autoBuyMagicTemplateIds=enabled?[...new Set([...p.autoBuyMagicTemplateIds,key])]:p.autoBuyMagicTemplateIds.filter(x=>x!==key);await prefSave();prefRenderHolder();return;}
  if(action==='gacha-result-close'){prefCloseModal();if(campaignState?.pendingAcquisition)prefShowReplaceModal();return;}
  if(campaignState?.turnProcessing && ['list-card','confirm-list-card','withdraw-listing','buy-card','confirm-buy-card','pull-gacha','replace-held','confirm-battle','confirm-investigation'].includes(action)){
    prefShowModal('ターン処理中','47都道府県のAI対戦と決算処理を行っています。二重処理を防ぐため、完了するまでカードの購入・出品・ガチャ利用・コマンド変更はできません。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;
  }
  if(action==='new-game'){
    if(campaignState&&!campaignState.gameOver){prefShowModal('最初からやり直す', '現在のゲーム進行データを消去して、新しいゲームを開始しますか？<p class="text-xs text-slate-400 mt-2">所持資金・所有カード・市場・ランキング・戦績・調査結果はリセットされます。作成済みカード、プレイヤー名、ライバルプロフィール設定は削除されません。</p>',[{label:'キャンセル',action:'close-modal'},{label:'初期化して開始',action:'confirm-new-game',style:'danger'}]);}
    else prefCreateNewCampaign();
    if(campaignState){await prefSave();prefSyncCampaignClones();prefRenderAll();switchView('prefecture');}
    return;
  }
  if(action==='confirm-new-game'){await prefRestartGame();prefCreateNewCampaign();return;}
  if(action==='restart-game'){await prefRestartGame();prefCreateNewCampaign();return;}
  if(action==='go-holder'){switchView('pref-holder');return;}
  if(action==='go-market'){switchView('pref-market');return;}
  if(action==='go-gacha'){switchView('pref-gacha');return;}
  if(action==='go-ranking'){switchView('pref-ranking');return;}
  if(action==='go-investigations'){switchView('pref-investigations');return;}
  if(action==='holder-tab-unit'){prefCurrentHolderTab='unit';prefRenderHolder();return;}
  if(action==='holder-tab-magic'){prefCurrentHolderTab='magic';prefRenderHolder();return;}
  if(action==='holder-tab-autobuy'){prefCurrentHolderTab='autobuy';prefRenderHolder();return;}
  if(action==='market-tab-unit'){prefCurrentMarketTab='unit';prefMarketOwnOnly=false;prefRenderMarket();return;}
  if(action==='market-tab-magic'){prefCurrentMarketTab='magic';prefMarketOwnOnly=false;prefRenderMarket();return;}
  if(action==='market-tab-own'){prefMarketOwnOnly=true;prefRenderMarket();return;}
  if(action==='choose-battle'){
    if(button?.disabled||campaignState?.turnProcessing)return;
    if(prefOwnedUnits(PREF_PLAYER_ID).length<3){await prefTriggerGameOver('キャラカードが3枚未満の状態で対戦コマンドを選択しました。');return;}
    const loadout=prefDefaultLoadout(PREF_PLAYER_ID);
    await prefBeginTurn({type:'battle',loadout:{active:[...loadout.active],reserve:[...loadout.reserve]}});return;
  }
  if(action==='choose-investigation'){if((prefPlayerRegion()?.nonBattleStreak||0)>=3)return;prefShowInvestigationSelection();return;}
  if(action==='cancel-command'){document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');if(campaignState?.turnProcessing?.stage==='player-preview'){document.getElementById('pref-command-panel')?.classList.add('hidden');document.getElementById('pref-turn-progress')?.classList.add('hidden');prefEnsurePreviewResumeButton();}return;}
  if(action==='toggle-loadout'){prefToggleLoadout(id);return;}
  if(action==='auto-loadout'){prefAutoLoadout();return;}
  if(action==='confirm-final-loadout'){
    const tx=campaignState?.turnProcessing;const draft=campaignState?.draftLoadout;const units=prefOwnedUnits(PREF_PLAYER_ID);
    if(tx?.stage!=='player-preview'){prefShowModal('対戦準備を確認','対戦相手の決定状態を確認できません。画面を更新して再確認してください。',[{label:'閉じる',action:'close-modal'}]);return;}
    const active=(draft?.active||[]).filter(id=>units.some(x=>x.id===id)).slice(0,3);
    const reserve=(draft?.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id)).slice(0,2);
    if(active.length!==3){prefShowModal('出撃メンバーを確認','出撃するキャラカードを3体選択してください。',[{label:'編成に戻る',action:'close-modal',style:'primary'}]);return;}
    const loadout={active,reserve};tx.actions[PREF_PLAYER_ID].loadout=JSON.parse(JSON.stringify(loadout));
    prefPlayerRegion().lastLoadout=JSON.parse(JSON.stringify(loadout));campaignState.lastLoadout=JSON.parse(JSON.stringify(loadout));
    tx.stage='battles';tx.pairIndex=Math.max(0,tx.pairIndex||0);campaignState.draftLoadout=null;
    document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-turn-progress')?.classList.remove('hidden');
    await prefSave();prefEnsurePreviewResumeButton();prefRenderDashboard();await prefContinueTurn();return;
  }
  if(action==='confirm-battle'){
    const draft=campaignState?.draftLoadout;if(!draft||draft.active.length!==3){prefShowModal('出撃メンバーを確認','出撃するキャラカードを3体選択してください。',[{label:'戻る',action:'close-modal',style:'primary'}]);return;}
    const chosen=[...draft.active,...draft.reserve].slice(0,5);prefPlayerRegion().lastLoadout={active:[...draft.active],reserve:[...draft.reserve]};campaignState.lastLoadout=JSON.parse(JSON.stringify(prefPlayerRegion().lastLoadout));
    document.getElementById('pref-battle-selection')?.classList.add('hidden');await prefBeginTurn({type:'battle',loadout:{active:[...draft.active],reserve:[...draft.reserve]}});return;
  }
  if(action==='confirm-investigation'){
    const target=document.getElementById('pref-invest-target')?.value;const topic=document.getElementById('pref-invest-topic')?.value||'cards';if(!target)return;
    document.getElementById('pref-investigation-selection')?.classList.add('hidden');await prefBeginTurn({type:'investigate',target,topic});return;
  }
  if(action==='details'){prefOpenCardDetail(id);return;}
  if(action==='list-card'){prefShowReplaceListingConfirm(id);return;}
  if(action==='confirm-list-card'){prefListPlayerCard(id);prefCloseModal();return;}
  if(action==='withdraw-listing'){prefWithdrawListing(id);return;}
  if(action==='buy-card'){prefConfirmPurchaseDialog(id);return;}
  if(action==='confirm-buy-card'){await prefBuyCard(id);return;}
  if(action==='pull-gacha'){await prefPullGacha(id);return;}
  if(action==='replace-held'){prefCommitReplace(id);return;}
  if(action==='next-year'){await prefNextYear();return;}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-pref-action]');if(!button)return;
  const action=button.dataset.prefAction,id=button.dataset.id;
  if(button.disabled)return;
  prefHandleClick(action,id,button).catch(err=>{console.error('[Prefecture] action failed',err);prefShowModal('処理に失敗しました',`操作を完了できませんでした。<pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.message||String(err))}</pre>`,[{label:'閉じる',action:'close-modal'}]);});
});

// The original card detail editor is retained. Campaign instances are read-only: editing the card library remains separate from the game state.
const prefOriginalOpenCardDetail = openCardDetail;
openCardDetail = function(cardId, options={}) {
  const inst=campaignState?.instances?.[String(cardId)];
  if(inst) { prefOriginalOpenCardDetail(cardId,{readOnly:true}); return; }
  prefOriginalOpenCardDetail(cardId,options);
};

// Battle engine integration: player-vs-rival battles use the full interactive engine; all other matches run it headlessly.
const prefOriginalShowActionPopup = showActionPopup;
showActionPopup = function(...args) { if(window.__campaignHeadlessBattle || campaignHeadlessBattle) return Promise.resolve(); return prefOriginalShowActionPopup(...args); };
const prefOriginalLogBattle = logBattle;
logBattle = function(message) { if(window.__campaignHeadlessBattle || campaignHeadlessBattle) return; return prefOriginalLogBattle(message); };
const prefOriginalShowBattleResultModal = showBattleResultModal;
showBattleResultModal = function(winner) {
  if(!battleState?.campaignMode) return prefOriginalShowBattleResultModal(winner);
  if(window.__campaignHeadlessBattle||campaignHeadlessBattle)return;
  const modal=document.getElementById('battle-result-modal');const title=document.getElementById('battle-result-title');const message=document.getElementById('battle-result-message');
  const reward=document.getElementById('battle-result-reward');if(reward){reward.classList.add('hidden');reward.innerHTML='';}
  title.innerText=winner==='player'?'🎉 京都府の勝利！':winner==='enemy'?'💀 京都府の敗北':'🤝 引き分け';
  title.className=`text-4xl sm:text-6xl font-black leading-tight ${winner==='player'?'text-emerald-300':winner==='enemy'?'text-rose-300':'text-amber-300'}`;
  message.innerText='対戦結果を記録しました。敗北時は出場したキャラカードからランダムに2枚が破壊され、使用したマジックカードは消費されます。';
  const rematch=document.getElementById('battle-result-rematch'),back=document.getElementById('battle-result-back');
  if(rematch){rematch.classList.add('hidden');rematch.onclick=null;}
  if(back){back.classList.remove('hidden');back.innerText='次へ：残りの代表を処理';back.onclick=()=>{modal.classList.add('hidden');battleExecutionRunning=false;switchView('prefecture');prefContinueTurn();};}
  modal.classList.remove('hidden');
};

// Restore pending player battles on load. The unresolved pair has not posted money/card changes yet, so restarting the duel is safe.
async function prefResumePendingTurn() {
  if(!campaignState)return;
  if(campaignState.gameOver){prefShowGameOverModal();return;}
  if(campaignState.yearReview){prefShowYearReview();return;}
  if(campaignState.pendingAcquisition){prefSyncCampaignClones();prefShowReplaceModal();}
  if(campaignState.turnProcessing){prefRenderDashboard();await prefContinueTurn();return;}
  prefRenderAll();
}
window.addEventListener('pagehide',()=>{
  // Every pair and phase is saved before/after effects. This best-effort save helps preserve the latest visible transaction status.
  if(campaignState) { try { saveToStore('settings',{key:PREF_STATE_KEY,value:campaignState}); } catch(_){} }
});
window.addEventListener('DOMContentLoaded',async()=>{
  try {
    await cardBattleAppReadyPromise;
    if(window.__cardBattleAppReady){
      prefSyncCampaignClones();prefRenderAll();
      await prefResumePendingTurn();
      if(campaignState?.pendingAcquisition)prefShowReplaceModal();
    }
  } catch(err){console.error('[Prefecture] init failed',err);}
});
