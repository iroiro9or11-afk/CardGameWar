/* 都道府県カード戦争 v1.0.70 —全国AI経済・自動対戦高速化 */
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
// Card profiles are pure analysis of card definitions. Cache them between AI candidate comparisons;
// snapshots invalidate the entry when an editor replaces or updates relevant card fields.
const PREF_CARD_PROFILE_CACHE = new WeakMap();

const PREF_STATE_KEY = 'prefecture_campaign_state_v1';
const PREF_PLAYER_ID = '京都府';
const PREF_UNIT_LIMIT = 10;
const PREF_MAGIC_LIMIT = 30;
const PREF_RIVAL_UNIT_LIMIT = 5;
const PREF_PLAYER_UNIT_LIMIT = 10;
const PREF_PLAYER_RANK5_LIMIT = 4;
const PREF_RIVAL_RANK5_LIMIT = 2;
const PREF_MAX_BATTLE_UNITS = 5;
const PREF_BATTLE_ACTIVE = 4;
// Game-mode battle roster limit (active 4 + reserve up to 1). Holder limits are separate.
const PREF_BATTLE_RANK5_LIMIT = 2;
const PREF_CARD_LIFETIME = 52;
const PREF_MARKET_LIFETIME = 5;
const PREF_FUNDING_WEEKS = [1, 14, 27, 40];
const PREF_FUNDING_BY_TIER = { S: 10000000000, A: 5000000000, B: 1000000000, C: 500000000, D: 300000000, E: 100000000 };
const PREF_GACHA_VALUE_LIMITS = {4:100000000,5:5000000000};
const PREF_GACHA = {
  A: { label: 'Aランクガチャ', price: 100000000, odds: [{kind:'unit',rank:5,band:'upper',weight:5},{kind:'unit',rank:5,band:'lower',weight:15},{kind:'unit',rank:4,band:'any',weight:60},{kind:'unit',rank:3,band:'any',weight:10},{kind:'magic',weight:10}] },
  B: { label: 'Bランクガチャ', price: 10000000, odds: [{kind:'unit',rank:5,band:'lower',weight:1},{kind:'unit',rank:4,band:'upper',weight:10},{kind:'unit',rank:4,band:'lower',weight:40},{kind:'unit',rank:3,band:'any',weight:29},{kind:'magic',weight:20}] },
  C: { label: 'Cランクガチャ', price: 1000000, odds: [{kind:'unit',rank:4,band:'lower',weight:1},{kind:'unit',rank:3,band:'any',weight:30},{kind:'magic',weight:69}] }
};
const PREF_REGIONS = [
 '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
 '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県',
 '奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県',
 '熊本県','大分県','宮崎県','鹿児島県','沖縄県'
];
const PREF_RANK_COUNTS = [{tier:'S',count:1},{tier:'A',count:3},{tier:'B',count:5},{tier:'C',count:10},{tier:'D',count:10},{tier:'E',count:18}];
const PREF_RANK_UNIT_RECIPE = { S:['5u','5u','4u','4u','4u'], A:['5u','5l','4u','4u','4u'], B:['5l','5l','4u','4u','4u'], C:['4u','4u','4l','4l','4l'], D:['4l','4l','4l','4l','4l'], E:[3,3,3,3,3], PLAYER:[3,3,3,3,3] };
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

// AI設定は性格・戦術の好み・賢さを分離して保存する。ランクは通常ライバルの賢さに影響しない。
const PREF_AI_STRATEGIES = [
  {id:'combo',label:'コンボ・連携重視'}, {id:'rush',label:'速攻・高火力'},
  {id:'heavy',label:'高AP消費の大技主体'}, {id:'basic',label:'通常攻撃主体'},
  {id:'ap_efficiency',label:'AP供給・AP効率重視'}, {id:'sustain',label:'回復・シールド主体'},
  {id:'status',label:'状態異常・弱体化主体'}, {id:'buff',label:'バフ・強化主体'},
  {id:'protect',label:'挑発・味方保護'}, {id:'extra',label:'追加効果コンボ'},
  {id:'passive',label:'パッシブ連携'}, {id:'attribute',label:'属性統一コンボ'},
  {id:'adaptive',label:'相手に応じた対応型'}, {id:'counter',label:'カウンター・耐久戦'}
];
const PREF_AI_EFFECT_PREFERENCES = [
  {id:'ap_supply',label:'AP供給・AP効率'}, {id:'shield_defense',label:'シールド・防御'},
  {id:'attribute_support',label:'属性サポート'}, {id:'attack_speed_buff',label:'攻撃力・行動値強化'},
  {id:'healing',label:'回復・最大HP強化'}, {id:'status_debuff',label:'状態異常・弱体化'},
  {id:'status_condition',label:'状態異常を条件にする効果'}, {id:'extra_effect',label:'追加効果・発動確率'},
  {id:'passive_chain',label:'パッシブ同士の連携'}, {id:'target_control',label:'対象・条件を活用する効果'},
  {id:'high_rank',label:'高ランク・高基礎性能'}, {id:'low_cost',label:'低コストで効率のよいカード'}
];
const PREF_AI_PRESETS = {
  balanced:{label:'バランス型',tacticalIQ:55,cardIQ:55,primaryStrategy:'adaptive',secondaryStrategies:['combo','ap_efficiency','sustain']},
  combo:{label:'コンボ構築型',tacticalIQ:65,cardIQ:85,primaryStrategy:'combo',secondaryStrategies:['ap_efficiency','extra','passive']},
  rush:{label:'速攻・火力型',tacticalIQ:60,cardIQ:65,primaryStrategy:'rush',secondaryStrategies:['heavy','buff','ap_efficiency']},
  defense:{label:'耐久・保護型',tacticalIQ:65,cardIQ:65,primaryStrategy:'sustain',secondaryStrategies:['protect','counter','ap_efficiency']},
  status:{label:'状態異常型',tacticalIQ:65,cardIQ:75,primaryStrategy:'status',secondaryStrategies:['extra','passive','adaptive']},
  attribute:{label:'属性統一型',tacticalIQ:60,cardIQ:75,primaryStrategy:'attribute',secondaryStrategies:['combo','buff','protect']},
  basic:{label:'単体性能重視型',tacticalIQ:45,cardIQ:40,primaryStrategy:'basic',secondaryStrategies:['rush','sustain','adaptive']}
};
const PREF_AI_LEGACY_IQ = {novice:20,normal:45,expert:75,master:95};
const PREF_AI_TIER_IQ = {S:96,A:82,B:68,C:53,D:37,E:20};
function prefDefaultAIProfileForTier(tier='C', personality='careful') {
  const iq=PREF_AI_TIER_IQ[tier]||50;
  const byPersonality={aggressive:'rush',careful:'sustain',scout:'adaptive',collector:'combo',trickster:'combo'};
  const primary=byPersonality[personality]||'adaptive';
  const secondary=primary==='rush'?['heavy','buff','ap_efficiency']:primary==='sustain'?['protect','counter','ap_efficiency']:primary==='combo'?['passive','extra','ap_efficiency']:['combo','sustain','adaptive'];
  return {version:1,tacticalIQ:iq,cardIQ:Math.max(10,Math.min(100,iq-4)),primaryStrategy:primary,secondaryStrategies:secondary,
    mainAttrPriority:[],subAttrPriority:[],effectPriority:['ap_supply','shield_defense','passive_chain','extra_effect','healing'],preset:'balanced'};
}
function prefNormalizeAIProfile(raw={}, fallback={}) {
  const oldIQ=PREF_AI_LEGACY_IQ[String(fallback.intelligence||'').toLowerCase()];
  const base=fallback.tier?prefDefaultAIProfileForTier(fallback.tier,fallback.personality):prefDefaultAIProfileForTier('C',fallback.personality);
  const src=raw&&typeof raw==='object'?raw:{};
  const number=(v,d)=>Math.max(0,Math.min(100,Number.isFinite(Number(v))?Math.round(Number(v)):d));
  const strategyIds=new Set(PREF_AI_STRATEGIES.map(x=>x.id));
  const orderList=(v,max)=>Array.isArray(v)?[...new Set(v.map(String).filter(x=>x.length>0))].slice(0,max):[];
  const primaryStrategy=strategyIds.has(src.primaryStrategy)?src.primaryStrategy:base.primaryStrategy;
  return {version:1,
    tacticalIQ:number(src.tacticalIQ??fallback.tacticalIQ, oldIQ??base.tacticalIQ),
    cardIQ:number(src.cardIQ??fallback.cardIQ, oldIQ??base.cardIQ),
    primaryStrategy,
    secondaryStrategies:orderList(src.secondaryStrategies,10).filter(x=>strategyIds.has(x)&&x!==primaryStrategy).slice(0,3),
    mainAttrPriority:orderList(src.mainAttrPriority,20),subAttrPriority:orderList(src.subAttrPriority,30),
    effectPriority:orderList(src.effectPriority,20).filter(x=>PREF_AI_EFFECT_PREFERENCES.some(p=>p.id===x)),
    preset:String(src.preset||'custom')};
}
const PREF_AI_PROFILE_MEMO = new WeakMap();
function prefAIProfileForRegion(region) {
  if(!region)return prefNormalizeAIProfile({});
  const memo=PREF_AI_PROFILE_MEMO.get(region);
  if(memo&&memo.profile===region.aiProfile&&memo.tier===region.tier&&memo.personality===region.personality&&memo.legacy===region.aiIntelligence)return memo.profile;
  const normalized=prefNormalizeAIProfile(region.aiProfile,{tier:region.tier,personality:region.personality,intelligence:region.aiIntelligence});
  region.aiProfile=normalized;
  PREF_AI_PROFILE_MEMO.set(region,{profile:normalized,tier:region.tier,personality:region.personality,legacy:region.aiIntelligence});
  return normalized;
}
function prefAIProfileFromRival(rival,tier,personality) {
  if(rival?.aiProfile) return prefNormalizeAIProfile(rival.aiProfile,{tier,personality,intelligence:rival.intelligence});
  // Existing profile migration: retain its old intelligence level as a numeric starting point.
  if(rival?.intelligence && PREF_AI_LEGACY_IQ[rival.intelligence]!=null) return prefNormalizeAIProfile({}, {tier,personality,intelligence:rival.intelligence});
  return prefDefaultAIProfileForTier(tier,personality);
}
function prefEnsureCampaignAIConfig() {
  if(!campaignState?.regions) return;
  for(const region of Object.values(campaignState.regions)) {
    if(region.isPlayer) continue;
    if(!region.aiProfile) {
      const profile=(Array.isArray(allRivals)?allRivals:[]).find(r=>String(r.id)===String(region.profileRivalId||''));
      region.aiProfile=prefAIProfileFromRival(profile,region.tier,region.personality);
    } else region.aiProfile=prefNormalizeAIProfile(region.aiProfile,{tier:region.tier,personality:region.personality,intelligence:region.aiIntelligence});
    region.aiTacticalIQ=region.aiProfile.tacticalIQ;region.aiCardIQ=region.aiProfile.cardIQ;
    region.aiMemory=region.aiMemory&&typeof region.aiMemory==='object'?region.aiMemory:{opponents:{},decisions:[]};
    region.aiMemory.opponents=region.aiMemory.opponents&&typeof region.aiMemory.opponents==='object'?region.aiMemory.opponents:{};
    region.aiMemory.decisions=Array.isArray(region.aiMemory.decisions)?region.aiMemory.decisions:[];
  }
}
function prefRecordAIThought(region,kind,title,reasons=[],details={}) {
  if(!region||region.isPlayer||!campaignState)return;
  region.aiMemory=region.aiMemory&&typeof region.aiMemory==='object'?region.aiMemory:{opponents:{},decisions:[]};
  region.aiMemory.decisions=Array.isArray(region.aiMemory.decisions)?region.aiMemory.decisions:[];
  region.aiMemory.decisions.unshift({abs:prefAbsTurn(),year:campaignState.year,week:campaignState.week,kind:String(kind||'判断'),title:String(title||'AI判断'),
    reasons:(Array.isArray(reasons)?reasons:[]).map(String).slice(0,8),details:details&&typeof details==='object'?JSON.parse(JSON.stringify(details)): {}});
  region.aiMemory.decisions=region.aiMemory.decisions.slice(0,40);
}
function prefRankedPreferenceBonus(list,value,unit=1) {
  const idx=(list||[]).findIndex(x=>String(x)===String(value));
  return idx<0?0:Math.max(0,8-idx)*unit;
}
function prefCardEffectNodes(card) {
  const out=[];const seen=new Set();
  const walk=(node,depth=0)=>{
    if(!node||typeof node!=='object'||depth>7||seen.has(node))return;seen.add(node);
    if(typeof node.type==='string')out.push(node);
    if(Array.isArray(node)){node.forEach(x=>walk(x,depth+1));return;}
    for(const [k,v] of Object.entries(node)) if(['skills','effect','mainEffect','subEffect','passive','passives'].includes(k)||typeof v==='object') walk(v,depth+1);
  };
  walk(card?.skills||[]);walk(card?.effect||null);walk(card?.effects||null);
  return out;
}
function prefApThresholdPassiveEffectScore(effect,targetType='self') {
  if(!effect||effect.type==='none')return 0;
  const type=String(effect.type||''),val=Math.abs(Number(effect.val)||0);let score=0;
  if(type==='dmg_atk_ratio')score=3.0+Math.min(3,val/60);
  else if(type==='dmg_fixed'||type==='dmg_fixed_pierce')score=1.5+Math.min(3,val/700);
  else if(type==='mod_atk_ratio')score=2.5+Math.min(3,val/30);
  else if(type==='mod_atk_val'||type==='mod_speed')score=2+Math.min(3,val/35);
  else if(type==='shield')score=2+Math.min(3,val/700);
  else if(type==='heal_fixed')score=1.5+Math.min(2.5,val/900);
  else if(type==='heal_max_hp_ratio')score=1.8+Math.min(2.5,val/30);
  else if(type==='mod_ap')score=2+Math.min(3,val/10);
  else if(type==='damage_taken_ratio'||type==='damage_cut_ratio')score=2+Math.min(3,val/25);
  else if(type==='status_apply')score=['freeze','paralysis','pressure'].includes(String(effect.status||''))?4.5:['taunt','provoke'].includes(String(effect.status||''))?3:2;
  else if(type==='skill_block')score=4;
  else if(type==='heal_block')score=2.5;
  else if(['clear_buffs','clear_debuffs','clear_statuses','clear_random_buffs','clear_random_debuffs','status_remove'].includes(type))score=2;
  else if(type==='mod_max_hp_val')score=val>0?2.6+Math.min(2.4,val/500):2;
  else if(type==='damage_dealt_ratio')score=2.2+Math.min(3,val/15);
  else if(type==='dmg_max_hp_ratio')score=3+Math.min(3,val/12);
  else if(type==='atk_ratio'||type==='atk_val')score=2+Math.min(3,val/35);
  else if(type==='sub_chance_mod')score=2+Math.min(3,val/20);
  if(['all_enemy','all_ally','all_field'].includes(String(targetType||'')))score*=1.45;
  return Math.min(8,score);
}
function prefCardApThresholdPassiveValue(card) {
  const skills=Array.isArray(card?.skills)?card.skills:[];
  if(!skills.some(s=>s?.type==='active'&&Number(s.cost||0)>0))return 0;
  let total=0;
  for(const sk of skills){
    if(sk?.type!=='passive'||sk?.selfCond?.type!=='ap_val_gte')continue;
    const threshold=Number(sk.selfCond.val)||0;if(threshold<40||threshold>100)continue;
    const chance=Math.max(0,Math.min(100,Number(sk.chance??100)))/100;
    let value=prefApThresholdPassiveEffectScore(sk.mainEffect,sk.targetType);
    if(sk.hasSubEffect&&sk.subEffect)value+=prefApThresholdPassiveEffectScore(sk.subEffect,sk.subEffect.targetType||'same_main_target')*0.62;
    if(value>=3)total+=value*chance*(0.7+Math.min(0.3,threshold/250));
  }
  return Math.min(10,total);
}
function prefCardProfile(card) {
  if(!card)return {tags:new Set(),mainAttr:'',subAttrs:[],supportsAttrs:[],activeCosts:[],maxCost:0,skillCount:0,passiveCount:0,atk:0,hp:0,rank:1,role:'',apThresholdPassiveValue:0,onFieldPassiveValue:0,deployPassiveValue:0};
  const cached=PREF_CARD_PROFILE_CACHE.get(card);
  const sig={cardType:card.cardType,rank:card.rank,role:card.role,mainAttr:card.mainAttr,subAttrs:card.subAttrs,stats:card.stats,skills:card.skills,effect:card.effect,effects:card.effects,atk:card.stats?.atk,hp:card.stats?.hp};
  if(cached&&cached.cardType===sig.cardType&&cached.rank===sig.rank&&cached.role===sig.role&&cached.mainAttr===sig.mainAttr&&cached.subAttrs===sig.subAttrs&&cached.stats===sig.stats&&cached.skills===sig.skills&&cached.effect===sig.effect&&cached.effects===sig.effects&&cached.atk===sig.atk&&cached.hp===sig.hp)return cached.value;
  const tags=new Set(),costs=[],supportsAttrs=new Set();const nodes=prefCardEffectNodes(card);const skills=Array.isArray(card.skills)?card.skills:[];
  let onFieldPassiveValue=0,deployPassiveValue=0;
  const addAttr=value=>{if(typeof value==='string'&&value.trim()&&!['none','any','all','null','undefined'].includes(value.trim().toLowerCase()))supportsAttrs.add(value.trim());};
  const tagNode=(n)=>{
    const t=String(n?.type||'');const val=Number(n?.val??n?.value??0);
    if(t==='mod_ap'&&val>0)tags.add('ap_supply');
    if(t==='mod_ap'&&val<0)tags.add('ap_disrupt');
    if(t==='shield'||t==='damage_cut_ratio'||(t==='damage_taken_ratio'&&val<0))tags.add('shield_defense');
    if(t.startsWith('heal_')||(t==='mod_max_hp_val'&&val>0))tags.add('healing');
    if(t.startsWith('dmg_')||t==='atk_ratio'||t==='atk_val')tags.add('damage');
    if(t==='dmg_max_hp_ratio')tags.add('hp_scaling_damage');
    if(t==='damage_dealt_ratio'&&val>0)tags.add('damage_amp');
    if(t==='damage_dealt_ratio'&&val<0)tags.add('status_debuff');
    if(['mod_atk_ratio','mod_atk_val','atk_ratio','atk_val','mod_speed'].includes(t))tags.add('attack_speed_buff');
    if(['status_apply','status_remove','clear_statuses','skill_block','heal_block','clear_buffs','clear_debuffs','clear_random_buffs','clear_random_debuffs'].includes(t)||(t==='damage_taken_ratio'&&val>0))tags.add('status_debuff');
    if(t==='sub_chance_mod'||n?.hasSubEffect||n?.subEffect)tags.add('extra_effect');
    const conditions=[n?.targetCond,n?.selfCond,n?.subEffect?.targetCond,n?.subEffect?.selfCond].filter(Boolean);
    if(conditions.some(c=>['status_is','any_status','self_status','self_any_status','ally_has_status','enemy_has_status','ally_has_any_status','enemy_has_any_status'].includes(String(c.type||''))))tags.add('status_condition');
    if(conditions.some(c=>['attr_is','attr_not','ally_attr','enemy_attr','any_ally_attr','any_enemy_attr','all_ally_attr','all_enemy_attr'].includes(String(c.type||''))))tags.add('attribute_support');
    if(n?.targetAttr||n?.targetMainAttr||n?.mainAttr||n?.attribute||n?.attr){tags.add('attribute_support');addAttr(n.targetAttr);addAttr(n.targetMainAttr);addAttr(n.mainAttr);addAttr(n.attribute);addAttr(n.attr);}
    conditions.forEach(c=>{if(['attr_is','attr_not'].includes(String(c.type||'')))addAttr(c.attr);});
    if((n?.targetCond&&n.targetCond.type&&n.targetCond.type!=='none')||(n?.selfCond&&n.selfCond.type&&n.selfCond.type!=='none'))tags.add('target_control');
    if(t==='mod_max_hp_val'&&val<0)tags.add('status_debuff');
  };
  nodes.forEach(tagNode);
  // Classify tactical properties from the actual skill timing, targets and effects.
  // Merely having ATK stats does not make a defender an attacker; role and kit are separate.
  let selfTaunt=false,selfMitigation=false,counterAttack=false,debuffCleanser=false,permanentSelfBuff=false;
  for(const skill of skills){
    if(skill?.type==='passive'){
      const timing=String(skill.timing||'');
      const chance=Math.max(0,Math.min(100,Number(skill.chance??100)))/100;
      let effectValue=prefApThresholdPassiveEffectScore(skill.mainEffect,skill.targetType);
      if(skill.hasSubEffect&&skill.subEffect)effectValue+=prefApThresholdPassiveEffectScore(skill.subEffect,skill.subEffect.targetType||'same_main_target')*0.62;
      effectValue=Math.min(10,effectValue)*chance;
      // Passive value depends on how often it can influence the field, not merely on its count.
      if(timing==='turn_start')onFieldPassiveValue+=effectValue*0.72;
      else if(timing==='turn_end')onFieldPassiveValue+=effectValue*0.58;
      else if(['before_action','after_action'].includes(timing))onFieldPassiveValue+=effectValue*0.42;
      else if(timing==='battle_start')onFieldPassiveValue+=effectValue*0.48;
      else if(['damage_taken','hp_decrease','hp_increase','death','ally_death'].includes(timing))onFieldPassiveValue+=effectValue*0.28;
      else if(timing==='deploy'){onFieldPassiveValue+=effectValue*0.34;deployPassiveValue+=effectValue*0.58;}
    }
    const effects=[{effect:skill?.mainEffect,targetType:skill?.targetType},...(skill?.hasSubEffect&&skill?.subEffect?[{effect:skill.subEffect,targetType:skill.subEffect.targetType||'same_main_target'}]:[])];
    for(const entry of effects){
      const e=entry.effect||{},type=String(e.type||''),status=String(e.status||'');
      const selfTarget=entry.targetType==='self'||(entry.targetType==='same_main_target'&&skill?.targetType==='self');
      if(type==='status_apply'&&selfTarget&&['taunt','provoke'].includes(status))selfTaunt=true;
      if(selfTarget&&((type==='damage_taken_ratio'&&Number(e.val)<0)||(type==='damage_cut_ratio'&&Number(e.val)>0)))selfMitigation=true;
      if(['clear_debuffs','clear_statuses','status_remove','clear_random_debuffs'].includes(type))debuffCleanser=true;
      if(skill?.type==='active'&&Number(e.duration)===-1&&selfTarget&&['mod_atk_ratio','mod_atk_val','mod_speed'].includes(type)&&Number(e.val)>0)permanentSelfBuff=true;
      if(skill?.type==='passive'&&['damage_taken','before_damage','when_damaged'].includes(String(skill.timing||''))&&/^dmg_/.test(type)&&!selfTarget)counterAttack=true;
    }
  }
  if(selfTaunt)tags.add('taunt_protection');
  if(selfMitigation)tags.add('self_damage_mitigation');
  if(counterAttack)tags.add('counter_attack');
  if(debuffCleanser)tags.add('debuff_cleanser');
  if(permanentSelfBuff)tags.add('permanent_self_buff');
  let role=String(card.role||'');
  if(!role||role==='auto'){
    if(tags.has('hp_scaling_damage')||tags.has('damage')) role='attacker';
    if(tags.has('healing')||tags.has('shield_defense')) role='defender';
    if(tags.has('status_debuff')||tags.has('damage_amp')||tags.has('attack_speed_buff')||tags.has('status_condition')) role='controller';
  }
  if(role==='defender')tags.add('defender_role');
  if(role==='controller')tags.add('controller_role');
  if(role==='attacker')tags.add('attacker_role');
  if(role==='defender'&&selfTaunt&&(selfMitigation||counterAttack))tags.add('frontline_defender');
  if(skills.some(s=>s.type==='passive'))tags.add('passive_chain');
  const apThresholdPassiveValue=prefCardApThresholdPassiveValue(card);
  if(apThresholdPassiveValue>=3)tags.add('ap_threshold_passive');
  if(skills.some(s=>s.hasSubEffect||s.subEffect))tags.add('extra_effect');
  if(skills.some(s=>Number(s.cost||0)>=25))tags.add('heavy_cost');
  if(skills.some(s=>Number(s.cost||0)<=10))tags.add('low_cost');
  if(String(card.cardType||'')==='magic'){
    tags.add('magic');
    if(card.effect)costs.push(Math.max(0,Number(card.effect.cost)||0));
    const magicEff=card.effect||{};
    [magicEff.mainEffect,magicEff.hasSubEffect?magicEff.subEffect:null].filter(Boolean).forEach(e=>{
      if(e.targetAttr||e.targetMainAttr||e.attribute||e.attr){addAttr(e.targetAttr);addAttr(e.targetMainAttr);addAttr(e.attribute);addAttr(e.attr);tags.add('attribute_support');}
      if(e.targetCond?.type==='attr_is'||e.targetCond?.type==='attr_not'){addAttr(e.targetCond.attr);tags.add('attribute_support');}
    });
  }
  skills.filter(s=>s.type==='active').forEach(s=>costs.push(Math.max(0,Number(s.cost)||0)));
  const atk=Number(card.stats?.atk||0),hp=Number(card.stats?.hp||0),rank=prefRankStars(card);
  if(rank>=4)tags.add('high_rank');if(atk>0)tags.add('attack_role');if(hp>0&&card.cardType!=='magic')tags.add('unit');
  const subs=Array.isArray(card.subAttrs)?card.subAttrs.map(x=>typeof x==='string'?x:(x?.name||x?.id||x?.value||'')).filter(Boolean):[];
  const value={tags,mainAttr:String(card.mainAttr||''),subAttrs:subs,supportsAttrs:[...supportsAttrs],activeCosts:costs,maxCost:Math.max(0,...costs),skillCount:skills.length+(card.effect?1:0),passiveCount:skills.filter(s=>s.type==='passive').length,atk,hp,rank,role,apThresholdPassiveValue,onFieldPassiveValue:Math.min(8,onFieldPassiveValue),deployPassiveValue:Math.min(8,deployPassiveValue)};
  PREF_CARD_PROFILE_CACHE.set(card,{...sig,value});
  return value;
}
function prefCardPreferenceScore(region,card) {
  const profile=prefAIProfileForRegion(region);const cp=prefCardProfile(card);let score=0;
  score+=prefRankedPreferenceBonus(profile.mainAttrPriority,cp.mainAttr,1.1);
  cp.subAttrs.forEach(a=>{score+=prefRankedPreferenceBonus(profile.subAttrPriority,a,0.6);});
  for(const pref of profile.effectPriority){
    if(cp.tags.has(pref)) score+=Math.max(0,8-profile.effectPriority.indexOf(pref))*0.48;
  }
  return score;
}
// Compare actual status names; a generic "has debuff" label does not set up an
// unrelated mark/poison/freeze condition on a teammate's skill.
const PREF_STATUS_LINK_CACHE = new WeakMap();
function prefStatusLinks(card){
  if(!card)return {sets:[],needs:[]};
  const memo=PREF_STATUS_LINK_CACHE.get(card);
  if(memo&&memo.skills===card.skills)return memo.links;
  const sets=new Set(),needs=new Set();
  for(const skill of Array.isArray(card.skills)?card.skills:[]){
    const e=skill.mainEffect||{},target=String(skill.targetType||'');
    if(e.type==='status_apply'&&target.includes('enemy')&&e.status)sets.add(String(e.status));
    if(skill.targetCond?.type==='status_is'&&target.includes('enemy')&&skill.targetCond.status)needs.add(String(skill.targetCond.status));
    if(skill.hasSubEffect&&skill.subEffect){
      const sub=skill.subEffect;
      const subTarget=sub.targetType==='same_main_target'?target:String(sub.targetType||'');
      if(sub.type==='status_apply'&&subTarget.includes('enemy')&&sub.status)sets.add(String(sub.status));
      if(sub.targetCond?.type==='status_is'&&subTarget.includes('enemy')&&sub.targetCond.status)needs.add(String(sub.targetCond.status));
    }
  }
  const links={sets:[...sets],needs:[...needs]};PREF_STATUS_LINK_CACHE.set(card,{skills:card.skills,links});return links;
}
function prefActualStatusChain(a,b){
  const x=prefStatusLinks(a),y=prefStatusLinks(b);
  return x.sets.some(s=>y.needs.includes(s))||y.sets.some(s=>x.needs.includes(s));
}

function prefPairSynergyRaw(cardA,cardB,profile) {
  if(!cardA||!cardB)return 0;
  const a=prefCardProfile(cardA),b=prefCardProfile(cardB);let pair=0;
  const heavyA=a.maxCost>=25||a.tags.has('heavy_cost'),heavyB=b.maxCost>=25||b.tags.has('heavy_cost');
  if((a.tags.has('ap_supply')&&heavyB)||(b.tags.has('ap_supply')&&heavyA))pair+=7.5;
  if((a.tags.has('attack_speed_buff')&&b.tags.has('damage'))||(b.tags.has('attack_speed_buff')&&a.tags.has('damage')))pair+=4.0;
  if((a.tags.has('healing')||a.tags.has('shield_defense'))&&(b.tags.has('attack_role')||heavyB))pair+=3.0;
  if((a.tags.has('hp_scaling_damage')&&(b.tags.has('healing')||b.tags.has('damage_amp'))) || (b.tags.has('hp_scaling_damage')&&(a.tags.has('healing')||a.tags.has('damage_amp'))))pair+=7.5;
  if((a.tags.has('damage_amp')&&b.tags.has('damage'))||(b.tags.has('damage_amp')&&a.tags.has('damage')))pair+=5.5;
  if((b.tags.has('healing')||b.tags.has('shield_defense'))&&(a.tags.has('attack_role')||heavyA))pair+=3.0;
  if(prefActualStatusChain(cardA,cardB))pair+=8.0;
  if((a.tags.has('extra_effect')&&b.tags.has('status_debuff'))||(b.tags.has('extra_effect')&&a.tags.has('status_debuff')))pair+=4.0;
  if((a.tags.has('extra_effect')&&b.tags.has('passive_chain'))||(b.tags.has('extra_effect')&&a.tags.has('passive_chain')))pair+=4.0;
  if(a.tags.has('shield_defense')&&b.tags.has('ap_supply')||b.tags.has('shield_defense')&&a.tags.has('ap_supply'))pair+=1.8;
  // A defender with taunt + mitigation/counter is especially valuable beside a real attacker.
  if(a.tags.has('frontline_defender')&&b.role==='attacker'||b.tags.has('frontline_defender')&&a.role==='attacker')pair+=7.0;
  else if(a.role==='defender'&&b.role==='attacker'||b.role==='defender'&&a.role==='attacker')pair+=2.8;
  if((a.tags.has('debuff_cleanser')&&b.tags.has('permanent_self_buff'))||(b.tags.has('debuff_cleanser')&&a.tags.has('permanent_self_buff')))pair+=2.6;
  if(a.supportsAttrs.some(attr=>attr===b.mainAttr||b.subAttrs.includes(attr))||b.supportsAttrs.some(attr=>attr===a.mainAttr||a.subAttrs.includes(attr)))pair+=5.0;
  if(a.mainAttr&&a.mainAttr===b.mainAttr&&profile?.primaryStrategy==='attribute')pair+=2.4;
  if(a.subAttrs.some(x=>b.subAttrs.includes(x))&&profile?.primaryStrategy==='attribute')pair+=0.8;
  // High-IQ rivals can detect multi-step effect chains. Lower-IQ rivals tend to miss them.
  const complex=prefActualStatusChain(cardA,cardB)||(a.tags.has('passive_chain')&&b.tags.has('extra_effect'))||(b.tags.has('passive_chain')&&a.tags.has('extra_effect'));
  if(Number(profile?.cardIQ||0)<25&&complex)pair*=0.15;
  else if(Number(profile?.cardIQ||0)<50&&complex)pair*=0.5;
  if(Number(profile?.cardIQ||0)<20){
    // Very low card IQ mainly recognizes obvious raw-stat/straight AP combinations.
    const obvious=(a.tags.has('ap_supply')&&heavyB)||(b.tags.has('ap_supply')&&heavyA)||(a.tags.has('healing')&&b.tags.has('attack_role'))||(b.tags.has('healing')&&a.tags.has('attack_role'));
    if(!obvious)pair*=0.25;
  }
  return Math.min(14,pair);
}
// 先発4枚を「強いカード3枚」ではなく、1つの勝ち筋として評価する。
// 役割の数合わせだけではなく、主力が必要とする支援が実際にそろうかを評価する。
function prefAIActiveTrioPlanEvaluation(activeCards, activeProfiles, profile) {
  const cards=(activeCards||[]).filter(Boolean),ps=(activeProfiles||cards.map(prefCardProfile));
  if(!cards.length)return {score:-20,coreName:'',title:'有効な勝ち筋なし',reasons:['先発カードが不足']};
  const has=(p,t)=>!!p?.tags?.has(t);
  const directDamage=p=>has(p,'damage')||has(p,'hp_scaling_damage')||has(p,'attack_role')||p?.role==='attacker';
  const teamBuff=card=>typeof prefCardHasTeamBuff==='function'&&prefCardHasTeamBuff(card);
  let best=null;
  for(let i=0;i<cards.length;i++){
    const core=cards[i],cp=ps[i]||prefCardProfile(core);let score=0;const reasons=[];
    const coreDamage=directDamage(cp);
    if(coreDamage)score+=6.0;
    if(has(cp,'hp_scaling_damage'))score+=5.5;
    if(has(cp,'permanent_self_buff'))score+=2.8;
    if(cp.maxCost>=25||has(cp,'heavy_cost'))score+=2.0;
    if(cp.rank===5)score+=1.0;
    let hasAp=false,hasProtection=false,hasAmplifier=false,hasConditionSetup=false,hasTeamBuff=false,hasDamageBuddy=false;
    for(let j=0;j<cards.length;j++){
      if(i===j)continue;
      const support=cards[j],sp=ps[j]||prefCardProfile(support);
      if(has(sp,'ap_supply')&&(cp.maxCost>=18||has(cp,'heavy_cost'))){score+=8.5;hasAp=true;reasons.push(`${support.name||'支援役'}が主力のAP需要を補う`);}
      if((has(sp,'damage_amp')||has(sp,'attack_speed_buff'))&&coreDamage){score+=has(sp,'damage_amp')?6.5:4.0;hasAmplifier=true;reasons.push(`${support.name||'支援役'}が主力の火力を伸ばす`);}
      if(teamBuff(support)&&coreDamage){score+=5.0;hasTeamBuff=true;reasons.push(`${support.name||'支援役'}の全体強化を先発で活用できる`);}
      if(prefActualStatusChain(core,support)){score+=7.5;hasConditionSetup=true;reasons.push('一致する状態異常の付与から条件効果へつなぐ');}
      if(has(cp,'hp_scaling_damage')&&(has(sp,'healing')||has(sp,'damage_amp'))){score+=7.0;hasAmplifier=true;reasons.push('HP参照火力を回復・与ダメージ強化で支える');}
      if((has(sp,'frontline_defender')||sp.role==='defender')&&coreDamage){score+=has(sp,'frontline_defender')?6.5:3.2;hasProtection=true;reasons.push(`${support.name||'ディフェンダー'}が主力の生存時間を確保する`);}
      if(has(sp,'healing')||has(sp,'shield_defense'))hasProtection=true;
      if(directDamage(sp)&&coreDamage)hasDamageBuddy=true;
    }
    if((cp.maxCost>=25||has(cp,'heavy_cost'))&&!hasAp){score-=4.5;reasons.push('高コスト技を支えるAP供給が不足');}
    if(has(cp,'permanent_self_buff')&&!hasProtection){score-=2.8;reasons.push('永続強化の準備中に主力を守る手段が不足');}
    if(coreDamage&&!hasProtection&&cards.length>=3)score-=1.8;
    if(has(cp,'status_condition')&&!hasConditionSetup&&!prefActualStatusChain(core,core))score-=4.0;
    if(!coreDamage)score-=2.5;
    if(hasTeamBuff)score+=0.5;
    if(hasDamageBuddy)score+=1.2;
    // 同程度の候補なら、カードIQの高いAIほど支援関係を重く評価する。
    score*=0.94+0.06*(Number(profile?.cardIQ)||0)/100;
    if(!best||score>best.score)best={score,coreName:String(core.name||'主力候補'),title:has(cp,'hp_scaling_damage')?'HP参照火力を中心とした耐久連携':has(cp,'status_condition')?'状態異常・条件効果コンボ':(cp.maxCost>=25||has(cp,'heavy_cost'))?'高コスト主力をAP支援で通す':hasTeamBuff?'全体強化から主力火力へつなぐ':coreDamage?'主力火力＋生存支援':'基礎性能を中心とした構成',reasons:[...new Set(reasons)].slice(0,5)};
  }
  const roles=new Set(ps.map(p=>p.role).filter(Boolean));
  let score=best?.score||0;
  if(roles.has('attacker')&&roles.has('defender'))score+=3.0;
  if(roles.has('attacker')&&roles.has('controller'))score+=2.5;
  if(roles.has('defender')&&roles.has('controller'))score+=1.5;
  if(roles.has('attacker')&&roles.has('defender')&&roles.has('controller'))score+=2.0;
  if(!ps.some(directDamage))score-=8.0;
  return {...(best||{coreName:'',title:'勝ち筋未確立',reasons:[]}),score:Number(score.toFixed(2)),roles:[...roles]};
}
function prefCardEstimateError(cardIQ) {return (Math.random()-0.5)*(100-prefClamp(cardIQ,0,100))/100*0.7;}
function prefCardSynergyScore(region,card,extraCards=[],includeOwned=true) {
  if(!region||!card)return 0;
  const profile=prefAIProfileForRegion(region);const own=includeOwned?[...prefOwnedUnits(region.id),...prefOwnedMagics(region.id)].map(i=>prefCardForInstance(i.id)||prefTemplate(i.templateId)).filter(Boolean):[];
  const candidates=[...own,...(extraCards||[]).filter(Boolean)];const seen=new Set();let synergy=0;
  for(const other of candidates){const key=String(other.id??other.name??'');if(key===String(card.id??card.name??'')||seen.has(key))continue;seen.add(key);synergy+=prefPairSynergyRaw(card,other,profile);}
  const scale=0.88+0.12*(profile.cardIQ/100);
  return Math.max(0,Math.min(32,synergy*scale));
}
function prefRefreshAIPlan(region,trigger='市場確認',force=false) {
  if(!region||region.isPlayer||!campaignState)return null;
  const profile=prefAIProfileForRegion(region),abs=prefAbsTurn();
  const owned=[...prefOwnedUnits(region.id),...prefOwnedMagics(region.id)].map(inst=>prefCardForInstance(inst.id)||prefTemplate(inst.templateId)).filter(Boolean);
  // Strategic goals depend on owned cards, not the 46 other regions' market changes.
  // The market is scored separately each week; scanning/hashing it on every plan refresh
  // both cost O(46 * listings) and caused pointless plan reconstruction.
  const rosterSignature=[...prefOwnedUnits(region.id),...prefOwnedMagics(region.id)].map(x=>`${x.id}:${x.templateId}`).sort().join('|');
  const old=region.aiPlan;
  if(!force&&old&&old.rosterSignature===rosterSignature&&Number(old.lastEvaluatedAbs)===abs)return old;
  const marketSignature='market-evaluated-separately';
  const tagged=new Set();owned.forEach(c=>prefCardProfile(c).tags.forEach(t=>tagged.add(t)));
  const units=prefOwnedUnits(region.id).map(x=>prefCardForInstance(x.id)||prefTemplate(x.templateId)).filter(Boolean);
  const goals=[];
  const add=(id,title,missingTags,reason,priority=5,mainAttr='')=>{
    if(!goals.some(x=>x.id===id))goals.push({id,title,missingTags:[...new Set(missingTags)],reason,priority,mainAttr});
  };
  const highCost=units.filter(c=>prefCardProfile(c).maxCost>=25);
  if((highCost.length||profile.primaryStrategy==='heavy')&&!tagged.has('ap_supply'))add('ap-cycle','高コスト主力のAP循環',['ap_supply'],'高コストスキルを使用できるターンを増やす',10);
  if(tagged.has('status_condition')&&!tagged.has('status_debuff'))add('status-setup','条件成立用の状態異常付与',['status_debuff'],'状態異常を条件にする効果を成立させる',9);
  if(tagged.has('status_debuff')&&!tagged.has('status_condition'))add('status-payoff','状態異常からの追撃',['status_condition'],'付与した状態異常を活用する効果を探す',8);
  if(tagged.has('hp_scaling_damage')&&!tagged.has('damage_amp'))add('hp-scaling-support','HP参照火力の増幅',['damage_amp',...(tagged.has('healing')?[]:['healing'])],'最大HP参照火力には攻撃力バフより与ダメージ強化・最大HP強化・回復が有効',10);
  if((tagged.has('status_condition')&&!tagged.has('status_debuff'))||units.some(c=>prefCardProfile(c).tags.has('status_condition')&&!prefCardProfile(c).tags.has('status_debuff')))add('status-setup','条件成立用の状態異常付与',['status_debuff'],'状態異常を条件にする効果を成立させる',9);
  if((tagged.has('attack_role')||profile.primaryStrategy==='rush'||profile.primaryStrategy==='heavy')&&!tagged.has('healing')&&!tagged.has('shield_defense'))add('main-survival','主力の生存支援',['healing','shield_defense'],'火力役が行動する前に倒される危険を減らす',7);
  if(profile.primaryStrategy==='attribute'){
    const attr=profile.mainAttrPriority[0]||units.map(c=>String(c.mainAttr||'')).filter(Boolean).sort((a,b)=>units.filter(c=>c.mainAttr===b).length-units.filter(c=>c.mainAttr===a).length)[0]||'';
    const count=attr?units.filter(c=>String(c.mainAttr||'')===attr).length:0;
    if(attr&&(count>=1||profile.mainAttrPriority.length))add('attribute-core',`${attr}属性を中心とした連携`,['attribute_support'],'属性サポートと主力属性を合わせる',7,attr);
  }
  if(['combo','passive','extra'].includes(profile.primaryStrategy)||profile.secondaryStrategies.some(x=>['combo','passive','extra'].includes(x))){
    if(!tagged.has('passive_chain'))add('passive-chain','パッシブ・追加効果の連携',['passive_chain','extra_effect'],'複数段階の効果連鎖を成立させる',6);
  }
  if(!goals.length){
    const prefTag=(profile.effectPriority||[]).find(x=>!tagged.has(x));
    if(prefTag)add('preferred-effect',`好みの効果「${(PREF_AI_EFFECT_PREFERENCES.find(x=>x.id===prefTag)||{}).label||prefTag}」を補強`,[prefTag],'好みの効果カテゴリを補強し、既存構成との相性を探す',4);
  }
  goals.sort((a,b)=>b.priority-a.priority);
  const options=goals.slice(0,3).map(g=>({...g,priority:g.priority+profile.cardIQ/100*1.5}));
  const chosen=options[0]||{id:'balanced',title:'デッキ全体の穴を補完',missingTags:[],reason:'特定の不足がないため全体性能を維持',priority:1,mainAttr:''};
  region.aiPlan={version:1,createdAtAbs:old?.createdAtAbs||abs,lastEvaluatedAbs:abs,updatedAtAbs:abs,trigger:String(trigger),rosterSignature,marketSignature,
    primaryStrategy:profile.primaryStrategy,coreCardName:highCost[0]?.name||units.slice().sort((a,b)=>prefCardIntrinsicScore(region,b)-prefCardIntrinsicScore(region,a))[0]?.name||'',
    goalId:chosen.id,title:chosen.title,missingTags:chosen.missingTags,mainAttr:chosen.mainAttr||'',reason:chosen.reason,options,confidence:0.4+0.55*profile.cardIQ/100};
  const changed=!old||old.goalId!==chosen.id||old.mainAttr!==region.aiPlan.mainAttr||(Array.isArray(old.missingTags)?old.missingTags:[]).join(',')!==(Array.isArray(chosen.missingTags)?chosen.missingTags:[]).join(',')||old.rosterSignature!==rosterSignature;
  if(changed||force){
    prefRecordAIThought(region,'長期構築計画',`目標を再評価：${chosen.title}`,[chosen.reason,`カード選びの賢さ${profile.cardIQ}/100`,`比較中の構築案${options.length||1}案`,`再評価の契機：${trigger}`,...(region.aiPlan.coreCardName?[`主力候補：「${region.aiPlan.coreCardName}」を活かす計画`]:[])],
      {goalId:chosen.id,missingTags:chosen.missingTags,mainAttr:chosen.mainAttr,options:options.map(x=>({title:x.title,reason:x.reason,priority:Math.round(x.priority*10)/10})),confidence:region.aiPlan.confidence});
  }
  return region.aiPlan;
}
function prefAIPlanFitScore(region,card) {
  const plan=region?.aiPlan;if(!plan||!card)return 0;
  const cp=prefCardProfile(card);const options=Array.isArray(plan.options)&&plan.options.length?plan.options:[plan];let best=0;
  for(const goal of options){
    const match=(goal.missingTags||[]).filter(tag=>cp.tags.has(tag)).length;
    let score=match*(2.5+3*(Number(plan.confidence)||0));
    if(goal.mainAttr&&(cp.mainAttr===goal.mainAttr||cp.subAttrs.includes(goal.mainAttr)||cp.supportsAttrs.includes(goal.mainAttr)))score+=2.5*(Number(plan.confidence)||0.5);
    if(goal.id==='main-survival'&&(cp.tags.has('healing')||cp.tags.has('shield_defense')))score+=1.5;
    // Lower priority plans remain viable market alternatives, but never outrank a clearly better strategic fit by label alone.
    score*=0.7+0.3*Math.max(0,Math.min(1,(Number(goal.priority)||0)/12));
    best=Math.max(best,score);
  }
  return Math.min(14,best);
}

// Skill cards are actions cast by one of the rival's owned characters, not standalone
// player magic. Never treat an impossible cast as a positive strategic purchase.
function prefAiSkillCardCasters(region,card,ownedOverride=null){
  if(!region||!card||card.cardType!=='magic'||card.magicType!=='skill')return [];
  const req=card.useRequirements||{};
  const units=Array.isArray(ownedOverride)?ownedOverride:prefOwnedUnits(region.id);
  return units.map(inst=>inst?.cardType==='unit'?inst:(prefCardForInstance(inst?.id)||prefTemplate(inst?.templateId)))
    .filter(Boolean)
    .filter(unit=>{
      const stats=unit.stats||{};
      const attr=String(req.attr||'').trim();
      if(attr&&![unit.mainAttr,...(unit.subAttrs||[])].includes(attr))return false;
      const role=unit.role||(typeof inferUnitRoleFromSkills==='function'?inferUnitRoleFromSkills(unit.skills||[],stats):'');
      if(req.role&&role!==req.role)return false;
      if(req.minAtk!==''&&req.minAtk!=null&&Number(stats.atk||0)<Number(req.minAtk))return false;
      if(req.minHp!==''&&req.minHp!=null&&Number(stats.hp||0)<Number(req.minHp))return false;
      return true;
    });
}
function prefAiMagicFitsRoster(region,card,ownedOverride=null){
  return !!card && (card.cardType!=='magic'||card.magicType!=='skill'||prefAiSkillCardCasters(region,card,ownedOverride).length>0);
}
function prefAiSkillCardFitBonus(region,card,ownedOverride=null){
  if(!card||card.magicType!=='skill')return 0;
  const casters=prefAiSkillCardCasters(region,card,ownedOverride);
  if(!casters.length)return -Infinity;
  const cost=Math.max(0,Number(card.effect?.cost)||0);
  // At most four of five cards start on the field. More candidates means the spell
  // can still be used when an eligible caster is down or sitting in reserve.
  const flexibility=Math.min(2.5,(casters.length-1)*0.75);
  const best=casterScore=>Math.max(...casters.map(casterScore));
  const base=best(c=>Number(c.stats?.atk||0)/1600+Number(c.stats?.priority||0)/100);
  // Skill cards consume the actor's entire command. Low-impact high-AP cards
  // should not automatically be bought just because one actor qualifies.
  const tactical=prefMagicTacticalValue(card);
  return 1.5+flexibility+Math.min(3,base*0.35)+Math.max(-4,Math.min(6,tactical*0.35))-cost*0.03;
}
function prefAiListUnusableSkillCards(region){
  if(!region||region.isPlayer||!campaignState)return 0;
  let listed=0;
  for(const inst of prefOwnedMagics(region.id)){
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    if(card?.magicType!=='skill'||prefAiMagicFitsRoster(region,card))continue;
    prefListInstance(inst,region.id,'no-eligible-skill-caster');
    prefRecordAIThought(region,'スキルカード整理',`「${card.name||'スキルカード'}」を出品`,[
      '現時点の所持キャラには使用条件を満たす術者がいないため、保持を見送り',
      '今後、使えるキャラが加わった場合は市場から再評価する'
    ],{cardName:card.name});
    listed++;
  }
  return listed;
}

function prefMagicTacticalValue(card){
  if(!card||card.cardType!=='magic')return 0;
  const eff=card.effect||{},cp=prefCardProfile(card),cost=Math.max(0,Number(eff.cost)||0);
  let value=0;
  function component(e,target,multiplier){
    if(!e)return 0;
    const t=String(e.type||''),n=Number(e.val)||0,side=String(target||'');
    const friendly=side==='self'||side.includes('ally');
    const broad=side.includes('all_')||side==='all_enemy'||side==='all_ally';
    let raw=0;
    if(t.startsWith('dmg_'))raw=t==='dmg_atk_ratio'?0.7:Math.min(7,Math.max(0,n)/650);
    else if(t==='mod_ap')raw=Math.min(8,Math.abs(n)/5);
    else if(t==='shield'||t==='heal_fixed'||t==='mod_max_hp_val')raw=Math.min(8,Math.abs(n)/750);
    else if(t==='heal_max_hp_ratio')raw=Math.min(8,Math.abs(n)/12);
    else if(['mod_atk_ratio','damage_dealt_ratio','damage_taken_ratio','damage_cut_ratio','mod_speed'].includes(t))raw=Math.min(8,Math.abs(n)/12);
    else if(['status_apply','skill_block','heal_block','status_remove','clear_debuffs','clear_buffs'].includes(t))raw=4;
    const negative=t.startsWith('dmg_')||t==='skill_block'||t==='heal_block'||t==='status_apply'||(t==='mod_ap'&&n<0)||(t==='damage_taken_ratio'&&n>0)||(t==='damage_cut_ratio'&&n<0)||(t==='mod_atk_ratio'&&n<0);
    const useful=friendly?!negative:negative;
    return multiplier*(useful?raw:-raw*1.8)*(broad?1.65:1);
  }
  value+=component(eff.mainEffect,eff.targetType,1);
  if(eff.hasSubEffect&&eff.subEffect)value+=component(eff.subEffect,eff.subEffect.targetType==='same_main_target'?eff.targetType:eff.subEffect.targetType,0.65);
  if(cp.tags.has('ap_supply'))value+=2;
  if(cp.tags.has('shield_defense')||cp.tags.has('healing'))value+=1;
  const chance=Math.max(0,Math.min(100,Number(eff.chance??100)))/100;
  const conditional=eff.selfCond&&eff.selfCond.type!=='none'?0.85:1;
  return value*chance*conditional-Math.min(12,cost*0.19);
}

function prefCardIntrinsicScore(region,card) {
  if(!card)return 0;
  if(card.cardType==='magic')return 17+prefMagicTacticalValue(card)*2.5+Math.max(-3,Math.min(4,Math.log10(Math.max(1,prefCardValue(card))/1000000)))*1.5;
  const rank=prefRankStars(card),p=prefCardProfile(card),value=prefCardValue(card);
  const valueAnchor=rank===5?PREF_GACHA_VALUE_LIMITS[5]:rank===4?PREF_GACHA_VALUE_LIMITS[4]:rank===3?3000000:1000000;
  // Rank should matter materially, while the card's estimated value distinguishes weak and strong
  // cards within the same rank. Personality bonuses are deliberately too small to override this.
  const valueSignal=Math.max(-2,Math.min(2,Math.log10(Math.max(1,value)/Math.max(1,valueAnchor))));
  const profile=prefAIProfileForRegion(region);
  let score=rank*12+(rank>=4?5:0)+(rank===5?6:0)+valueSignal*3.6;
  score+=Math.min(8,p.atk/1200)+Math.min(6,p.hp/6000)+p.skillCount*0.8+p.passiveCount*1.2;
  if(profile.primaryStrategy==='rush'||profile.secondaryStrategies.includes('rush'))score+=Math.min(5,p.atk/1600);
  if(profile.primaryStrategy==='sustain'||profile.secondaryStrategies.includes('sustain'))score+=Math.min(3,p.hp/7000);
  if(profile.primaryStrategy==='ap_efficiency'&&p.tags.has('ap_supply'))score+=4;
  return score;
}
function prefGetOpponentIntel(region,opponentId) {
  if(!region||!opponentId)return null;
  const memory=region.aiMemory?.opponents?.[String(opponentId)]||region.aiMemory?.opponents?.[opponentId];if(!memory)return null;
  const now=prefAbsTurn();const observations=Array.isArray(memory.observations)?memory.observations:[];
  const battleObs=observations.slice().sort((a,b)=>(b.abs||0)-(a.abs||0))[0]||null;
  const scout=memory.scouting&&memory.scouting.success?memory.scouting:null;
  const scoutAbs=Number(scout?.absoluteTurn)||0,battleAbs=Number(battleObs?.abs)||0;
  let source='battle',observedAbs=battleAbs,cards=battleObs?.opponentCards||memory.opponentCards||[],actions=battleObs?.actions||[];
  if(scout&&scoutAbs>=battleAbs){source='scouting';observedAbs=scoutAbs;cards=scout.cards||[];actions=[];}
  if(!observedAbs)return null;
  const age=Math.max(0,now-observedAbs);
  // Directly observed cards are reliable, but old rosters slowly lose predictive value.
  const repeatFactor=source==='scouting'?1:0.35+0.65*(Math.max(1,Number(memory.matches)||1)/(Math.max(1,Number(memory.matches)||1)+2));
  const freshness=1/(1+age/26);
  const confidence=Math.max(0,Math.min(0.98,(source==='scouting'?0.9:0.96)*repeatFactor*freshness));
  const recentActions=observations.filter(o=>now-(Number(o.abs)||0)<=52).flatMap(o=>o.actions||[]);
  const actionTypes={attack:0,skill:0,magic:0};
  recentActions.forEach(a=>{if(Object.prototype.hasOwnProperty.call(actionTypes,a.type))actionTypes[a.type]++;});
  return {opponentId:String(opponentId),source,observedAbs,age,confidence,cards:Array.isArray(cards)?cards:[],actions:Array.isArray(actions)?actions:[],recentActions,matches:Number(memory.matches)||0,actionTypes,topic:source==='scouting'?(scout?.topic||'cards'):'battle',behavior:source==='scouting'?(scout?.summary||''):'',targetTier:scout?.targetTier||null,opponentName:memory.opponentName||prefRegion(opponentId)?.repName||String(opponentId)};
}
function prefRecordAIScouting(region,target,result) {
  if(!region||region.isPlayer||!target||!result)return;
  region.aiMemory=region.aiMemory&&typeof region.aiMemory==='object'?region.aiMemory:{opponents:{},decisions:[]};
  region.aiMemory.opponents=region.aiMemory.opponents&&typeof region.aiMemory.opponents==='object'?region.aiMemory.opponents:{};
  const old=region.aiMemory.opponents[target.id]||{matches:0,wins:0,losses:0,draws:0,observations:[],actionCounts:{}};
  old.opponentName=target.repName||target.prefecture;old.lastSeenAbs=prefAbsTurn();
  old.scouting={success:!!result.success,absoluteTurn:prefAbsTurn(),year:campaignState.year,week:campaignState.week,topic:result.topic||'cards',cards:(result.cards||[]).map(c=>({name:String(c.name||'不明'),rank:Number(c.rank)||1,mainAttr:String(c.mainAttr||''),subAttrs:Array.isArray(c.subAttrs)?c.subAttrs.slice(0,5):[],templateId:c.templateId?String(c.templateId):''})),summary:String(result.summary||''),targetTier:result.targetTier||target.tier};
  region.aiMemory.opponents[target.id]=old;
  prefRecordAIThought(region,'調査','対戦候補の情報を記録',[result.success?'調査に成功し、確認できた情報を保存':'調査に失敗。新たな情報は得られず',`対象：${target.prefecture||target.id}`,`内容：${result.topic||'cards'}`],{opponentId:target.id,success:!!result.success,cardCount:(result.cards||[]).length});
}
function prefRecordBattleAIObservation(region,opponentId,match) {
  if(!region||region.isPlayer)return;
  region.aiMemory=region.aiMemory&&typeof region.aiMemory==='object'?region.aiMemory:{opponents:{},decisions:[]};
  region.aiMemory.opponents=region.aiMemory.opponents&&typeof region.aiMemory.opponents==='object'?region.aiMemory.opponents:{};
  const old=region.aiMemory.opponents[opponentId]||{matches:0,wins:0,losses:0,draws:0,observations:[]};
  old.matches=(old.matches||0)+1;old.wins+=(match.result==='win'?1:0);old.losses+=(match.result==='loss'?1:0);old.draws+=(match.result==='draw'?1:0);
  old.lastSeenAbs=prefAbsTurn();old.lastResult=match.result;old.opponentName=match.opponentName;old.opponentCards=match.opponentCards||[];
  old.observations=Array.isArray(old.observations)?old.observations:[];
  old.observations.unshift({abs:prefAbsTurn(),result:match.result,opponentCards:match.opponentCards||[],actions:match.actions||[]});old.observations=old.observations.slice(0,5);
  old.actionCounts=old.actionCounts&&typeof old.actionCounts==='object'?old.actionCounts:{};
  old.actionTypeCounts=old.actionTypeCounts&&typeof old.actionTypeCounts==='object'?old.actionTypeCounts:{attack:0,skill:0,magic:0};
  (match.actions||[]).forEach(a=>{const k=String(a.name||a.type||'行動');old.actionCounts[k]=(old.actionCounts[k]||0)+1;if(Object.prototype.hasOwnProperty.call(old.actionTypeCounts,String(a.type||'')))old.actionTypeCounts[String(a.type)]++;});
  // Limit long-lived per-rival memory to the 20 most recently observed opponents.
  region.aiMemory.opponents[opponentId]=old;
  const keys=Object.entries(region.aiMemory.opponents).sort((a,b)=>(b[1].lastSeenAbs||0)-(a[1].lastSeenAbs||0)).map(([k])=>k);
  keys.slice(20).forEach(k=>delete region.aiMemory.opponents[k]);
}

function prefRandom(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function prefShuffle(arr) { const out=[...(arr||[])]; for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out; }
function prefClamp(n,min,max) { n=Number(n); return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min; }
function prefEsc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
// An AI evaluation can query the same card hundreds of times. Rebuild the O(1) indexes
// only when the library reference/size changes; campaign cards are appended in place.
let prefCardIndexSource=null,prefCardIndexLength=-1,prefCardById=new Map(),prefTemplateById=new Map(),prefCardTemplateList=[];
function prefInvalidateCardIndex(){prefCardIndexSource=null;prefCardIndexLength=-1;}
function prefEnsureCardIndex(){
  const cards=Array.isArray(allCards)?allCards:[];
  if(prefCardIndexSource===cards&&prefCardIndexLength===cards.length)return;
  prefCardIndexSource=cards;prefCardIndexLength=cards.length;
  prefCardById=new Map();prefTemplateById=new Map();prefCardTemplateList=[];
  for(const card of cards){
    if(!card)continue;
    prefCardById.set(String(card.id),card);
    if(!card.campaignInstance){prefCardTemplateList.push(card);prefTemplateById.set(String(card.id),card);}
  }
}
function prefCardTemplates(){prefEnsureCardIndex();return prefCardTemplateList;}
function prefTemplate(id){prefEnsureCardIndex();return prefTemplateById.get(String(id))||null;}
function prefCardForInstance(id){prefEnsureCardIndex();return prefCardById.get(String(id))||null;}
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
function prefFiveStarLimit(region) { return region?.isPlayer ? PREF_PLAYER_RANK5_LIMIT : PREF_RIVAL_RANK5_LIMIT; }
function prefOwnedFiveStarUnits(regionId) {
  return prefOwnedUnits(regionId).filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===5);
}
function prefCountFiveStarIds(ids, units) {
  const byId=new Map((units||[]).map(inst=>[String(inst.id),inst]));
  return [...new Set(ids||[])].filter(id=>{const inst=byId.get(String(id));return !!inst&&prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===5;}).length;
}
function prefNormalizeLoadoutSelection(activeIds, reserveIds, units) {
  const valid=new Map((units||[]).map(inst=>[String(inst.id),inst]));
  const active=[],reserve=[],seen=new Set();let fiveCount=0;
  const add=(id,target,max)=>{
    const key=String(id),inst=valid.get(key);if(!inst||seen.has(key)||target.length>=max)return;
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId),isFive=prefRankStars(card)===5;
    if(isFive&&fiveCount>=PREF_BATTLE_RANK5_LIMIT)return;
    target.push(inst.id);seen.add(key);if(isFive)fiveCount++;
  };
  (activeIds||[]).forEach(id=>add(id,active,PREF_BATTLE_ACTIVE));
  (reserveIds||[]).forEach(id=>add(id,reserve,1));
  // A legacy/invalid saved roster may exceed the shared two-★5 battle cap. If an entry is
  // rejected, promote a legal reserve into the field before searching unassigned cards.
  while(active.length<PREF_BATTLE_ACTIVE&&reserve.length){
    let i=reserve.findIndex(id=>{const inst=valid.get(String(id));return inst&&prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))!==5;});
    if(i<0&&fiveCount<PREF_BATTLE_RANK5_LIMIT)i=reserve.findIndex(id=>{const inst=valid.get(String(id));return inst&&prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===5;});
    if(i<0)break;
    const id=reserve.splice(i,1)[0],inst=valid.get(String(id));if(inst)active.push(inst.id);
  }
  // Fill the field first with non-★5 units while respecting the shared two-★5 battle cap.
  const remaining=(units||[]).filter(x=>!seen.has(String(x.id)));
  while(active.length<PREF_BATTLE_ACTIVE){let i=remaining.findIndex(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))!==5);if(i<0&&fiveCount<PREF_BATTLE_RANK5_LIMIT)i=remaining.findIndex(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))===5);if(i<0)break;const inst=remaining.splice(i,1)[0];add(inst.id,active,PREF_BATTLE_ACTIVE);}
  while(reserve.length<1){let i=remaining.findIndex(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))!==5);if(i<0&&fiveCount<PREF_BATTLE_RANK5_LIMIT)i=remaining.findIndex(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))===5);if(i<0)break;const inst=remaining.splice(i,1)[0];add(inst.id,reserve,1);}
  return {active,reserve};
}
function prefBuildAutoLoadout(units) {
  const ranked=(units||[]).slice().sort((a,b)=>{const ca=prefCardForInstance(a.id)||prefTemplate(a.templateId),cb=prefCardForInstance(b.id)||prefTemplate(b.templateId);return prefRankStars(cb)-prefRankStars(ca)||prefCardValue(cb)-prefCardValue(ca);});
  const selected=[];let fiveCount=0;
  for(const inst of ranked){const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId),five=prefRankStars(card)===5;if(five&&fiveCount>=PREF_BATTLE_RANK5_LIMIT)continue;selected.push(inst.id);if(five)fiveCount++;if(selected.length>=5)break;}
  return prefNormalizeLoadoutSelection(selected.slice(0,PREF_BATTLE_ACTIVE),selected.slice(PREF_BATTLE_ACTIVE,5),units);
}
function prefLegalBattleUnitCount(units) {
  const cards=(units||[]).map(inst=>prefCardForInstance(inst?.id)||prefTemplate(inst?.templateId)).filter(Boolean);
  const five=cards.filter(card=>prefRankStars(card)===5).length;
  return cards.length-five+Math.min(five,PREF_BATTLE_RANK5_LIMIT);
}
function prefCanFormLegalBattleSquad(units) {
  return prefLegalBattleUnitCount(units)>=PREF_BATTLE_ACTIVE;
}
function prefEmergencyLoadout(regionId) {
  const units=prefOwnedUnits(regionId);
  const ranked=units.slice().sort((a,b)=>{
    const ca=prefCardForInstance(a.id)||prefTemplate(a.templateId),cb=prefCardForInstance(b.id)||prefTemplate(b.templateId);
    return prefRankStars(cb)-prefRankStars(ca)||prefCardValue(cb)-prefCardValue(ca);
  });
  const selected=[];let fiveCount=0;
  for(const inst of ranked){
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId),isFive=prefRankStars(card)===5;
    if(isFive&&fiveCount>=PREF_BATTLE_RANK5_LIMIT)continue;
    selected.push(inst.id);if(isFive)fiveCount++;
    if(selected.length>=PREF_MAX_BATTLE_UNITS)break;
  }
  return prefNormalizeLoadoutSelection(selected.slice(0,PREF_BATTLE_ACTIVE),selected.slice(PREF_BATTLE_ACTIVE,PREF_MAX_BATTLE_UNITS),units);
}

function prefAiUnitReplacementChoice(region, units, incomingInst) {
  const incoming=prefCardForInstance(incomingInst?.id)||prefTemplate(incomingInst?.templateId);
  const fives=(units||[]).filter(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))===5);
  if(!incoming)return incomingInst?.id||null;
  const incomingRank=prefRankStars(incoming);
  const highTier=!!region&&!region.isPlayer&&['S','A','B'].includes(String(region.tier||''));
  const cardFor=inst=>prefCardForInstance(inst?.id)||prefTemplate(inst?.templateId);

  // Funded top-tier rivals must not let preference/synergy scores justify retaining ★3 beside ★4/★5.
  // Reject a weak draw outright; the caller refunds the pull or skips the market listing.
  if(incomingRank<=3&&(units||[]).filter(x=>prefRankStars(cardFor(x))>=4).length>=3)return incomingInst?.id||null;

  let replaceable=(units||[]).slice();
  if(incomingRank===5&&fives.length>=prefFiveStarLimit(region))replaceable=fives;
  else if(region&&!region.isPlayer&&incomingRank<5&&fives.length>0){
    const nonFives=(units||[]).filter(x=>prefRankStars(cardFor(x))!==5);
    if(nonFives.length)replaceable=nonFives;
    else return incomingInst?.id||null;
  }

  if(replaceable.length&&incomingRank>=4){
    const rows=replaceable.map(inst=>({inst,card:cardFor(inst),rank:prefRankStars(cardFor(inst))})).filter(x=>x.card);
    // Rank upgrades beat small synergy differences: replace the lowest-ranked eligible card first.
    const lower=rows.filter(x=>x.rank<incomingRank);
    if(lower.length){
      const lowestRank=Math.min(...lower.map(x=>x.rank));
      const weakestRank=lower.filter(x=>x.rank===lowestRank);
      weakestRank.sort((a,b)=>{
        const ae=Number(a.inst.expiresAtAbs)||Number.MAX_SAFE_INTEGER;
        const be=Number(b.inst.expiresAtAbs)||Number.MAX_SAFE_INTEGER;
        return ae-be||prefCardValue(a.card)-prefCardValue(b.card);
      });
      return weakestRank[0].inst.id;
    }

    // With the holder's two ★5 slots already occupied, a genuinely upper-value ★5 must be allowed
    // to displace a lower-value ★5. Previously the minimum-gain check could keep the weak ★5 forever.
    if(incomingRank===5&&fives.length>=prefFiveStarLimit(region)&&Number(incoming.value||0)>=PREF_GACHA_VALUE_LIMITS[5]){
      const lowerValueFives=rows.filter(x=>x.rank===5&&Number(x.card?.value||0)<PREF_GACHA_VALUE_LIMITS[5]);
      if(lowerValueFives.length){
        lowerValueFives.sort((a,b)=>Number(a.card?.value||0)-Number(b.card?.value||0));
        return lowerValueFives[0].inst.id;
      }
    }

    // Refresh an otherwise comparable unit before its 52-turn expiry, preventing needless roster gaps.
    const now=prefAbsTurn();
    const expiring=rows.filter(x=>x.rank<=incomingRank&&x.inst.expiresAtAbs!=null&&Number(x.inst.expiresAtAbs)-now<=6&&Number(x.inst.expiresAtAbs)>=now);
    if(expiring.length){
      expiring.sort((a,b)=>Number(a.inst.expiresAtAbs)-Number(b.inst.expiresAtAbs)||a.rank-b.rank||prefCardValue(a.card)-prefCardValue(b.card));
      return expiring[0].inst.id;
    }
  }

  if(region&&!region.isPlayer&&replaceable.length){
    const before=prefAIQuickRosterQuality(region,units);let bestId=null,bestDelta=-Infinity;
    for(const old of replaceable){
      const afterUnits=(units||[]).map(x=>String(x.id)===String(old.id)?incomingInst:x);
      const delta=prefAIQuickRosterQuality(region,afterUnits)-before;
      if(delta>bestDelta){bestDelta=delta;bestId=old.id;}
    }
    const iq=Number(prefAIProfileForRegion(region).cardIQ)||0;
    const minGain=0.7; // 全ライバルが小さくても実利のある改善を拾う。IQは思考方針と探索幅に残す。
    if(bestId&&bestDelta>=minGain)return bestId;
    return incomingInst?.id||null;
  }
  return prefAiReplacementChoice(region,replaceable,incomingInst);
}
function prefEnforceOwnedStar5Caps() {
  if(!campaignState?.regions)return false;
  let changed=false,listedExcess=0,revertedLegacyGrants=0;

  // v1.0.52-era migration accidentally handed a free ★5 to every rival with none
  // whenever an existing campaign was loaded. Reclaim only instances carrying that
  // explicit source marker; legitimate initial/gacha/market acquisitions are untouched.
  // Return the erroneous copies to the shared gacha pool and mark them as handled so this
  // repair is idempotent across subsequent loads.
  for(const inst of Object.values(campaignState.instances||{})){
    if(inst?.source==='star5-holder-migration' && inst.zone!=='consumed'){
      prefSendToGacha(inst,'reverted-legacy-star5-holder-migration');
      inst.source='legacy-star5-holder-migration-reverted';
      inst.copyException=false;
      revertedLegacyGrants++;
      changed=true;
    }
  }

  // Keep the holder-limit migration only: it lists excess ★5s from old saves but never
  // creates or distributes new cards. The battle deck's separate cap remains two ★5s.
  for(const region of Object.values(campaignState.regions)){
    let fives=prefOwnedFiveStarUnits(region.id);
    const limit=prefFiveStarLimit(region);
    if(fives.length>limit){
      fives.sort((a,b)=>{
        const ca=prefCardForInstance(a.id)||prefTemplate(a.templateId);
        const cb=prefCardForInstance(b.id)||prefTemplate(b.templateId);
        return prefCardValue(cb)-prefCardValue(ca)||Number(cb?.stats?.atk||0)-Number(ca?.stats?.atk||0);
      });
      const excess=fives.slice(limit);
      excess.forEach(inst=>prefListInstance(inst,region.id,'star5-cap-migration'));
      listedExcess+=excess.length;
      changed=true;
    }
  }
  if(revertedLegacyGrants||listedExcess){
    const parts=[];
    if(revertedLegacyGrants)parts.push(`誤配布された★5カード${revertedLegacyGrants}枚をガチャへ戻しました`);
    if(listedExcess)parts.push(`旧セーブの★5所持上限超過${listedExcess}枚を市場へ出品しました`);
    prefLog(`${parts.join('。')}。新たな★5カードの自動配布は行いません。`,'info');
  }
  return changed;
}
function prefRegion(regionId) { return campaignState?.regions?.[regionId] || null; }
function prefRegionIconUrl(region) {
  if(!region) return null;
  // The icon image stays in the profile store, not duplicated in campaign localStorage.
  if(region.isPlayer) return (typeof playerIcon !== 'undefined' && playerIcon) ? playerIcon : null;
  const profileId=region.profileRivalId;
  if(profileId!=null && profileId!=='') {
    const profile=(Array.isArray(allRivals)?allRivals:[]).find(r=>String(r.id)===String(profileId));
    if(profile && typeof profile.iconImage==='string' && profile.iconImage.length) return profile.iconImage;
  }
  return null;
}

function prefPlayerRegion() { return prefRegion(PREF_PLAYER_ID); }
let prefInstanceSource=null,prefInstanceSnapshot=[],prefInstanceCount=0;
function prefInvalidateInstanceIndex(){prefInstanceSource=null;}
function prefInstances(filter=()=>true){
  const source=campaignState?.instances;
  if(!source)return [];
  if(prefInstanceSource!==source){prefInstanceSource=source;prefInstanceSnapshot=Object.values(source);prefInstanceCount=prefInstanceSnapshot.length;}
  return prefInstanceSnapshot.filter(filter);
}
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
  campaignState.instances[id]=inst;prefInvalidateInstanceIndex();
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
  const html=getCardHTML({id:cardId,cardType:card.cardType,name:card.name,mainAttr:card.mainAttr,subAttrs:card.subAttrs||[],hp:card.stats?.hp||0,atk:card.stats?.atk||0,prio:card.stats?.priority??999,rank:card.rank,role:card.role,img:getCardImage(card),desc:card.desc||card.description||''});
  return `<div class="pref-compact-card min-w-0" data-pref-action="details" data-id="${prefEsc(cardId)}"><div class="${small?'opacity-95':''}">${html}</div>${extra}</div>`;
}
function prefGradeValue(region) { return PREF_TIER_VALUE[region?.tier||'E']||1; }
function prefCardHasOwnerTemplate(templateId, exceptRegionId=null) {
  return prefOwnedInstancesAny().some(inst=>String(inst.templateId)===String(templateId) && inst.ownerId!==exceptRegionId);
}
function prefOwnedInstancesAny() { return prefInstances(x=>x.zone==='owner' && x.kind==='unit'); }
function prefIsInitialDuplicateTemplate(instanceId) { return !!campaignState?.instances?.[instanceId]?.copyException; }
function prefEligibleGachaUnitInstances() {
  // Only ★3–★5 characters are eligible in campaign mode. Low-rank templates remain in the card library
  // but must never be drawn, including records left in older campaign saves.
  const unavailable = new Set(prefInstances(x=>x.kind==='unit' && ['owner','market'].includes(x.zone)).map(x=>String(x.templateId)));
  return prefGachaUnits().filter(inst=>{
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    return !inst.initialUnavailable && prefRankStars(card)>=3 && !unavailable.has(String(inst.templateId));
  });
}
function prefGrantGachaBundleMagic(regionId) {
  const templates=prefCardTemplates().filter(c=>c.cardType==='magic');if(!templates.length)return null;
  const template=prefRandom(templates);if(!template)return null;
  const inst=prefCreateInstance(template.id,'pending',null,{source:'gacha-bundle-ai'});if(!inst)return null;
  const owned=prefOwnedMagics(regionId);
  const region=prefRegion(regionId);
  if((region&&!region.isPlayer&&!prefAiMagicFitsRoster(region,template)) || owned.some(x=>String(x.templateId)===String(template.id)) || owned.length>=PREF_MAGIC_LIMIT){prefListInstance(inst,regionId,!prefAiMagicFitsRoster(region,template)?'no-eligible-skill-caster':owned.length>=PREF_MAGIC_LIMIT?'gacha-bundle-capacity':'duplicate-gacha-bundle');return {template,listed:true};}
  const result=prefAcquireInstance(regionId,inst.id,{reason:'gacha-bundle'});return {template,listed:result==='pending'};
}
// The resolver already creates the exact probability-slot magic instance. Do not roll a
// second template and leave the real result orphaned in the pending zone.
function prefAiReceiveDrawnMagic(region, selected, reason='ai-gacha'){
  const inst=selected?.instance;
  if(!region||!inst||inst.kind!=='magic')return false;
  const duplicate=prefOwnedMagics(region.id).some(x=>String(x.templateId)===String(inst.templateId));
  if(duplicate)prefListInstance(inst,region.id,'duplicate-gacha');
  else {
    const acquired=prefAcquireInstance(region.id,inst.id,{reason});
    if(acquired===false){prefListInstance(inst,region.id,'ai-magic-acquisition-failed');return false;}
  }
  // Every paid pull includes the additional guaranteed magic, even when the probability
  // slot was already magic. Duplicates are listed by the ordinary acquisition rules.
  prefGrantGachaBundleMagic(region.id);
  return true;
}

function prefNewStats() { return {assetMetric:0,wins:0,losses:0,draws:0,battles:0,investigations:0,marketIncome:0,marketExpense:0,aidIncome:0}; }
function prefDefaultRegion(prefecture, isPlayer, repName, personality, initialPosition) {
  const tier=prefTierForPosition(initialPosition);
  return {id:prefecture,prefecture,repName,personality:personality.id,personalityLabel:personality.name,personalityFocus:personality.focus,
    aiIntelligence:personality.intelligence||'normal',aiProfile:prefDefaultAIProfileForTier(tier,personality.id),aiTacticalIQ:prefDefaultAIProfileForTier(tier,personality.id).tacticalIQ,aiCardIQ:prefDefaultAIProfileForTier(tier,personality.id).cardIQ,
    aiMemory:{opponents:{},decisions:[]},isPlayer:!!isPlayer,funds:0,initialPosition,rankPosition:initialPosition,rankEndPosition:initialPosition,rankTieCount:1,tier,
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
  const units=templateCards.filter(c=>c.cardType==='unit' && prefRankStars(c)>=3);
  const magic=templateCards.filter(c=>c.cardType==='magic');
  const unitCount=units.length;
  const allowInitialDuplicates=unitCount<240;
  const unused=new Set(units.map(c=>String(c.id)));
  const allTemplates=new Map(units.map(c=>[String(c.id),c]));
  // Allocate each template at most once until the unique templates are all used. Only then are startup copies allowed.
  function takeInitialUnit(desiredRank, forceRank5=false) {
    const avail=[...unused].map(id=>allTemplates.get(id)).filter(Boolean);
    let chosen=null;
    if(forceRank5){
      const unusedFives=avail.filter(c=>prefRankStars(c)===5);
      if(unusedFives.length){chosen=prefRandom(unusedFives);unused.delete(String(chosen.id));return prefCreateInstance(chosen.id,'owner',null,{source:'initial',copyException:false});}
      const anyFives=units.filter(c=>prefRankStars(c)===5);
      if(anyFives.length){const source=prefRandom(anyFives);return prefCreateInstance(source.id,'owner',null,{source:'initial-rank5-copy',copyException:true});}
    }
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
  // A recipe's ★5 slot is a hard quality requirement. If unique ★5 templates are exhausted,
  // allow a marked initial copy rather than silently filling the top-tier rival with ★4/★3.
  function takeInitialUnitFromAny(desiredRank) { return takeInitialUnit(desiredRank, Number(desiredRank)===5); }
  function takeInitialUnitByBand(rank, band) {
    const avail=[...unused].map(id=>allTemplates.get(id)).filter(c=>c&&prefRankStars(c)===rank);
    const threshold=PREF_GACHA_VALUE_LIMITS[rank];
    const eligible=avail.filter(c=>band==='upper'?Number(c.value||0)>=threshold:band==='lower'?Number(c.value||0)<threshold:true);
    if(!eligible.length)return null;const chosen=prefRandom(eligible);unused.delete(String(chosen.id));return prefCreateInstance(chosen.id,'owner',null,{source:'initial',copyException:false});
  }
  const assigned={};
  // Player starts with five ★3 characters.
  const playerUnits=[];
  for(let i=0;i<5;i++){const inst=takeInitialUnitFromAny(3);if(inst)playerUnits.push(inst);}
  // The other 46 regions are initially ordered by the defined strength tiers.
  const rankRows=prefAssignInitialRanks();
  for(let pos=1;pos<=rankRows.length;pos++){
    const row=rankRows[pos-1]; row.position=pos;
    if(!assigned[row.prefecture])assigned[row.prefecture]=[];
    const recipes=PREF_RANK_UNIT_RECIPE[row.tier]||PREF_RANK_UNIT_RECIPE.E;
    for(const r of recipes){const spec=typeof r==='string'?{rank:Number(r[0]),band:r[1]==='u'?'upper':'lower'}:{rank:r,band:'any'};const inst=takeInitialUnitByBand(spec.rank,spec.band) || takeInitialUnitFromAny(spec.rank); if(inst)assigned[row.prefecture].push(inst);}
  }
  // Below the 240-card completeness threshold the starting gacha must have zero drawable characters.
  // If 234–239 templates were authored, there are more templates than starting owner slots but still
  // fewer than the full holder capacity; keep those few records accounted for as locked pool entries.
  [...unused].forEach(id=>prefCreateInstance(id,'gacha',null,{source:'initial-pool',initialUnavailable:allowInitialDuplicates}));
  return { playerUnits, assigned, rankRows, magic };
}
function prefCreateNewCampaign() {
  const templates=prefCardTemplates();
  const allUnitTemplates=templates.filter(c=>c.cardType==='unit');
  const units=allUnitTemplates.filter(c=>prefRankStars(c)>=3);
  const magics=templates.filter(c=>c.cardType==='magic');
  if(units.length<PREF_BATTLE_ACTIVE) { alert('ゲームモードでは★3以上のキャラカードのみ使用できます。★3以上のキャラカードを4枚以上作成してください。'); return null; }
  if(!magics.length) { alert('先にマジックカードを1枚以上作成してください。'); return null; }
  // discard the old campaign copies first; never touch the created card library in IndexedDB.
  allCards=allCards.filter(c=>!c.campaignInstance);
  const state={version:1,year:1,week:1,absoluteTurn:1,phase:'ready',gameOver:false,gameOverReason:'',yearReview:null,
    instances:{},regions:{},rankingOrder:[],rankingInitialized:false,logs:[],investigations:[],supportApplied:[],lastLoadout:{active:[],reserve:[]},turnProcessing:null,pendingAcquisition:null,pendingAcquisitionQueue:[],pendingGachaContinueKey:null,yearHistory:[],templateUnitCount:units.length,initialDuplicatesAllowed:units.length<240};
  campaignState=state;
  const pool=prefBuildInitialCardPool(templates,state);
  // Map allocated card instances into prefecture ownership. Player starts with five ★3 cards; rivals follow tier-specific recipes.
  const player=prefDefaultRegion(PREF_PLAYER_ID,true,(playerName&&playerName!=='あなた')?playerName:'京都府代表',PREF_PERSONALITIES[0],47);
  state.regions[PREF_PLAYER_ID]=player;
  pool.playerUnits.forEach(inst=>{inst.ownerId=PREF_PLAYER_ID; inst.zone='owner'; inst.acquiredAtAbs=1; inst.expiresAtAbs=1+PREF_CARD_LIFETIME;});
  player.funds=100000000;
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
    // Custom rival profiles use their explicit 0-100 ratings. Automatically generated rivals are initialized from starting tier.
    region.aiProfile=prefAIProfileFromRival(existing,row.tier,personality.id);
    region.aiTacticalIQ=region.aiProfile.tacticalIQ;region.aiCardIQ=region.aiProfile.cardIQ;
    region.aiMemory={opponents:{},decisions:[]};
    state.regions[row.prefecture]=region;
    (pool.assigned[row.prefecture]||[]).forEach(inst=>{inst.ownerId=row.prefecture;inst.zone='owner';inst.acquiredAtAbs=1;inst.expiresAtAbs=1+PREF_CARD_LIFETIME;});
  }
  // v1.0.71: A new campaign starts with zero magic cards for *all* representatives.
  // Authored magic templates remain in the library and may enter normal gacha/market later.
  // Keep old campaign holdings untouched; this branch runs only when creating a new campaign.
  state.pendingAcquisitionQueue=[];
  // Initial rank order places Kyoto at 47th. Funds begin at zero; the week-1 aid payment is the opening capital.
  state.rankingOrder=[...pool.rankRows.map(x=>x.prefecture),PREF_PLAYER_ID];
  state.rankingInitialized=true;
  state.rankingOrder.forEach((id,i)=>{const r=state.regions[id];r.rankPosition=i+1;r.rankEndPosition=i+1;r.rankTieCount=1;r.tier=prefTierForPosition(i+1);r.supportTier=r.tier;});
  prefLog('京都府代表として全国47位から参戦。第1週の資金提供が初期資金になります。','success');
  prefLog('マジックカードの初期配布は全代表0枚です。作成済みのマジック原本はガチャ候補として残ります。','info');
  prefLog(`初期配布完了：キャラカード原本${units.length}枚。${units.length<240?'必要枠に満たないため、初期配布に限り複製を許可。初期ガチャのキャラカードは0枚です。':'初期配布後のキャラカードはガチャに残ります。'}`,'info');
  prefEnsureCampaignAIConfig();
  prefOpenWeek();
  prefSave().then(()=>{prefSyncCampaignClones();prefRenderAll();if(campaignState?.pendingAcquisitionQueue?.length)prefStartNextQueuedAcquisition();}).catch(console.error);
  return state;
}

async function prefLoadState() {
  const rec=await getFromStore('settings',PREF_STATE_KEY);
  campaignState=rec?.value||null;
  if(campaignState && (!campaignState.regions || !campaignState.instances)) campaignState=null;
  if(campaignState){
    // Restore an old save safely: outstanding negative balances are resolved before
    // any turn can advance or the next funding week can add income.
    for(const region of Object.values(campaignState.regions))prefResolveNegativeFunds(region,'load-recovery');
    campaignState.pendingAcquisitionQueue=Array.isArray(campaignState.pendingAcquisitionQueue)?campaignState.pendingAcquisitionQueue:[];
    campaignState.pendingGachaContinueKey=campaignState.pendingGachaContinueKey||null;
    // Migrate older saves that granted every authored magic card to the player before the 50-card cap.
    // Keep the oldest 50 in the holder and queue each excess card for the same player-chosen listing flow.
    const legacyMagicOverflow=prefOwnedMagics(PREF_PLAYER_ID).slice(PREF_MAGIC_LIMIT);
    for(const inst of legacyMagicOverflow){
      inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.listedAtAbs=null;inst.marketExpiresAbs=null;inst.expiresAtAbs=null;inst.acquiredAtAbs=null;inst.capacityQueueReason='capacity-migration';
      if(!campaignState.pendingAcquisitionQueue.includes(inst.id))campaignState.pendingAcquisitionQueue.push(inst.id);
    }
    if(legacyMagicOverflow.length)prefLog(`旧セーブのマジックカード所持数を上限${PREF_MAGIC_LIMIT}枚に移行しました。超過分はカードを選んで市場へ出品できます。`,'info');
    // Preserve cards from older saves, but enforce the new ★5 holder limits by listing excess cards.
    prefEnforceOwnedStar5Caps();
    // Existing campaign saves may still contain low-rank entries in the gacha pool; the draw filter
    // below excludes them without deleting cards already owned in an older save.
    prefSyncCampaignClones();
    prefEnsureCampaignAIConfig();
    // Cards authored after the campaign started are immediately placed in the shared character gacha.
    const known=new Set(Object.values(campaignState.instances).map(i=>String(i.templateId)));
    for(const t of prefCardTemplates().filter(c=>c.cardType==='unit'&&prefRankStars(c)>=3)){
      if(!known.has(String(t.id))){const inst=prefCreateInstance(t.id,'gacha',null,{source:'created-after-start'}); if(inst)prefLog(`新規キャラカード「${t.name}」がガチャに追加されました。`,'success');}
    }
    if(campaignState.turnProcessing) {
      const tx=campaignState.turnProcessing;
      if(tx.pairIndex==null)tx.pairIndex=0;
      // Migrate previous releases' early player-preview pause into a rank-ordered queue.
      // Preserve the draft lineup but ask for confirmation only when Kyoto's rank slot is reached.
      if(tx.stage==='player-preview'&&!Array.isArray(tx.resolutionQueue)){
        tx.stage='battles';tx.playerLoadoutConfirmed=false;tx.currentPairId=null;
        tx.resolutionQueue=prefBuildTurnResolutionQueue(tx.actions||{},tx.pairs||[],tx.unmatched,!!tx.investigationsResolved);
        tx.resolutionIndex=0;
      }
      if(tx.stage==='battles'){
        // A reload can interrupt an AI simulation between its saved checkpoints; replay only
        // the not-yet-committed pair instead of leaving the transaction stuck as "simulating".
        for(const pair of tx.pairs||[])if(pair.status==='simulating')pair.status='pending';
        for(const step of tx.resolutionQueue||[])if(step.status==='processing')step.status='pending';
        prefRecoverPendingBattlePreview(tx, true);
      }
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
      for(const t of prefCardTemplates().filter(c=>c.cardType==='unit'&&prefRankStars(c)>=3)){
        // A template that existed as ★1–★2 when the campaign began may become eligible after editing.
        // If no instance was created for it earlier, add it once it reaches ★3 or higher.
        if(!known.has(String(t.id))){prefCreateInstance(t.id,'gacha',null,{source:'created-after-start'});prefLog(`キャラカード「${t.name}」が★3以上になったため、ガチャに追加されました。`,'success');}
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
// Use the visible current ranking as the single source of truth for turn order.
// Lower position number means a higher-ranked representative. RankingOrder breaks ties stably.
function prefTurnOrderRegions() {
  if(!campaignState?.regions)return [];
  const savedOrder=Array.isArray(campaignState.rankingOrder)?campaignState.rankingOrder:[];
  const orderIndex=new Map(savedOrder.map((id,index)=>[String(id),index]));
  return Object.values(campaignState.regions).slice().sort((a,b)=>{
    const ia=orderIndex.has(String(a.id))?orderIndex.get(String(a.id)):Number.MAX_SAFE_INTEGER;
    const ib=orderIndex.has(String(b.id))?orderIndex.get(String(b.id)):Number.MAX_SAFE_INTEGER;
    const ra=Number(a.rankPosition)>0?Number(a.rankPosition):ia+1;
    const rb=Number(b.rankPosition)>0?Number(b.rankPosition):ib+1;
    return ra-rb || ia-ib || String(a.prefecture||a.id).localeCompare(String(b.prefecture||b.id),'ja');
  });
}
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
  // Battle-loss is settled as one transaction (money + card loss + match record).
  // All other money changes resolve insolvency immediately at this posting.
  if(reason!=='battle-loss')prefResolveNegativeFunds(r,reason);
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
  // Never allow the next scheduled subsidy to silently rescue a bankrupt
  // representative, even when recovering an older saved turn.
  for(const region of Object.values(campaignState.regions||{}))prefResolveNegativeFunds(region,'week-start');
  if(campaignState.gameOver)return;
  prefExpireMarket(); prefExpireOwnedUnits(); prefApplyFundingIfNeeded();
  prefTurnStartAbs=prefAbsTurn();
}

function prefCardStrategyScore(region,card) {
  if(!region||!card)return 0;
  const profile=prefAIProfileForRegion(region),cp=prefCardProfile(card),tags=cp.tags;
  const weights={
    combo:{passive_chain:2.0,extra_effect:2.2,status_condition:1.5,ap_supply:1.1},
    rush:{damage:2.6,attack_role:1.8,attack_speed_buff:1.7,heavy_cost:0.7},
    heavy:{heavy_cost:2.6,damage:1.8,ap_supply:1.1},
    basic:{attack_role:2.3,low_cost:1.1,high_rank:0.5},
    ap_efficiency:{ap_supply:3.0,low_cost:1.5,heavy_cost:-0.4},
    sustain:{healing:2.2,shield_defense:2.4,hp_role:1.0},
    status:{status_debuff:2.3,status_condition:2.2,extra_effect:0.8},
    buff:{attack_speed_buff:2.6,damage:0.8,passive_chain:0.5},
    protect:{shield_defense:2.2,healing:1.4,target_control:1.6},
    extra:{extra_effect:2.7,status_debuff:0.8},
    passive:{passive_chain:2.8,extra_effect:1.0},
    attribute:{attribute_support:2.8,attack_speed_buff:0.6,shield_defense:0.6},
    adaptive:{healing:0.4,shield_defense:0.4,damage:0.4,ap_supply:0.4},
    counter:{shield_defense:1.8,healing:1.3,status_debuff:1.5,target_control:1.0}
  };
  const one=id=>{const row=weights[id]||{};let val=0;for(const [tag,w] of Object.entries(row))if(tags.has(tag))val+=w;return val;};
  // Main strategy strongly shapes evaluation; secondary strategies are smaller but meaningful influences.
  let score=one(profile.primaryStrategy)+profile.secondaryStrategies.reduce((sum,id)=>sum+one(id)*0.34,0);
  // A card's raw role is still more important than stylistic preference for low card-IQ rivals.
  return score*(0.90+0.10*(profile.cardIQ/100));
}

function prefCardScoreForRegion(region, inst) {
  const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(!c)return 0;
  if(!prefAiMagicFitsRoster(region,c))return -Infinity;
  const profile=prefAIProfileForRegion(region);const personality=region.personality||'careful';
  let score=prefCardIntrinsicScore(region,c)+prefCardStrategyScore(region,c)+prefCardPreferenceScore(region,c)+prefCardSynergyScore(region,c)+prefAIPlanFitScore(region,c);
  // The operational personality is separate from combat style and numeric card-building IQ.
  if(personality==='trickster')score+=(c.skills||[]).length*0.8;
  else if(personality==='collector')score+=Math.log10(Math.max(10000,prefCardValue(c)))*0.35;
  else if(personality==='scout')score+=(c.skills||[]).filter(s=>s.type==='passive').length*0.8;
  else if(personality==='aggressive')score+=Math.min(4,Number(c.stats?.atk||0)/2200);
  else score+=Math.min(3,Number(c.stats?.hp||0)/7000);
  const focus=region.cardPreference||'rank-value';
  if(focus==='highest-rank')score+=prefRankStars(c)*1.5;
  else if(focus==='strongest-stats')score+=(Number(c.stats?.hp||0)/2200)+(Number(c.stats?.atk||0)/1300);
  else if(focus==='skill-effects')score+=(c.skills||[]).length*1.2+(c.skills||[]).filter(x=>x.type==='passive').length*1.4;
  else if(focus==='attribute-diversity'){
    const existing=prefOwnedUnits(region.id).filter(x=>String(x.id)!==String(inst.id)).map(x=>prefCardForInstance(x.id)||prefTemplate(x.templateId)).filter(Boolean);
    const attr=String(c.mainAttr||'');score += (attr && !existing.some(x => String(x.mainAttr || '') === attr)) ? 1.5 : 0;
  }
  if(c.cardType==='magic'&&c.magicType==='skill')score+=prefAiSkillCardFitBonus(region,c);
  return score + prefCardEstimateError(profile.cardIQ);
}

function prefAIQuickRosterQuality(region, unitInstances) {
  const profile=prefAIProfileForRegion(region);
  const entries=(unitInstances||[]).map(inst=>({inst,card:prefCardForInstance(inst?.id)||prefTemplate(inst?.templateId)})).filter(x=>x.card);
  if(!entries.length)return -1000;
  const cp=new Map(entries.map(x=>[String(x.inst.id),prefCardProfile(x.card)]));
  const base=new Map(entries.map(x=>[String(x.inst.id),prefCardIntrinsicScore(region,x.card)+prefCardStrategyScore(region,x.card)+prefCardPreferenceScore(region,x.card)+prefAIPlanFitScore(region,x.card)]));
  const combos=[];
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)for(let k=j+1;k<entries.length;k++)for(let z=k+1;z<entries.length;z++){
    const group=[entries[i],entries[j],entries[k],entries[z]],profiles=group.map(x=>cp.get(String(x.inst.id))||prefCardProfile(x.card));
    if(profiles.filter(x=>x.rank===5).length>PREF_BATTLE_RANK5_LIMIT)continue;
    let score=group.reduce((sum,x)=>sum+(base.get(String(x.inst.id))||0),0);
    for(let a=0;a<group.length;a++)for(let b=a+1;b<group.length;b++)score+=prefPairSynergyRaw(group[a].card,group[b].card,profile)*(0.88+0.12*profile.cardIQ/100)*1.25;
    const groupCards=group.map(x=>x.card);
    const plan=prefAIActiveTrioPlanEvaluation(groupCards,profiles,profile);score+=plan.score;
    // Acquisition/upgrade evaluation must prize the same opening synergy as battle selection;
    // otherwise a rival could repeatedly buy high-priced but incoherent individual cards.
    const kits=groupCards.map(prefOpeningKit);
    score+=prefConcreteOpeningSynergy(groupCards,kits).score*1.4+kits.reduce((v,k)=>v+k.value*1.25,0);
    const roles=new Set(profiles.map(x=>x.role));
    if(roles.has('attacker'))score+=2.8;if(roles.has('defender'))score+=3;if(roles.has('controller'))score+=2.6;
    const ids=new Set(group.map(x=>String(x.inst.id)));
    const reserves=entries.filter(x=>!ids.has(String(x.inst.id))).map(x=>({x,p:cp.get(String(x.inst.id))||prefCardProfile(x.card),base:base.get(String(x.inst.id))||0}));
    let reserveFiveCount=profiles.filter(x=>x.rank===5).length;
    reserves.sort((a,b)=>{
      const value=o=>o.base*0.22+Math.min(5,o.p.deployPassiveValue*0.85)+group.reduce((sum,g)=>sum+prefPairSynergyRaw(o.x.card,g.card,profile)*0.20,0)+((roles.has(o.p.role)&&['attacker','defender'].includes(o.p.role))?1.3:0);
      return value(b)-value(a);
    });
    const legalReserves=[];
    for(const item of reserves){if(legalReserves.length>=1)break;if(item.p.rank===5&&reserveFiveCount>=PREF_BATTLE_RANK5_LIMIT)continue;legalReserves.push(item);if(item.p.rank===5)reserveFiveCount++;}
    score+=legalReserves.reduce((sum,x)=>sum+x.base*0.12+Math.min(2,x.p.deployPassiveValue*0.25),0);
    combos.push({score,plan});
  }
  if(!combos.length)return entries.reduce((sum,x)=>sum+(base.get(String(x.inst.id))||0),0);
  combos.sort((a,b)=>b.score-a.score);
  return combos[0].score;
}
function prefAiReplacementChoice(region, unitInstances, incomingInst) {
  if(!unitInstances.length)return null;
  const personality=region.personality||'careful';
  const effectiveScore=inst=>{
    const card=prefCardForInstance(inst?.id)||prefTemplate(inst?.templateId);
    return prefCardScoreForRegion(region,inst)+prefAiRosterComplementBonus(region,card)*0.55;
  };
  let scored=unitInstances.map(inst=>({inst,score:effectiveScore(inst)}));
  if(personality==='aggressive')scored.sort((a,b)=>{const ca=prefCardForInstance(a.inst.id)||prefTemplate(a.inst.templateId),cb=prefCardForInstance(b.inst.id)||prefTemplate(b.inst.templateId);return Number(ca?.stats?.atk||0)-Number(cb?.stats?.atk||0)||a.score-b.score;});
  else if(personality==='collector')scored.sort((a,b)=>prefCardValue(prefCardForInstance(a.inst.id)||prefTemplate(a.inst.templateId))-prefCardValue(prefCardForInstance(b.inst.id)||prefTemplate(b.inst.templateId))||a.score-b.score);
  else scored.sort((a,b)=>a.score-b.score);
  const weakest=scored[0];if(!weakest)return null;
  const incomingScore=incomingInst?effectiveScore(incomingInst):-Infinity;
  if(incomingInst && incomingScore<=weakest.score && personality!=='collector')return incomingInst.id;
  if(incomingInst && personality==='collector' && prefValueFromInstance(incomingInst)<=prefCardValue(prefCardForInstance(weakest.inst.id)||prefTemplate(weakest.inst.templateId)))return incomingInst.id;
  return weakest.inst.id;
}
function prefAiMagicReplacementChoice(region, magicInstances, incomingInst) {
  if(!prefAiMagicFitsRoster(region,prefCardForInstance(incomingInst?.id)||prefTemplate(incomingInst?.templateId)))return incomingInst?.id||null;
  if(!magicInstances.length)return incomingInst?.id||null;
  const scored=magicInstances.map(inst=>({inst,score:prefCardScoreForRegion(region,inst)})).sort((a,b)=>a.score-b.score);
  const weakest=scored[0];
  if(!weakest)return incomingInst?.id||null;
  return prefCardScoreForRegion(region,incomingInst)>weakest.score?weakest.inst.id:incomingInst.id;
}

function prefAcquireInstance(regionId, instId, options={}) {
  const region=prefRegion(regionId);const inst=campaignState?.instances?.[instId];if(!region||!inst)return false;
  const card=prefCardForInstance(instId)||prefTemplate(inst.templateId); if(!card)return false;
  if(inst.kind==='magic'){
    if(!region.isPlayer&&!prefAiMagicFitsRoster(region,card)){
      prefListInstance(inst,regionId,'no-eligible-skill-caster');
      return true;
    }
    const ownedMagics=prefOwnedMagics(regionId);
    const already=ownedMagics.some(x=>String(x.templateId)===String(inst.templateId));
    if(already){prefListInstance(inst,regionId,'duplicate-gacha');prefLog(`${region.prefecture}は重複したマジックカード「${card.name}」を市場へ出品しました。`,'info');return true;}
    if(ownedMagics.length>=PREF_MAGIC_LIMIT){
      if(region.isPlayer){
        inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.listedAtAbs=null;inst.marketExpiresAbs=null;inst.expiresAtAbs=null;
        campaignState.pendingAcquisition={kind:'magic',instanceId:instId,regionId,reason:options.reason||'acquire'};
        if(!options.deferCapacityModal)prefShowReplaceModal();
        return 'pending';
      }
      const replacement=prefAiMagicReplacementChoice(region,ownedMagics,inst);
      if(replacement===instId){prefListInstance(inst,regionId,'ai-rejected-magic');prefRecordAIThought(region,'マジック構築','新しいマジックの採用を見送り',['マジック所持上限30枚のため既存カードと比較','新カードの推定価値が最も弱い所持カードを下回った']);return true;}
      const old=campaignState.instances[replacement];if(old)prefListInstance(old,regionId,'ai-magic-replacement');
    }
    prefSetInstanceOwner(inst,regionId,false);inst.expiresAtAbs=null;
    return true;
  }
  const units=prefOwnedUnits(regionId);
  if(prefRankStars(card)===5){
    const fiveStars=units.filter(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))===5);
    const limit=prefFiveStarLimit(region);
    if(fiveStars.length>=limit){
      if(region.isPlayer){
        inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.listedAtAbs=null;inst.marketExpiresAbs=null;inst.expiresAtAbs=null;inst.acquiredAtAbs=null;
        campaignState.pendingAcquisition={kind:'unit',instanceId:instId,regionId,reason:'rank5-limit'};
        if(!options.deferCapacityModal)prefShowReplaceModal();return 'pending';
      }
      const chosen=prefAiReplacementChoice(region,fiveStars,inst);
      if(chosen===instId){prefListInstance(inst,regionId,'ai-rank5-limit-rejected');prefLog(`${region.prefecture}は★5所持上限のため「${card.name}」の採用を見送りました。`,'info');return true;}
      const old=campaignState.instances[chosen];if(old)prefListInstance(old,regionId,'ai-rank5-replacement');
      prefSetInstanceOwner(inst,regionId,true);return true;
    }
  }
  if(units.length>= (region.isPlayer?PREF_UNIT_LIMIT:PREF_RIVAL_UNIT_LIMIT)){
    if(region.isPlayer){
      inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.expiresAtAbs=null;
      campaignState.pendingAcquisition={kind:'unit',instanceId:instId,regionId,reason:options.reason||'acquire'};
      if(!options.deferCapacityModal)prefShowReplaceModal(); return 'pending';
    }
    const chosen=prefAiUnitReplacementChoice(region,units,inst);
    if(chosen===instId){prefListInstance(inst,regionId,'ai-rejected-card');return true;}
    const old=campaignState.instances[chosen];if(old)prefListInstance(old,regionId,'ai-replacement');
  }
  prefSetInstanceOwner(inst,regionId,true);
  return true;
}
function prefShowReplaceModal() {
  const pending=campaignState?.pendingAcquisition;if(!pending)return;
  const inst=campaignState.instances[pending.instanceId],card=prefCardForInstance(pending.instanceId)||prefTemplate(inst?.templateId);
  const kind=pending.kind||inst?.kind||'unit';
  const allOwned=kind==='magic'?prefOwnedMagics(pending.regionId||PREF_PLAYER_ID):prefOwnedUnits(pending.regionId||PREF_PLAYER_ID);
  const owned=pending.reason==='rank5-limit'&&kind==='unit'?allOwned.filter(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))===5):allOwned;
  const isMagic=kind==='magic';
  if(!inst||!card){campaignState.pendingAcquisition=null;return;}
  const entries=[...owned.map(x=>({id:x.id,card:prefCardForInstance(x.id)||prefTemplate(x.templateId),incoming:false})),{id:inst.id,card,incoming:true}];
  const title=isMagic?'マジックカードが上限30枚です':pending.reason==='rank5-limit'?'★5カードは所持上限です':'カードホルダーがいっぱいです';
  const intro=pending.reason==='rank5-limit'
    ?`★5キャラ「<b class="text-amber-200">${prefEsc(card.name||'新カード')}</b>」を獲得しましたが、自分の★5所持上限は${prefFiveStarLimit(prefRegion(pending.regionId||PREF_PLAYER_ID))}枚です。★5カードだけから市場へ出品する1枚を選んでください。新カードを選ぶと新カード自体を市場へ出品します。`
    :isMagic?`新しいマジックカード「<b class="text-amber-200">${prefEsc(card.name||'新カード')}</b>」を受け取りました。マジックカードは最大${PREF_MAGIC_LIMIT}枚です。市場へ出品するカードを選んでください。新カードを選ぶと、新カード自体を出品します。`
    :`新しいキャラカード「<b class="text-amber-200">${prefEsc(card.name||'新カード')}</b>」を獲得しました。市場へ出すカードを選んでください。新しいカードを選ぶと、今回は受け取らずに市場へ出品します。`;
  const warning=!isMagic&&allOwned.length<=PREF_BATTLE_ACTIVE?'<div class="mt-3 rounded-lg bg-rose-950/60 border border-rose-500/40 p-3 text-xs text-rose-200">キャラカードが4枚未満になると対戦できません。先に補充してください。</div>':'';
  prefShowModal(title,`<p class="text-sm text-slate-300 mb-3">${intro}</p><div class="max-h-[62vh] overflow-y-auto pr-1"><div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${entries.map(x=>`<button data-pref-action="replace-held" data-id="${prefEsc(x.id)}" class="min-w-0 rounded-lg border ${x.incoming?'border-amber-500 bg-amber-950/30':'border-slate-700 bg-slate-900'} p-1 hover:border-amber-400"><div class="pointer-events-none">${prefCardDisplay(x.id,{small:true})}</div><div class="text-[10px] ${x.incoming?'text-amber-200':'text-rose-300'} font-black mt-1">${x.incoming?'新カードを市場へ':'これを市場へ'}</div></button>`).join('')}</div></div>${warning}`,[]);
  document.getElementById('pref-modal-close-btn')?.classList.add('hidden');
}
function prefStartNextQueuedAcquisition() {
  if(!campaignState||campaignState.pendingAcquisition)return;
  const queue=Array.isArray(campaignState.pendingAcquisitionQueue)?campaignState.pendingAcquisitionQueue:[];
  while(queue.length){
    const id=queue.shift(),inst=campaignState.instances?.[id];
    if(!inst||inst.zone!=='pending')continue;
    // キューに入っているカードも、表示直前に重複・所持上限を現在の状態で再判定する。
    // 先に出たキャラカードの交換が終わるまで待っていた抱き合わせマジックは、
    // マジック所持数が30枚未満なら交換を求めず、そのまま受け取れるようにする。
    const result=prefAcquireInstance(PREF_PLAYER_ID,id,{reason:inst.capacityQueueReason||'gacha-bundle',deferCapacityModal:true});
    if(result==='pending'){
      // prefAcquireInstance が実際に上限超過を確認した場合だけ交換画面を出す。
      if(!campaignState.pendingAcquisition){
        campaignState.pendingAcquisition={kind:inst.kind,instanceId:id,regionId:PREF_PLAYER_ID,reason:inst.capacityQueueReason||'initial-capacity'};
      }
      campaignState.pendingAcquisitionQueue=queue;
      prefSave().catch(console.error);prefShowReplaceModal();return;
    }
    // 重複は市場へ、上限内のカードは所持へ移動済み。次の待機カードも確認する。
  }
  campaignState.pendingAcquisitionQueue=[];
  prefSave().catch(console.error);
}
async function prefCommitReplace(oldId) {
  const pending=campaignState?.pendingAcquisition;if(!pending)return;
  const old=campaignState.instances[oldId],newInst=campaignState.instances[pending.instanceId];
  if(!newInst)return;
  const regionId=pending.regionId||PREF_PLAYER_ID;
  if(pending.reason==='rank5-limit'&&String(oldId)!==String(newInst.id)&&(!old||prefRankStars(prefCardForInstance(old.id)||prefTemplate(old.templateId))!==5))return;
  const kind=pending.kind||newInst.kind||'unit';
  const label=kind==='magic'?'マジックカード':'キャラカード';
  if(String(oldId)===String(newInst.id)) {
    const card=prefCardForInstance(newInst.id)||prefTemplate(newInst.templateId);
    prefListInstance(newInst,regionId,'capacity-rejected');
    campaignState.pendingAcquisition=null;
    prefLog(`所持上限により、新しい「${card?.name||label}」は市場へ出品されました。`,'info');
  } else {
    const correctKind=kind==='magic'?'magic':'unit';
    if(!old||old.zone!=='owner'||old.ownerId!==regionId||old.kind!==correctKind)return;
    const oldCard=prefCardForInstance(oldId)||prefTemplate(old.templateId);
    prefListInstance(old,regionId,'capacity-replacement');
    prefSetInstanceOwner(newInst,regionId,true);
    campaignState.pendingAcquisition=null;
    prefLog(`「${oldCard?.name||label}」を市場へ出品し、新しい${label}をホルダーに加えました。`,'success');
  }
  delete newInst.capacityQueueReason;
  await prefSave();prefSyncCampaignClones();prefRenderAll();prefCloseModal();
  if(campaignState.pendingAcquisitionQueue?.length){prefStartNextQueuedAcquisition();return;}
  const continueKey=campaignState.pendingGachaContinueKey;
  if(continueKey){campaignState.pendingGachaContinueKey=null;await prefSave();await prefPullGacha(continueKey);return;}
  if(pending.reason==='auto-buy-magic'&&campaignState.turnProcessing&&(campaignState.turnProcessing.stage==='awaiting-capacity'||campaignState.turnProcessing.stage==='matching')){
    const tx=campaignState.turnProcessing;const action=tx.resumePlayerAction||tx.actions?.[PREF_PLAYER_ID];
    tx.stage='matching';delete tx.resumePlayerAction;
    await prefSave();await prefStartTurnAfterAutoBuy(action,tx);return;
  }
  if(pending.reason==='capacity-migration'&&campaignState.turnProcessing){
    const tx=campaignState.turnProcessing;
    if(tx.stage==='awaiting-capacity'){
      const action=tx.resumePlayerAction||tx.actions?.[PREF_PLAYER_ID];tx.stage='matching';delete tx.resumePlayerAction;
      await prefSave();await prefStartTurnAfterAutoBuy(action,tx);return;
    }
    if(tx.stage==='player-preview'){prefRenderDashboard();prefEnsurePreviewResumeButton();return;}
    await prefContinueTurn();
  }
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
  if(battleBtn){battleBtn.disabled=lastBattle;battleBtn.classList.toggle('opacity-40',battleBtn.disabled);battleBtn.classList.toggle('cursor-not-allowed',battleBtn.disabled);battleBtn.innerHTML=`<div class="text-2xl">⚔️</div><div class="font-black text-rose-200 mt-2">対戦コマンド</div><div class="text-xs text-slate-400 mt-1">先に対戦相手を決め、その後で編成を確定</div><div class="text-[10px] text-rose-300 mt-3">${lastBattle?'連戦禁止：今週は対戦できません':prefOwnedUnits(PREF_PLAYER_ID).length<PREF_BATTLE_ACTIVE?'キャラカード4枚未満：補充せず対戦を選ぶとゲームオーバー':'4ターンに1回以上の対戦が必要'}</div>`;}
  if(investBtn){investBtn.disabled=mustBattle;investBtn.classList.toggle('opacity-40',mustBattle);investBtn.classList.toggle('cursor-not-allowed',mustBattle);investBtn.innerHTML=`<div class="text-2xl">🔎</div><div class="font-black text-cyan-200 mt-2">調査コマンド</div><div class="text-xs text-slate-400 mt-1">他の代表のカードや行動傾向を調査</div><div class="text-[10px] text-cyan-300 mt-3">${mustBattle?'3ターン連続未対戦：今週は対戦必須':'成功率は相手とのランク差で変動'}</div>`;}
  const summary=document.getElementById('pref-week-summary');
  if(summary){summary.innerHTML=`<div class="flex justify-between gap-2"><span class="text-slate-400">代表</span><b class="text-white">${prefEsc(p.repName)}</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">所持キャラ</span><b class="text-amber-200">${units.length} / 10枚</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">マジック</span><b class="text-violet-200">${magics.length}枚</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">連続未対戦</span><b class="${mustBattle?'text-rose-300':'text-white'}">${p.nonBattleStreak||0} / 3ターン</b></div><div class="flex justify-between gap-2"><span class="text-slate-400">通算成績</span><b class="text-white">${p.allTimeStats.wins||0}勝 ${p.allTimeStats.draws||0}分 ${p.allTimeStats.losses||0}敗</b></div><p class="text-[10px] leading-relaxed text-slate-500 border-t border-slate-800 pt-2 mt-2">次年度の資金提供額は、今年度最終ランキングのランクにより決定します。</p>`;}
  const ownedSummary=document.getElementById('pref-owned-summary');if(ownedSummary){ownedSummary.innerHTML=units.slice(0,5).map(i=>`<div>${prefCardDisplay(i.id,{small:true})}</div>`).join('')||'<p class="col-span-5 text-xs text-slate-500">キャラカードを所持していません。</p>';ownedSummary.querySelectorAll('[data-pref-action="details"]').forEach(el=>el.addEventListener('click',ev=>{ev.stopPropagation();prefOpenCardDetail(el.dataset.id);}));}
  const logs=document.getElementById('pref-recent-log');if(logs){logs.innerHTML=(campaignState.logs||[]).slice(0,8).map(l=>`<div class="flex gap-2 border-b border-slate-800/70 pb-2"><span class="shrink-0 text-amber-300 font-black">${l.year||campaignState.year}/${l.week||campaignState.week}</span><span class="text-slate-300 leading-relaxed">${prefEsc(l.message)}</span></div>`).join('')||'<p class="text-slate-500">まだ出来事はありません。</p>';}
  const waitingForLoadout=campaignState.turnProcessing?.stage==='player-preview';
  const pendingPanel=document.getElementById('pref-pending-battle-panel');if(pendingPanel)pendingPanel.classList.toggle('hidden',!waitingForLoadout);
  const status=document.getElementById('pref-command-status');if(status)status.textContent=waitingForLoadout?'対戦相手決定・編成確定待ち':campaignState.turnProcessing?'ターン処理中':p.lastCommandAbs===prefAbsTurn()?(p.lastCommand==='battle'?'対戦コマンドを選択済み':'調査コマンドを選択済み'):'コマンド未選択';
  document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');
  const processing=!!campaignState.turnProcessing;
  document.getElementById('pref-turn-progress')?.classList.toggle('hidden',!processing||waitingForLoadout);
  if(processing){document.getElementById('pref-command-panel')?.classList.add('hidden');} else {document.getElementById('pref-command-panel')?.classList.remove('hidden');}
}

function prefRenderHolder() {
  if(!campaignState){prefShowNoGame('pref-holder-list');return;}
  const units=prefOwnedUnits(PREF_PLAYER_ID),magics=prefOwnedMagics(PREF_PLAYER_ID);
  const uc=document.getElementById('pref-holder-unit-count'),mc=document.getElementById('pref-holder-magic-count');if(uc)uc.textContent=`${units.length}/10 · ★5 ${prefOwnedFiveStarUnits(PREF_PLAYER_ID).length}/2`;if(mc)mc.textContent=`${magics.length}/${PREF_MAGIC_LIMIT}`;
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
  const fundsBanner=document.getElementById('pref-gacha-funds');if(fundsBanner)fundsBanner.textContent=`所持金：${prefFormatMoney(p?.funds||0)}`;
  const eligible=prefEligibleGachaUnitInstances();const counts=[3,4,5].map(rank=>eligible.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===rank).length);
  const pool=document.getElementById('pref-gacha-pool-counts');if(pool){pool.className='grid grid-cols-3 gap-2';pool.innerHTML=counts.map((n,i)=>`<div class="rounded-xl border border-amber-500/20 bg-slate-900 p-2 text-center"><div class="text-[9px] text-slate-400">★${i+3}</div><div class="text-amber-200 font-black text-lg">${n}</div><div class="text-[9px] text-slate-500">残存</div></div>`).join('');}
  const allowed=[];const tier=p.tier||'E';if(['S','A','B'].includes(tier))allowed.push('A');if(['S','A','B','C','D'].includes(tier))allowed.push('B');allowed.push('C');
  list.innerHTML=allowed.map(key=>{const g=PREF_GACHA[key];const unlocked=(key==='A'?['S','A','B'].includes(tier):key==='B'?['S','A','B','C','D'].includes(tier):true);const probs=g.odds.map(o=>o.kind==='magic'?`マジックカード ${o.weight}%`:`${o.band==='lower'?'下位':o.band==='upper'?'上位':''}★${o.rank} ${o.weight}%`).join(' / ');
    return `<div class="relative overflow-hidden rounded-2xl border ${key==='A'?'border-amber-400/50':key==='B'?'border-cyan-400/40':key==='C'?'border-violet-400/40':'border-purple-500/40'} bg-gradient-to-br from-slate-900 to-slate-950 p-4"><div class="absolute -right-4 -top-4 text-7xl opacity-10">✨</div><div class="relative"><div class="text-[10px] text-slate-400 font-bold">CLASS ${key}</div><h3 class="text-lg font-black ${key==='A'?'text-amber-200':key==='B'?'text-cyan-200':key==='C'?'text-violet-200':'text-purple-200'} mt-1">${prefEsc(g.label)}</h3><div class="text-2xl font-black text-white mt-2">${prefFormatMoney(g.price)}</div><div class="text-[10px] text-slate-400 mt-2 leading-relaxed">排出率：${prefEsc(probs)}</div><button data-pref-action="pull-gacha" data-id="${prefEsc(key)}" class="mt-4 w-full py-3 rounded-xl font-black text-sm ${unlocked?'bg-violet-600 hover:bg-violet-500 text-white':'bg-slate-800 text-slate-500 cursor-not-allowed'}" ${unlocked?'':'disabled'}>1回引く</button></div></div>`;
  }).join('');
  document.getElementById('pref-gacha-note').textContent=`現在の所持金：${prefFormatMoney(p.funds)}。現在の京都府ランク：${tier}。AランクガチャはBランク以上、BランクガチャはDランク以上で解放。ガチャ1回につき表示確率に従ってキャラまたはマジックを1枚獲得し、さらにマジック1枚が確定で付きます。マジックは所持上限${PREF_MAGIC_LIMIT}枚を超えると入れ替えが必要です。`;
}
function prefRenderRanking() {
  if(!campaignState){const b=document.getElementById('pref-ranking-body');if(b)b.innerHTML='<tr><td colspan="7" class="p-8 text-center text-slate-500">ゲームを開始してください。</td></tr>';return;}
  const rows=prefCurrentRegionRankList();const p=prefPlayerRegion();
  document.getElementById('pref-ranking-header').innerHTML=`<div class="flex flex-wrap justify-between gap-2"><span>第${campaignState.year}年度・第${campaignState.week}週</span><span>京都府：<b class="text-amber-200">${prefRankLabel(p)} / ランク${p.tier}</b></span><span>年間資産額は資金提供を含む収支指標</span></div>`;
  document.getElementById('pref-ranking-body').innerHTML=rows.map((r,i)=>{
    const avatar=prefRegionIconUrl(r);
    const avatarHtml=avatar?`<img src="${prefEsc(avatar)}" alt="" class="w-full h-full object-cover" onerror="this.parentElement.textContent='🏯';this.remove()">`:'🏯';
    return `<tr class="${r.id===PREF_PLAYER_ID?'bg-amber-950/25':''}"><td class="p-3 font-black text-amber-200 whitespace-nowrap">${prefEsc(prefRankLabel(r))}</td><td class="p-3 font-bold whitespace-nowrap"><div class="flex items-center gap-2"><span class="w-8 h-8 rounded-full overflow-hidden bg-slate-950 border border-slate-700 flex-shrink-0 inline-flex items-center justify-center">${avatarHtml}</span><span>${prefEsc(r.prefecture)} ${r.id===PREF_PLAYER_ID?'<span class="text-[9px] text-amber-300">PLAYER</span>':''}</span></div></td><td class="p-3 text-slate-300 whitespace-nowrap">${prefEsc(r.repName)}</td><td class="p-3 text-right tabular-nums ${Number(r.yearStats?.assetMetric||0)<0?'text-rose-300':'text-white'}">${prefFormatMoney(r.yearStats?.assetMetric||0)}</td><td class="p-3 text-right text-cyan-200 tabular-nums">${prefEsc(prefFormatWinRate(r))}</td><td class="p-3 text-center">${prefTierBadge(r.tier)}</td><td class="p-3 text-center">${r.id===PREF_PLAYER_ID?'—':`<button data-pref-action="ai-thoughts" data-id="${prefEsc(r.id)}" class="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-800 text-[10px] text-cyan-200 font-bold whitespace-nowrap">AI思考</button>`}</td></tr>`;
  }).join('');
}
function prefShowAIThoughts(regionId) {
  const region=prefRegion(regionId);if(!region)return;
  const playerKnowsCards=(id)=>id===PREF_PLAYER_ID||(campaignState?.investigations||[]).some(x=>x.success&&x.targetPrefecture===prefRegion(id)?.prefecture&&['cards','both'].includes(x.topic));
  const subjectCardsKnown=playerKnowsCards(regionId);
  const profile=prefAIProfileForRegion(region);const main=PREF_AI_STRATEGIES.find(x=>x.id===profile.primaryStrategy)?.label||profile.primaryStrategy;
  const secondary=profile.secondaryStrategies.map(id=>PREF_AI_STRATEGIES.find(x=>x.id===id)?.label||id);
  const decisions=(region.aiMemory?.decisions||[]).slice(0,12);
  const opponentEntries=Object.entries(region.aiMemory?.opponents||{}).sort((a,b)=>(b[1].lastSeenAbs||0)-(a[1].lastSeenAbs||0)).slice(0,5);
  const timeline=decisions.map(d=>`<article class="rounded-lg border border-slate-800 bg-slate-950 p-3"><div class="flex flex-wrap justify-between gap-2"><b class="text-cyan-200 text-sm">${prefEsc(!subjectCardsKnown&&['カード購入','マジック購入','ガチャ'].includes(d.kind)?`${d.kind}（カード名は未公開）`:d.title||d.kind)}</b><span class="text-[10px] text-slate-500">${d.year||campaignState.year}年 ${d.week||campaignState.week}週 · ${prefEsc(d.kind||'判断')}</span></div><ul class="list-disc pl-5 mt-2 space-y-1 text-xs text-slate-300">${(d.reasons||[]).map(r=>`<li>${prefEsc(!subjectCardsKnown&&String(r).startsWith('主力候補：')?'主力カードを活かす計画':r)}</li>`).join('')}</ul>${d.details?.activeNames?.length?`<div class="text-[10px] text-amber-200 mt-2">${subjectCardsKnown?'選出：'+d.details.activeNames.map(prefEsc).join('、'):'出撃候補を評価（カード名は未公開）'}</div>`:''}${d.details?.cardName&&subjectCardsKnown?`<div class="text-[10px] text-amber-200 mt-2">対象カード：${prefEsc(d.details.cardName)}</div>`:''}${d.details?.alternatives?.length?`<div class="mt-2 rounded bg-slate-900 p-2 text-[10px] text-slate-300"><b>比較した候補：</b>${subjectCardsKnown?d.details.alternatives.map(a=>`${(a.names||[]).map(prefEsc).join('・')}（評価 ${prefEsc(a.score)}${a.scenarioMean!=null?` · 想定戦況平均 ${prefEsc(a.scenarioMean)}`:''}）`).join(' ／ '):`カード名を伏せた${d.details.alternatives.length}案を比較`}</div>`:''}${d.details?.myActions?.length?`<div class="mt-2 text-[10px] text-cyan-100"><b>実行行動：</b>${subjectCardsKnown?d.details.myActions.map(prefEsc).join(' ／ '):'実行行動を記録済み（カード名は未公開）'}</div>`:''}${d.details?.plans?.length?`<div class="mt-2 space-y-1 text-[10px] text-cyan-100"><b>行動計画：</b>${subjectCardsKnown?d.details.plans.map(p=>`<div>第${prefEsc(p.turn)}ターン：${(p.actions||[]).map(prefEsc).join(' ／ ')}</div>`).join(''):'行動計画を記録済み（カード名は未公開）'}</div>`:''}</article>`).join('');
  const memories=opponentEntries.map(([id,m])=>{const intel=prefGetOpponentIntel(region,id);return `<div class="rounded-lg bg-slate-950 border border-slate-800 p-3"><div class="font-bold text-sm text-white">${prefEsc(m.opponentName||prefRegion(id)?.repName||id)}</div><div class="text-[10px] text-slate-400 mt-1">対戦${m.matches||0}回 · ${m.wins||0}勝 ${m.losses||0}敗 ${m.draws||0}分 · 信頼度 ${Math.round((intel?.confidence||0)*100)}% · 最終情報から${intel?.age??'—'}週</div><div class="text-xs text-slate-300 mt-2">情報源：${intel?.source==='scouting'?'調査情報':'過去の対戦で観測'}${intel?.topic==='behavior'&&intel?.behavior?` · ${prefEsc(intel.behavior)}`:''}</div><div class="text-xs text-slate-300 mt-2">観測カード：${playerKnowsCards(id)?((intel?.cards||m.opponentCards||[]).map(c=>prefEsc(c.name)).join('、')||'記録なし'):'未調査の相手カードは非公開'}</div><div class="text-xs text-slate-400 mt-1">主な行動：${playerKnowsCards(id)?(Object.entries(m.actionCounts||{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([n,c])=>`${prefEsc(n)}×${c}`).join('、')||'記録なし'):'過去の対戦行動を記録（詳細は調査後に表示）'}</div></div>`;}).join('');
  prefShowModal(`🧠 ${region.prefecture}・${region.repName}のAI思考`,`<div class="max-h-[75vh] overflow-y-auto space-y-4 pr-1"><section class="rounded-xl border border-indigo-500/30 bg-slate-950 p-3"><div class="font-black text-white text-lg">AI能力</div><div class="grid grid-cols-2 gap-2 mt-3"><div class="rounded-lg bg-slate-900 p-3"><div class="text-[10px] text-slate-400">戦術の賢さ</div><div class="text-2xl font-black text-emerald-200">${profile.tacticalIQ}/100</div></div><div class="rounded-lg bg-slate-900 p-3"><div class="text-[10px] text-slate-400">カード選び</div><div class="text-2xl font-black text-cyan-200">${profile.cardIQ}/100</div></div></div><div class="text-sm text-slate-300 mt-3">主戦術：<b>${prefEsc(main)}</b></div><div class="text-xs text-slate-400 mt-1">副戦術：${secondary.map(prefEsc).join('、')||'なし'}</div><div class="text-xs text-slate-400 mt-2">属性の好み（メイン）：${profile.mainAttrPriority.map(prefEsc).join(' ＞ ')||'指定なし'}</div><div class="text-xs text-slate-400 mt-1">属性の好み（サブ）：${profile.subAttrPriority.map(prefEsc).join(' ＞ ')||'指定なし'}</div><div class="text-xs text-slate-400 mt-1">効果の好み：${profile.effectPriority.map(id=>prefEsc(PREF_AI_EFFECT_PREFERENCES.find(x=>x.id===id)?.label||id)).join(' ＞ ')||'指定なし'}</div></section><section class="rounded-lg border border-emerald-500/20 bg-slate-950 p-3"><h4 class="font-black text-emerald-200 mb-2">長期構築計画</h4>${region.aiPlan?`<div class="text-sm text-slate-100 font-bold">${prefEsc(region.aiPlan.title||'デッキ全体の補完')}</div><div class="text-xs text-slate-400 mt-1">目標：${prefEsc(region.aiPlan.reason||'全体性能を維持')} · 評価信頼度 ${Math.round((region.aiPlan.confidence||0)*100)}%</div><div class="mt-2 space-y-1 text-xs text-slate-300">${(region.aiPlan.options||[]).map(o=>`<div>・${prefEsc(o.title)}（優先度 ${Math.round((o.priority||0)*10)/10}）</div>`).join('')}</div>`:'<div class="text-xs text-slate-500">まだ構築計画は作成されていません。</div>'}</section><section><h4 class="font-black text-amber-200 mb-2">最近の判断理由</h4><div class="space-y-2">${timeline||'<div class="text-xs text-slate-500">まだ判断記録がありません。行動・購入・対戦の節目で記録されます。</div>'}</div></section><section><h4 class="font-black text-cyan-200 mb-2">対戦相手の記憶</h4><div class="space-y-2">${memories||'<div class="text-xs text-slate-500">まだ対戦記憶がありません。</div>'}</div><p class="text-[10px] text-slate-500 mt-2">記憶の信頼度は観測回数と情報の古さに応じて扱います。非公開カードを直接読み取ることはありません。</p></section></div>`,[{label:'閉じる',action:'close-modal',style:'primary'}]);
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
  if(!campaignState||!tx)return false;
  if(tx.stage==='player-preview')return true;
  const playerAction=tx.actions?.[PREF_PLAYER_ID];
  if(playerAction?.type!=='battle'||!Array.isArray(tx.pairs))return false;
  const pair=tx.pairs.find(item=>(item.a===PREF_PLAYER_ID||item.b===PREF_PLAYER_ID)&&item.status!=='done');
  if(!pair)return false;
  // Do not jump ahead of higher-ranked actions after a reload. Recover the player's preview
  // only when their battle is the next unresolved item in the rank-ordered resolution queue.
  const queue=prefEnsureTurnResolutionQueue(tx);
  const next=queue[tx.resolutionIndex];
  if(next?.type!=='battle'||String(next.pairId)!==String(pair.id))return false;
  const pairIndex=tx.pairs.indexOf(pair);
  pair.status='pending';
  tx.stage='player-preview';tx.pairIndex=Math.max(0,pairIndex);
  tx.resolutionQueue[tx.resolutionIndex].status='pending';
  tx.currentPairId=null;
  const units=prefOwnedUnits(PREF_PLAYER_ID);
  const candidate=campaignState.draftLoadout||playerAction.loadout||prefDefaultLoadout(PREF_PLAYER_ID);
  campaignState.draftLoadout=prefNormalizeLoadoutSelection(candidate.active||[],candidate.reserve||[],units);
  if(!silent)prefLog('保存データの復旧：順位順の行動処理が京都府の対戦に到達したため、編成確認に戻しました。','warning');
  return true;
}

function prefEnsurePreviewResumeButton() {
  const button=document.getElementById('campaign-preview-resume');if(!button)return;
  // Keep the rescue control outside switchable views so navigation cannot orphan it.
  if(button.parentElement!==document.body)document.body.appendChild(button);
  const tx=campaignState?.turnProcessing;
  const waiting=tx?.stage==='player-preview';
  const nextStep=tx?prefNextTurnResolution(tx):null;
  const recoverable=!!tx && tx.stage!=='player-preview' && tx.stage==='battles' && !tx.playerLoadoutConfirmed && tx.actions?.[PREF_PLAYER_ID]?.type==='battle' && (tx.pairs||[]).some(pair=>(pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID)&&pair.status!=='done'&&nextStep?.type==='battle'&&String(nextStep.pairId)===String(pair.id)) && !campaignBattlePending;
  const processing=!!tx && !waiting && !recoverable && !campaignBattlePending;
  const currentView=document.querySelector('.view-section:not(.hidden)')?.id||'';
  const loadoutOpen=currentView==='view-prefecture'&&!document.getElementById('pref-battle-selection')?.classList.contains('hidden');
  const inlineReady=currentView==='view-prefecture'&&!document.getElementById('pref-pending-battle-panel')?.classList.contains('hidden');
  // On the main game screen the large inline action is clearer; elsewhere keep the floating action visible.
  const showFloating=waiting?!loadoutOpen&&!inlineReady:(recoverable||processing);
  button.classList.toggle('hidden',!showFloating);
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
  prefEnsurePreviewResumeButton();
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
  const warning=inst.kind==='unit'&&count<=PREF_BATTLE_ACTIVE?'<div class="mt-3 rounded-lg bg-rose-950/60 border border-rose-500/40 p-3 text-xs text-rose-200">キャラカードが4枚未満になると対戦できません。対戦コマンドを選ぶとゲームオーバーになります。先にガチャや市場で補充してください。</div>':'';
  prefShowModal('カードを市場へ出品',`<div class="flex flex-col sm:flex-row gap-4 items-start"><div class="w-36 sm:w-44 shrink-0 mx-auto sm:mx-0">${prefCardDisplay(id,{small:true})}</div><div class="min-w-0 w-full"><div class="font-black text-white">${prefEsc(card.name)}</div><div class="text-sm text-emerald-200 mt-2">出品価格：${prefFormatMoney(prefCardValue(card))}</div><p class="text-xs text-slate-400 mt-2">出品中はキャラカードの所持期限が進みません。5ターン以内に購入されなければ、キャラはガチャへ戻り、マジックは市場から消えます。</p>${warning}</div></div>`,[{label:'キャンセル',action:'close-modal',style:'slate'},{label:'出品する',action:'confirm-list-card',id,style:'primary'}]);
}
function prefListPlayerCard(id) {
  const inst=campaignState?.instances?.[id];if(!inst||inst.zone!=='owner'||inst.ownerId!==PREF_PLAYER_ID)return;
  const card=prefCardForInstance(id);if(!card)return;
  prefListInstance(inst,PREF_PLAYER_ID,'player-listing');prefLog(`「${card.name}」を${prefFormatMoney(prefCardValue(card))}で市場へ出品しました。`,'info');
  prefSave().then(()=>{prefRenderAll();switchView('pref-holder');}).catch(console.error);
}
function prefWithdrawListing(id) {
  const inst=campaignState?.instances?.[id];if(!inst||inst.zone!=='market'||inst.sellerRegionId!==PREF_PLAYER_ID)return;
  if(inst.kind==='magic'){
    if(prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId))){prefShowModal('出品を取り消せません','同じマジックカードをすでに所持しているため、重複所持にならないよう出品を取り消せません。',[{label:'戻る',action:'close-modal'}]);return;}
    if(prefOwnedMagics(PREF_PLAYER_ID).length>=PREF_MAGIC_LIMIT){
      inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.listedAtAbs=null;inst.marketExpiresAbs=null;inst.expiresAtAbs=null;inst.acquiredAtAbs=null;
      campaignState.pendingAcquisition={kind:'magic',instanceId:inst.id,regionId:PREF_PLAYER_ID,reason:'withdraw-market-magic'};
      prefSave().then(()=>{prefSyncCampaignClones();prefShowReplaceModal();}).catch(console.error);return;
    }
  }
  if(inst.kind==='unit'&&prefRankStars(prefCardForInstance(id)||prefTemplate(inst.templateId))===5&&prefOwnedFiveStarUnits(PREF_PLAYER_ID).length>=prefFiveStarLimit(prefPlayerRegion())){
    inst.zone='pending';inst.ownerId=null;inst.sellerRegionId=null;inst.listedAtAbs=null;inst.marketExpiresAbs=null;inst.expiresAtAbs=null;inst.acquiredAtAbs=null;
    campaignState.pendingAcquisition={kind:'unit',instanceId:inst.id,regionId:PREF_PLAYER_ID,reason:'rank5-limit'};
    prefSave().then(()=>{prefSyncCampaignClones();prefShowReplaceModal();}).catch(console.error);return;
  }
  if(inst.kind==='unit')prefSetInstanceOwner(inst,PREF_PLAYER_ID,true);else prefSetInstanceOwner(inst,PREF_PLAYER_ID,false);
  prefLog(`市場出品を取り消し、カードをホルダーへ戻しました。`,'info');prefSave().then(()=>{prefRenderAll();renderPrefMarket();}).catch(console.error);
}
function prefConfirmPurchaseDialog(id) {
  const inst=campaignState?.instances?.[id];const card=prefCardForInstance(id)||prefTemplate(inst?.templateId);if(!inst||inst.zone!=='market'||!card)return;
  const p=prefPlayerRegion();const price=prefCardValue(card);const duplicate=inst.kind==='magic'&&prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId));
  const duplicateUnit=inst.kind==='unit'&&prefOwnedUnits(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(inst.templateId));
  prefShowModal('カード購入の確認',`<div class="flex flex-col sm:flex-row gap-4 items-start"><div class="w-36 sm:w-44 shrink-0 mx-auto sm:mx-0">${prefCardDisplay(id,{small:true})}</div><div class="min-w-0 w-full"><div class="font-black text-white">${prefEsc(card.name)}</div><div class="text-xl font-black text-emerald-200 mt-2">${prefFormatMoney(price)}</div><div class="text-xs text-slate-400 mt-2">購入後の所持資金：${prefFormatMoney((p.funds||0)-price)}</div>${duplicate?'<p class="text-rose-300 text-xs mt-2">同じマジックカードをすでに所持しているため購入できません。</p>':''}${duplicateUnit?'<p class="text-rose-300 text-xs mt-2">同じキャラカードを所持しているため購入できません。</p>':''}${p.funds<price?'<p class="text-rose-300 text-xs mt-2">資金が不足しています。</p>':''}</div></div>`,[{label:'キャンセル',action:'close-modal',style:'slate'},...(duplicate||duplicateUnit||p.funds<price?[]:[{label:'購入する',action:'confirm-buy-card',id,style:'primary'}])]);
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
  if(!result)return null;
  if(result.kind==='magic'){const templates=prefCardTemplates().filter(c=>c.cardType==='magic');const template=prefRandom(templates);if(!template)return {kind:'magic',rank:0,band:'any',instance:null,noUnits:true};const instance=prefCreateInstance(template.id,'pending',null,{source:'gacha-random-magic'});return {kind:'magic',rank:0,band:'any',instance};}
  let eligible=prefEligibleGachaUnitInstances().filter(inst=>{const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(prefRankStars(c)!==Number(result.rank))return false;const threshold=PREF_GACHA_VALUE_LIMITS[Number(result.rank)];return result.band==='upper'?Number(c?.value||0)>=threshold:result.band==='lower'?Number(c?.value||0)<threshold:true;});
  if(!eligible.length){const threes=prefEligibleGachaUnitInstances().filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===3);if(threes.length)return {kind:'unit',rank:3,band:'any',instance:prefRandom(threes),fallback:true};const magic=prefCardTemplates().filter(c=>c.cardType==='magic');const template=prefRandom(magic);return template?{kind:'magic',rank:0,band:'any',instance:prefCreateInstance(template.id,'pending',null,{source:'gacha-fallback-magic'}),fallback:true,noUnits:true}:null;}
  return {kind:'unit',rank:Number(result.rank),band:result.band,instance:prefRandom(eligible)};
}
async function prefPullGacha(key) {
  const p=prefPlayerRegion(),g=PREF_GACHA[key];if(!p||!g)return;
  if(campaignState?.pendingAcquisition){prefShowReplaceModal();return;}
  const allowed=key==='A'?['S','A','B'].includes(p.tier):key==='B'?['S','A','B','C','D'].includes(p.tier):true;
  if(!allowed){prefShowModal('ガチャ未解放',`このガチャは都道府県ランク${key==='A'?'B':key==='B'?'D':'—'}以上で解放されます。`,[{label:'戻る',action:'close-modal'}]);return;}
  if(p.funds<g.price){prefShowModal('資金不足',`${g.label}を引くには${prefFormatMoney(g.price)}必要です。`,[{label:'戻る',action:'close-modal'}]);return;}
  prefBook(PREF_PLAYER_ID,-g.price,'gacha');
  const selected=prefResolveGachaTier(key);
  let resultCard=null;
  if(!selected?.instance){prefBook(PREF_PLAYER_ID,g.price,'gacha-refund');prefShowModal('ガチャ停止','排出対象のカードがありません。マジックカードまたは対象ランクのキャラカードを登録してください。',[{label:'戻る',action:'close-modal'}]);return;}
  resultCard=selected.instance;
  prefAcquireInstance(PREF_PLAYER_ID,resultCard.id,{reason:'gacha',deferCapacityModal:true});
  const card=prefCardForInstance(resultCard.id)||prefTemplate(resultCard.templateId);
  if(selected.kind==='magic')prefLog(`ガチャの確率枠からマジックカード「${card?.name||'カード'}」が排出されました。`,'success');
  else prefLog(`ガチャからキャラカード「${card?.name||'カード'}」（★${prefRankStars(card)}・${selected.band==='lower'?'下位':selected.band==='upper'?'上位':'通常'}）が排出されました。`,'success');
  const magicTemplates=prefCardTemplates().filter(c=>c.cardType==='magic');
  const magicTemplate=prefRandom(magicTemplates);let bundledMagicInstance=null;
  if(magicTemplate){
    const magicInst=prefCreateInstance(magicTemplate.id,'pending',null,{source:'gacha-bundle'});bundledMagicInstance=magicInst;
    const already=prefOwnedMagics(PREF_PLAYER_ID).some(x=>String(x.templateId)===String(magicTemplate.id));
    if(already){prefListInstance(magicInst,PREF_PLAYER_ID,'duplicate-gacha-bundle');prefLog(`抱き合わせマジック「${magicTemplate.name}」は重複のため市場へ出品しました。`,'info');}
    else if(campaignState.pendingAcquisition){campaignState.pendingAcquisitionQueue=Array.isArray(campaignState.pendingAcquisitionQueue)?campaignState.pendingAcquisitionQueue:[];campaignState.pendingAcquisitionQueue.push(magicInst.id);}
    else prefAcquireInstance(PREF_PLAYER_ID,magicInst.id,{reason:'gacha',deferCapacityModal:true});
    prefLog(`抱き合わせでマジックカード「${magicTemplate.name}」を獲得しました。`,'success');
  }
  await prefSave();prefSyncCampaignClones();prefRenderAll();
  // Add a short staged reveal before showing the actual card. Save first so a refresh during the reveal
  // cannot charge the player again or lose the result.
  const modalClose=document.getElementById('pref-modal-close-btn');
  prefShowModal('✨ カードを召喚中…',`<div class="text-center py-5"><div class="relative mx-auto w-32 h-32 flex items-center justify-center"><div class="absolute inset-0 rounded-full border-4 border-violet-400/70 animate-spin"></div><div class="absolute inset-3 rounded-full border-2 border-amber-300/70 animate-ping"></div><div class="pref-gacha-orb text-6xl">✧</div></div><div class="text-lg font-black text-violet-200 mt-5">カードの気配が強まっている…</div><p class="text-xs text-slate-400 mt-2">光が収束するのを待っています</p><div class="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-5 max-w-xs mx-auto"><div class="pref-gacha-progress h-full rounded-full"></div></div></div>`,[]);
  modalClose?.classList.add('hidden');
  await new Promise(resolve=>setTimeout(resolve,850));
  const body=document.getElementById('pref-modal-body');if(body&&document.getElementById('pref-modal')?.classList.contains('flex'))body.innerHTML=`<div class="text-center py-4"><div class="text-4xl animate-bounce">✨</div><div class="text-xl font-black text-amber-200 mt-3">まもなくカードが現れます…</div><p class="text-xs text-slate-400 mt-2">運命の一枚を確認中</p></div>`;
  await new Promise(resolve=>setTimeout(resolve,700));
  const c=resultCard?(prefCardForInstance(resultCard.id)||prefTemplate(resultCard.templateId)):null;
  const fallback=selected.fallback?`<p class="text-xs text-amber-200 mt-2">希望ランクのカードが残っていないため、${selected.noUnits?'マジックカードに切り替えました':`★${selected.rank}で代用しました`}。</p>`:'';
  const zone=campaignState.instances[resultCard?.id]?.zone;
  const bundledMagic=campaignState.logs?.slice(-5).find(x=>String(x.message||x.text||'').includes('抱き合わせでマジックカード'))?.message||'';const location=zone==='market'?'<p class="text-xs text-cyan-200 mt-2">重複のため市場へ自動出品されました。</p>':zone==='pending'?`<p class="text-xs text-amber-200 mt-2">所持上限${resultCard?.kind==='magic'?`（マジック${PREF_MAGIC_LIMIT}枚）`:''}のため、既存カードまたは新カードを選んで市場へ出品してください。</p>`:'';
  const cardBlock=c?`<div class="grid grid-cols-2 gap-3 mt-3 items-start"><div><div class="text-[10px] text-amber-200 font-black mb-1">${c?.cardType==='magic'?'確率枠のマジックカード':'キャラカード'}</div><div class="mx-auto w-full max-w-[14rem]">${prefCardDisplay(resultCard.id,{small:true})}</div><div class="text-center mt-2"><div class="font-black text-white text-sm">${prefEsc(c.name)}</div><div class="text-emerald-200 font-black mt-1">価値 ${prefFormatMoney(prefCardValue(c))}</div></div></div>${bundledMagicInstance?(()=>{const mc=prefCardForInstance(bundledMagicInstance.id)||prefTemplate(bundledMagicInstance.templateId);return `<div><div class="text-[10px] text-violet-200 font-black mb-1">確定マジック</div><div class="mx-auto w-full max-w-[14rem]">${prefCardDisplay(bundledMagicInstance.id,{small:true})}</div><div class="text-center mt-2"><div class="font-black text-white text-sm">${prefEsc(mc?.name||'マジックカード')}</div><div class="text-emerald-200 font-black mt-1">価値 ${prefFormatMoney(prefCardValue(mc))}</div></div></div>`;})():''}</div><div class="text-[10px] text-slate-500 mt-2">カード画像をタップすると詳細を確認できます</div>`:'<p class="text-slate-400 text-sm">カードの登録データが見つかりませんでした。</p>';
  const fundsAfterGacha=prefFormatMoney(prefPlayerRegion()?.funds||0);
  prefShowModal('✨ ガチャ結果',`<div class="text-center"><div class="inline-flex px-3 py-1 rounded-full bg-violet-950 border border-violet-500/50 text-violet-200 text-xs font-black">${prefEsc(g.label)} · ${prefFormatMoney(g.price)}</div><div class="mt-3 mx-auto inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-4 py-2 text-sm"><span class="text-emerald-300">現在資金</span><b class="text-white text-lg">${fundsAfterGacha}</b></div><div class="text-4xl mt-3 animate-pulse">${c?.cardType==='magic'?'📜':'🌟'}</div>${cardBlock}${fallback}${location}</div>`,[{label:'結果を閉じる',action:'gacha-result-close'},{label:'続けて引く',action:'gacha-pull-again',id:key,style:'primary'}]);
}

function prefShowBattleSelection(finalizing=false) {
  if(!campaignState)return;
  const p=prefPlayerRegion();const units=prefOwnedUnits(PREF_PLAYER_ID);
  if(units.length<PREF_BATTLE_ACTIVE){prefTriggerGameOver('キャラカードが4枚未満の状態で対戦コマンドを選択しました。');return;}
  if(!prefCanFormLegalBattleSquad(units)){prefShowModal('先発メンバーが不足しています','現在の所持カードでは、ゲームモードの★5編成上限を守って先発4体を組めません。★5以外のキャラカードを補充するか、★5カードを市場へ出品してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
  if(p.lastBattleAbs>0 && p.lastBattleAbs===prefAbsTurn()-1){prefShowModal('連戦禁止','前週に対戦したため、今週は対戦コマンドを選べません。',[{label:'了解',action:'close-modal',style:'primary'}]);return;}
  const provisional=finalizing?(campaignState.turnProcessing?.actions?.[PREF_PLAYER_ID]?.loadout||p.lastLoadout||{}):(p.lastLoadout||{});
  let active=(provisional.active||[]).filter(id=>units.some(x=>x.id===id));let reserve=(provisional.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id));
  if(active.length!==PREF_BATTLE_ACTIVE){const auto=prefBuildAutoLoadout(units);active=auto.active;reserve=auto.reserve;}
  ({active,reserve}=prefNormalizeLoadoutSelection(active,reserve,units));
  const box=document.getElementById('pref-battle-selection');box.classList.remove('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');
  if(finalizing){document.getElementById('pref-command-panel')?.classList.remove('hidden');document.getElementById('pref-turn-progress')?.classList.add('hidden');document.getElementById('pref-pending-battle-panel')?.classList.add('hidden');document.getElementById('campaign-preview-resume')?.classList.add('hidden');}
  const pair=finalizing?(campaignState.turnProcessing?.pairs||[]).find(pair=>pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID):null;
  const rivalId=pair?(pair.a===PREF_PLAYER_ID?pair.b:pair.a):null;const rival=rivalId?prefRegion(rivalId):null;
  box.innerHTML=`<div class="flex flex-wrap justify-between gap-2 items-start"><div><h3 class="text-lg font-black text-rose-200">${finalizing?'対戦前の最終編成を確定':'対戦用の5枚を選出'}</h3><p class="text-xs text-slate-400 mt-1">${finalizing?`対戦相手：${prefEsc(rival?.prefecture||'決定済みの代表')}。出撃4体と控え1体までを選び、この編成で対戦を開始します。`:'出撃4体を必ず選択。残り1枚まで控えにできます。'} カードをタップして役割を変更できます。</p></div><button data-pref-action="cancel-command" class="px-3 py-2 bg-slate-800 rounded-lg text-xs font-bold">${finalizing?'編成を戻す':'キャンセル'}</button></div><div id="pref-loadout-counter" class="mt-3 text-xs font-black text-amber-200"></div><div id="pref-loadout-list" class="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3"></div><div class="flex flex-wrap gap-2 mt-4"><button data-pref-action="auto-loadout" class="px-4 py-3 rounded-lg bg-slate-800 text-xs font-black">自動選出</button><button data-pref-action="${finalizing?'confirm-final-loadout':'confirm-battle'}" class="flex-1 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-sm">${finalizing?'この編成を確定して対戦開始':'仮編成で対戦相手を決定'}</button></div>${finalizing?'<p class="text-[10px] text-amber-200 mt-2">対戦相手は確定済みです。ここで編成を確定すると戦闘が始まります。</p>':'<p class="text-[10px] text-slate-500 mt-2">対戦相手が決まった後に、編成を変更して最終確定できます。</p>'}`;
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
  const count=document.getElementById('pref-loadout-counter');if(count){count.innerHTML=`出撃 ${draft.active.length}/4　／　控え ${draft.reserve.length}/1　／　所持 ${units.length}/10　／　選出中の★5 ${prefCountFiveStarIds([...draft.active,...draft.reserve],units)}/${PREF_BATTLE_RANK5_LIMIT}${prefPendingNotice?`<span class="block text-rose-300 mt-1">${prefEsc(prefPendingNotice)}</span>`:''}`;prefPendingNotice='';}
}
function prefToggleLoadout(id) {
  const draft=campaignState?.draftLoadout;if(!draft)return;
  if(draft.active.includes(id)){
    draft.active=draft.active.filter(x=>x!==id);if(draft.reserve.length<1)draft.reserve.push(id);
  }else if(draft.reserve.includes(id)){
    draft.reserve=draft.reserve.filter(x=>x!==id);
  }else {
    const units=prefOwnedUnits(PREF_PLAYER_ID),candidate=prefCardForInstance(id)||prefTemplate(campaignState.instances[id]?.templateId);
    if(prefRankStars(candidate)===5&&prefCountFiveStarIds([...draft.active,...draft.reserve],units)>=PREF_BATTLE_RANK5_LIMIT){prefPendingNotice=`ゲームモードのデッキに入れられる★5キャラは${PREF_BATTLE_RANK5_LIMIT}体までです。`;prefRenderLoadout();return;}
    if(draft.active.length<PREF_BATTLE_ACTIVE){draft.active.push(id);}
    else if(draft.reserve.length<1){draft.reserve.push(id);}
    else {prefPendingNotice='出撃4体と控え1体まで選択できます。';}
  }
  prefRenderLoadout();
}
function prefAutoLoadout() {
  const units=prefOwnedUnits(PREF_PLAYER_ID);
  campaignState.draftLoadout=prefBuildAutoLoadout(units);prefRenderLoadout();
}
function prefShowInvestigationSelection() {
  if(!campaignState)return;
  const p=prefPlayerRegion();if((p.nonBattleStreak||0)>=3){prefShowModal('対戦が必要です','3ターン連続で対戦しなかったため、今週は対戦コマンドを選択する必要があります。',[{label:'了解',action:'close-modal'}]);return;}
  const options=prefCurrentRegionRankList().filter(r=>r.id!==PREF_PLAYER_ID);
  const box=document.getElementById('pref-investigation-selection');box.classList.remove('hidden');document.getElementById('pref-battle-selection')?.classList.add('hidden');
  box.innerHTML=`<div class="flex flex-wrap justify-between gap-2 items-start"><div><h3 class="text-lg font-black text-cyan-200">調査する代表を選ぶ</h3><p class="text-xs text-slate-400 mt-1">調査結果は調査時点のスナップショットとして保存されます。</p></div><button data-pref-action="cancel-command" class="px-3 py-2 bg-slate-800 rounded-lg text-xs font-bold">キャンセル</button></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><label class="text-xs text-slate-300 font-bold">調査対象<select id="pref-invest-target" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm">${options.map(r=>`<option value="${prefEsc(r.id)}">${prefEsc(prefRankLabel(r))} · ${prefEsc(r.prefecture)} · ${prefEsc(r.repName)}（${r.tier}）</option>`).join('')}</select></label><label class="text-xs text-slate-300 font-bold">調査内容<select id="pref-invest-topic" class="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm"><option value="cards">所持キャラカード</option><option value="behavior">行動方針・性格</option><option value="both">カードと行動方針</option></select></label></div><button data-pref-action="confirm-investigation" class="mt-4 w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-black text-sm">調査コマンドを実行</button>`;
}

function prefDecideAiCommand(region) {
  const ownedUnits=prefOwnedUnits(region.id);
  const units=ownedUnits.length;
  const canFieldThree=prefCanFormLegalBattleSquad(ownedUnits);
  const justBattled=Number(region.lastBattleAbs)>0&&Number(region.lastBattleAbs)===prefAbsTurn()-1;
  if(justBattled){
    const target=prefRandom(Object.keys(campaignState.regions).filter(x=>x!==region.id));
    return {type:'investigate',target,topic:region.personality==='scout'?'both':'cards'};
  }
  if((Number(region.nonBattleStreak)||0)>=3&&canFieldThree){
    prefRecordAIThought(region,'コマンド選択','連続非対戦の上限に達したため対戦を優先',[
      `非対戦連続${Number(region.nonBattleStreak)||0}週のため、ゲームルール上ここで対戦が必要`,
      `所持キャラ${units}枚。足りないカードの補充処理は対戦判断より先に実行済み`
    ]);
    return {type:'battle'};
  }
  const p=PREF_PERSONALITIES.find(x=>x.id===region.personality)||PREF_PERSONALITIES[1];
  const profile=prefAIProfileForRegion(region);
  let battleProb=p.battle;
  const hasReinforcementPath=units<5&&prefAiHasViableUnitReinforcement(region);
  if(!canFieldThree)battleProb=0;
  else if(units<5){
    if(hasReinforcementPath)battleProb=0;
    else battleProb*=units===4?0.45:0.2;
  }
  if(region.funds<15000000)battleProb=Math.min(battleProb,hasReinforcementPath?0:0.35);
  // Even a well-funded rival should not attack with an incomplete five-card squad while a legal refill is available.
  if(hasReinforcementPath)battleProb=0;
  if(Math.random()<battleProb){
    prefRecordAIThought(region,'コマンド選択','今週は対戦を選択',[
      `運営方針「${p.name}」の対戦傾向を適用`,
      `所持キャラ${units}/5枚、資金${prefFormatMoney(region.funds)}`,
      `戦術IQ${profile.tacticalIQ}/100・カード選びIQ${profile.cardIQ}/100`,
      units<5?'市場・ガチャに実行可能な補強手段がないため、現在の戦力で対戦を選択':'必要枚数を満たし、現デッキで対戦可能と判断'
    ],{units,hasReinforcementPath,battleProbability:battleProb});
    return {type:'battle'};
  }
  const others=Object.keys(campaignState.regions).filter(x=>x!==region.id);
  const target=prefRandom(others);const topic=region.personality==='scout'?'both':region.personality==='careful'?'behavior':'cards';
  let reasons=[`運営方針「${p.name}」に基づき今週は調査を選択`,`調査対象：${prefRegion(target)?.prefecture||target}`,`調査内容：${topic==='both'?'カードと行動方針':topic==='behavior'?'行動方針':'カード'}`];
  if(units<5&&hasReinforcementPath)reasons.unshift(`所持キャラが${units}/5枚のため、購入・ガチャで補強できる可能性を優先して対戦を延期`);
  else if(units<5)reasons.unshift(`所持キャラが${units}/5枚で不利なため対戦頻度を下げているが、現時点で実行可能な補充候補がない`);
  prefRecordAIThought(region,'コマンド選択',units<5?'補強・調査を優先して今週は対戦を見送り':'今週は調査を選択',reasons,{units,hasReinforcementPath,battleProbability:battleProb});
  return {type:'investigate',target,topic};
}
function prefAiGachaAllowed(region,key) {
  if(region.funds<PREF_GACHA[key].price)return false;
  if(key==='A')return ['S','A','B'].includes(region.tier);
  if(key==='B')return ['S','A','B','C','D'].includes(region.tier);
  return true;
}
function prefAiRosterComplementBonus(region,card) {
  if(!region||!card||card.cardType==='magic')return 0;
  const roster=prefOwnedUnits(region.id)
    .filter(inst=>String(inst.templateId)!==String(card.templateId||card.id))
    .map(inst=>prefCardForInstance(inst.id)||prefTemplate(inst.templateId)).filter(Boolean);
  const cp=prefCardProfile(card), profiles=roster.map(prefCardProfile);
  const has=tag=>profiles.some(p=>p.tags.has(tag));
  const hasAny=tags=>profiles.some(p=>tags.some(tag=>p.tags.has(tag)));
  let bonus=0;
  // Give extra weight to filling a real tactical gap rather than merely duplicating a tag.
  if(cp.tags.has('damage')&&!has('damage'))bonus+=4.5;
  // Basic personality-neutral roster balance: fill missing combat roles before stacking duplicates.
  const roles=roster.map(c=>String(c.role||prefCardProfile(c).role||''));
  const role=String(card.role||cp.role||'');
  if(['attacker','controller','defender'].includes(role)&&!roles.includes(role))bonus+=roles.length>=2?5.0:2.5;
  if(['attacker','controller','defender'].includes(role)&&roles.filter(r=>r===role).length>=2)bonus-=4.0;
  if(cp.tags.has('hp_scaling_damage')&&hasAny(['healing','damage_amp']))bonus+=7.0;
  if(cp.tags.has('damage_amp')&&has('hp_scaling_damage'))bonus+=6.0;
  if(cp.tags.has('healing')&&has('hp_scaling_damage'))bonus+=4.5;
  if(cp.tags.has('ap_supply')&&profiles.some(p=>p.maxCost>=18||p.tags.has('heavy_cost')))bonus+=7.0;
  if(cp.tags.has('damage_amp')&&has('damage'))bonus+=7.0;
  if(cp.tags.has('attack_speed_buff')&&hasAny(['damage','attack_role']))bonus+=4.5;
  if(cp.tags.has('damage')&&hasAny(['damage_amp','attack_speed_buff']))bonus+=6.0;
  if(prefCardHasTeamBuff(card)&&hasAny(['damage','attack_role']))bonus+=5.5;
  if(cp.tags.has('permanent_self_buff')&&hasAny(['healing','shield_defense','taunt_protection']))bonus+=3.5;
  if(roster.some(other=>prefActualStatusChain(card,other)))bonus+=7.0;
  if((cp.tags.has('healing')||cp.tags.has('shield_defense'))&&!hasAny(['healing','shield_defense']))bonus+=3.5;
  if(cp.tags.has('attack_speed_buff')&&hasAny(['damage','attack_role']))bonus+=2.0;
  if(cp.tags.has('passive_chain')&&has('extra_effect')||cp.tags.has('extra_effect')&&has('passive_chain'))bonus+=3.0;
  const rosterAttrs=new Set(roster.flatMap(c=>[String(c.mainAttr||''),...(Array.isArray(c.subAttrs)?c.subAttrs:[]).map(x=>String(typeof x==='string'?x:(x?.name||x?.id||'')))]).filter(Boolean));
  if(cp.supportsAttrs.some(attr=>rosterAttrs.has(String(attr))))bonus+=3.0;
  const profile=prefAIProfileForRegion(region);
  if(profile.mainAttrPriority?.length && profile.mainAttrPriority.slice(0,3).includes(cp.mainAttr))bonus+=1.5;
  // Avoid awarding the full completion bonus to redundant filler when five useful roles already exist.
  if(roster.length>=4&&bonus>0)bonus*=0.8;
  // A recent defeat makes structural repairs more valuable than preserving a familiar roster.
  if(region.aiMemory?.rebuildPending?.status==='pending'&&bonus>0)bonus*=1.22;
  return bonus;
}
function prefAiMarketUpgradeQualifies(region,instance,utility) {
  if(!region||!instance||!Number.isFinite(Number(utility)))return false;
  const profile=prefAIProfileForRegion(region),card=prefCardForInstance(instance.id)||prefTemplate(instance.templateId);
  const complement=prefAiRosterComplementBonus(region,card),rank=prefRankStars(card);
  const baseThreshold=6; // Rank-independent minimum market utility; roster replacement still checks actual gain.
  // High-rank purchases are a legitimate investment for a funded A/S/B rival. Keep the reserve
  // gate elsewhere and let the replacement comparison reject cards that do not improve the roster.
  const qualityInvestment=['S','A','B'].includes(region.tier)&&rank>=4&&Number(utility)>=-0.5;
  return Number(utility)>=baseThreshold||(complement>=4.5&&Number(utility)>=-2)||qualityInvestment;
}
function prefAiUnitReserveFloor(region) {
  const funds=Math.max(0,Number(region?.funds)||0);
  const owned=prefOwnedUnits(region?.id).length;
  // 資金の半分を固定で抱え込むと、S/Aランクでも強力なカードへ投資できない。
  // 年間支援額は目安として残しつつ、実残高の15%程度をソフトな予備費にする。
  // 所持4枚未満の緊急補充では資金不足による行き詰まりを避ける。
  const funding=Number(PREF_FUNDING_BY_TIER[region?.supportTier||region?.tier||'E']||PREF_FUNDING_BY_TIER.E)||0;
  const rankReserve=funding*0.15;
  const cashReserve=Math.min(funds*0.15,rankReserve);
  const emergencyFloor=owned<PREF_BATTLE_ACTIVE?Math.min(2000000,funds*0.08):Math.min(3000000,funds*0.05);
  return Math.min(funds,Math.max(cashReserve,emergencyFloor));
}
function prefAiCanBuyMarketUnit(region,instance,utility=null) {
  if(!region||!instance||instance.kind!=='unit'||instance.zone!=='market'||instance.sellerRegionId===region.id)return false;
  const card=prefCardForInstance(instance.id)||prefTemplate(instance.templateId);if(!card)return false;
  const price=prefValueFromInstance(instance),funds=Number(region.funds)||0,owned=prefOwnedUnits(region.id);
  if(price>funds)return false;
  if(owned.some(x=>String(x.templateId)===String(instance.templateId)))return false;
  if(prefOwnedInstancesAny().some(x=>String(x.templateId)===String(instance.templateId)&&x.ownerId!==region.id&&!x.copyException&&!instance.copyException))return false;
  const floor=prefAiUnitReserveFloor(region);
  if(owned.length>=3&&funds-price<floor)return false;
  if(owned.length<PREF_BATTLE_ACTIVE&&funds-price<0)return false;
  if(utility!=null&&owned.length<5&&utility<-3&&prefAiRosterComplementBonus(region,card)<7)return false;
  if(utility!=null&&owned.length<5&&prefRankStars(card)<=3&&owned.some(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))>=4)&&prefAiRosterComplementBonus(region,card)<7)return false;
  if(utility!=null&&owned.length>=5&&!prefAiMarketUpgradeQualifies(region,instance,utility))return false;
  return true;
}
function prefAiHasViableUnitReinforcement(region) {
  if(!region||prefOwnedUnits(region.id).length>=5)return false;
  const funds=Number(region.funds)||0,units=prefOwnedUnits(region.id).length;
  // When the five-card battle roster is incomplete, an affordable C pull is a viable refill
  // even if it consumes the normal reserve; otherwise the reserve rule can deadlock at 3-4 units.
  if(prefEligibleGachaUnitInstances().length && (funds>=PREF_GACHA.C.price+prefAiUnitReserveFloor(region) || units<5&&funds>=PREF_GACHA.C.price))return true;
  return prefAiShortlistMarketUnitInstances(region,28).some(inst=>{
    if(!prefAiCanBuyMarketUnit(region,inst))return false;
    return prefAiCanBuyMarketUnit(region,inst,prefAiMarketUtility(region,inst));
  });
}
function prefAiChooseGachaTier(region,prioritizeQuality=false) {
  const funds=Number(region?.funds)||0;
  const floor=prefAiUnitReserveFloor(region);
  const eligibleB=['S','A','B','C','D'].includes(region?.tier);
  const eligibleA=['S','A','B'].includes(region?.tier);
  // A is the quality tier: use it when the roster genuinely needs an upgrade and the reserve remains safe.
  if(eligibleA&&prioritizeQuality&&funds>=PREF_GACHA.A.price+floor)return 'A';
  if(eligibleB&&funds>=PREF_GACHA.B.price+floor)return 'B';
  // Preserve working capital when three legal starters already exist. Only a genuinely
  // unplayable squad (fewer than 3 cards) can spend down to the last affordable pull.
  if(funds>=PREF_GACHA.C.price+floor||prefOwnedUnits(region.id).length<PREF_BATTLE_ACTIVE&&funds>=PREF_GACHA.C.price)return 'C';
  return null;
}
function prefAiShouldPrioritizeQualityGacha(region, unitsOverride=null, eligibleOverride=null) {
  if(!region||!['S','A','B'].includes(region.tier))return false;
  const funds=Number(region.funds)||0,floor=prefAiUnitReserveFloor(region);
  if(funds<PREF_GACHA.A.price+floor)return false;
  const units=Array.isArray(unitsOverride)?unitsOverride:prefOwnedUnits(region.id);
  const hasWeakRank=units.some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))<=3);
  const now=prefAbsTurn();
  const nearingExpiry=units.some(inst=>inst.expiresAtAbs!=null&&Number(inst.expiresAtAbs)-now>=0&&Number(inst.expiresAtAbs)-now<=8);
  const rebuild=region.aiMemory?.rebuildPending?.status==='pending';
  const eligible=Array.isArray(eligibleOverride)?eligibleOverride:prefEligibleGachaUnitInstances();
  let hasFourPlusTarget=false,hasUpperFiveTarget=false;
  for(const inst of eligible){
    const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId),rank=prefRankStars(c);
    if(rank>=4)hasFourPlusTarget=true;
    if(rank===5&&Number(c?.value||0)>=PREF_GACHA_VALUE_LIMITS[5])hasUpperFiveTarget=true;
    if(hasFourPlusTarget&&hasUpperFiveTarget)break;
  }
  if(!hasFourPlusTarget)return false;
  // If a battle slot is missing, choose a better pool rather than filling with a cheap weak draw.
  if(units.length<5)return true;
  const ownedFiveCount=units.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===5).length;
  const hasUpperFive=units.some(inst=>{const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);return prefRankStars(c)===5&&Number(c?.value||0)>=PREF_GACHA_VALUE_LIMITS[5];});
  const hasLowValueFive=units.some(inst=>{const c=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);return prefRankStars(c)===5&&Number(c?.value||0)<PREF_GACHA_VALUE_LIMITS[5];});
  // If a strong ★5 remains drawable, first fill an empty ★5 slot and then upgrade a low-value ★5.
  // Do not stop just because the deck already has one ★5 or already owns one upper-band ★5.
  return hasWeakRank||rebuild||nearingExpiry||(hasUpperFiveTarget&&(hasLowValueFive||!hasUpperFive||ownedFiveCount<PREF_BATTLE_RANK5_LIMIT));
}
function prefAiShortlistGachaUnitInstances(region, limit=40, eligibleOverride=null) {
  const eligible=Array.isArray(eligibleOverride)?eligibleOverride:prefEligibleGachaUnitInstances();if(eligible.length<=limit)return eligible;
  const rows=[];
  for(const inst of eligible){
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(!card)continue;
    const rank=prefRankStars(card),stats=card.stats||{};
    const anchor=rank===5?PREF_GACHA_VALUE_LIMITS[5]:rank===4?PREF_GACHA_VALUE_LIMITS[4]:rank===3?3000000:1000000;
    const valueSignal=Math.max(-2,Math.min(2,Math.log10(Math.max(1,prefCardValue(card))/Math.max(1,anchor))));
    const quick=rank*10+(rank>=4?4:0)+(rank===5?5:0)+valueSignal*3.2+
      Math.min(8,Number(stats.atk||0)/1200)+Math.min(6,Number(stats.hp||0)/6000)+
      Math.min(4,(Array.isArray(card.skills)?card.skills.length:0)*0.35)+
      (card.role==='attacker'?1.2:card.role==='controller'||card.role==='defender'?0.8:0);
    rows.push({inst,card,rank,quick,profile:null});
  }
  rows.sort((a,b)=>b.quick-a.quick);const chosen=new Map();
  const add=row=>{if(row&&chosen.size<limit)chosen.set(String(row.inst.id),row);};
  rows.slice(0,Math.max(6,limit-18)).forEach(add);
  for(const rank of [5,4,3])rows.filter(x=>x.rank===rank).slice(0,2).forEach(add);
  for(const role of ['attacker','controller','defender'])rows.filter(x=>String(x.card.role||'')===role).slice(0,2).forEach(add);
  const scan=rows.slice(0,Math.min(rows.length,Math.max(60,limit*2)));
  for(const row of scan)row.profile=prefCardProfile(row.card);
  for(const tag of ['ap_supply','damage_amp','attack_speed_buff','healing','shield_defense','status_debuff','status_condition','frontline_defender'])add(scan.find(x=>x.profile?.tags?.has(tag)));
  return [...chosen.values()].sort((a,b)=>b.quick-a.quick).slice(0,limit).map(x=>x.inst);
}
function prefAiBestGachaUpgradePotential(region, limit=40, eligibleOverride=null) {
  const owned=prefOwnedUnits(region.id);
  if(owned.length<5)return Infinity;
  // Full scoring of every drawable card was causing turn-start stalls as the custom card pool grew.
  // Score a quality-diverse shortlist deeply; candidate coverage retains rank, role and combo enablers.
  const eligible=prefAiShortlistGachaUnitInstances(region,limit,eligibleOverride);if(!eligible.length)return -Infinity;
  const current=owned.map(inst=>({inst,score:prefCardScoreForRegion(region,inst)})).sort((a,b)=>a.score-b.score);
  const weakest=current[0];if(!weakest)return -Infinity;
  const potentials=eligible.map(inst=>{
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    if(!card)return -Infinity;
    return prefCardScoreForRegion(region,inst)+prefAiRosterComplementBonus(region,card)-weakest.score;
  }).filter(Number.isFinite).sort((a,b)=>b-a);
  if(!potentials.length)return -Infinity;
  const topCount=Math.max(1,Math.ceil(potentials.length*0.35));
  const topAverage=potentials.slice(0,topCount).reduce((a,b)=>a+b,0)/topCount;
  const overallAverage=potentials.reduce((a,b)=>a+b,0)/potentials.length;
  return overallAverage*0.7+topAverage*0.3;
}

function prefAiMarketUtility(region,instance,baselineQuality=null) {
  const card=prefCardForInstance(instance?.id)||prefTemplate(instance?.templateId);if(!card)return -Infinity;
  if(!prefAiMagicFitsRoster(region,card))return -Infinity;
  const profile=prefAIProfileForRegion(region);const ownUnits=prefOwnedUnits(region.id);const ownMagics=prefOwnedMagics(region.id);
  const scoreOf=inst=>prefCardScoreForRegion(region,inst);
  const complement=instance.kind==='unit'?prefAiRosterComplementBonus(region,card):0;
  const candidateScore=prefCardIntrinsicScore(region,card)+prefCardStrategyScore(region,card)+prefCardPreferenceScore(region,card)+prefCardSynergyScore(region,card)+prefAIPlanFitScore(region,card)+complement+(card.magicType==='skill'?prefAiSkillCardFitBonus(region,card):0);
  let improvement=0,compositionDelta=0;
  if(instance.kind==='unit'){
    if(ownUnits.length<PREF_BATTLE_ACTIVE) improvement=22+candidateScore*0.30+complement*0.35;
    else if(ownUnits.length<5){
      const avg=ownUnits.reduce((sum,x)=>sum+scoreOf(x),0)/Math.max(1,ownUnits.length);
      // Missing roster slots are strategically valuable; also evaluate whether the card closes a synergy gap.
      improvement=8+candidateScore-avg*0.72+complement*0.65;
    } else {
      const weakest=ownUnits.map(inst=>({inst,score:scoreOf(inst)})).sort((a,b)=>a.score-b.score)[0];
      improvement=weakest?candidateScore-weakest.score:-2;
      if(improvement<=0)improvement-=4;
    }
  } else {
    if(ownMagics.length>=5){
      // Market upgrades are still possible when the five-card strategic hand is full;
      // replace the weakest spell rather than accumulating unusable or mediocre cards.
      const heldScores=ownMagics.map(x=>scoreOf(x)).filter(Number.isFinite);
      const weakest=heldScores.length?Math.min(...heldScores):0;
      improvement=(candidateScore-weakest)*0.9;
      if(improvement<=0)improvement-=5;
    } else if(!ownMagics.length)improvement=4+candidateScore*0.25+prefCardSynergyScore(region,card)*0.35;
    else {const values=ownMagics.map(scoreOf).filter(Number.isFinite);const avg=values.reduce((sum,x)=>sum+x,0)/Math.max(1,values.length);improvement=4+candidateScore*0.48-avg*0.28;}
  }
  // Incomplete rosters have very few candidates, so checking how a new card joins the team is cheap.
  // For a full roster, do NOT run the full 5! replacement search for every market listing: candidate
  // screening uses the intrinsic/role/synergy delta above, then the best few candidates get a full lineup check.
  if(instance.kind==='unit'&&ownUnits.length>=3&&ownUnits.length<5){
    const beforeQuality=Number.isFinite(baselineQuality)?baselineQuality:prefAIQuickRosterQuality(region,ownUnits);
    const afterQuality=prefAIQuickRosterQuality(region,[...ownUnits,instance]);
    compositionDelta=afterQuality-beforeQuality;
    improvement+=Math.max(-5,Math.min(8,compositionDelta*0.28));
  }
  const cost=prefValueFromInstance(instance);const reserve=region.funds-cost;
  const shortage=instance.kind==='unit'&&ownUnits.length<5;
  // 高価なカードを一律に罰すると、資金が潤沢でも強い★5を選べない。
  // 価格ペナルティを価格そのものだけでなく、購入後資金に対する負担率で調整する。
  const spendRatio=cost/Math.max(1,Number(region.funds)||0);
  // Purchase cost should matter, but a rich A/S rival must not reject a much stronger ★5
  // merely because its price is high in absolute terms. Reserve checks above still protect solvency.
  const absolutePricePenalty=Math.log10(1+Math.max(0,cost)/1000000)*0.9;
  const affordabilityFactor=0.32+0.68*Math.min(1,Math.max(0,spendRatio*2.0));
  const pricePenalty=Math.min(5.5,absolutePricePenalty*affordabilityFactor);
  const reservePenalty=reserve<2000000?14:reserve<10000000?(shortage?3:8):reserve<30000000?3:0;
  const rebuildBonus=region.aiMemory?.rebuildPending?.status==='pending'&&instance.kind==='unit'?Math.min(5,Math.max(0,compositionDelta)*0.25)+Math.min(2,prefRankStars(card)*0.35):0;
  return improvement-pricePenalty-reservePenalty+(shortage?8:0)+(profile.cardIQ/100)*2+rebuildBonus+prefCardEstimateError(profile.cardIQ);
}
function prefAiMarketReasons(region,instance) {
  const card=prefCardForInstance(instance?.id)||prefTemplate(instance?.templateId);const profile=prefAIProfileForRegion(region);const cp=prefCardProfile(card);const reasons=[];
  if(card?.magicType==='skill'){
    const users=prefAiSkillCardCasters(region,card);
    if(users.length)reasons.push(`使用可能なキャラ${users.length}体（${users.slice(0,2).map(u=>u.name).join('・')}）で発動可能`);
  }
  if(prefCardSynergyScore(region,card)>3)reasons.push('手持ちのキャラやマジックとのシナジーを評価');
  if(cp.tags.has('ap_supply')&&prefOwnedUnits(region.id).some(u=>prefCardProfile(prefCardForInstance(u.id)).maxCost>=25))reasons.push('AP供給が高コストスキルの使用機会を増やす');
  if(cp.tags.has('shield_defense')||cp.tags.has('healing'))reasons.push('主力の生存率を支える役割を補完');
  if(profile.effectPriority.some(x=>cp.tags.has(x)))reasons.push('好みの効果カテゴリに一致');
  const planFit=prefAIPlanFitScore(region,card);if(planFit>1)reasons.push(`長期計画「${region.aiPlan?.title||'シナジー補完'}」に合致（計画適合度${planFit.toFixed(1)}）`);
  if(!reasons.length)reasons.push('カード単体性能・価格・所持構成を総合評価');
  return reasons.slice(0,6);
}
// Cheap, deterministic market screen before any strategy/role/synergy calculation.
// Expensive ★5 remains available to a wealthy lower-tier rival (no arbitrary rank ban).
function prefAiMarketUnitFastEligible(region,inst,card,ownedCount,funds,reserve,ownedStrongCount){
  if(!inst||!card)return false;
  const price=prefValueFromInstance(inst),rank=prefRankStars(card);
  if(price>funds)return false;
  if(ownedCount>=PREF_BATTLE_ACTIVE&&funds-price<reserve)return false;
  if(rank===5&&['C','D','E'].includes(region.tier)&&funds-price<Math.max(reserve,10000000))return false;
  // Fully playable B/A/S rivals do not pursue ★3 fillers. At fewer than four legal
  // ★4+ members, still allow ★3 if there is no other route to a legal battle.
  if(rank<=3&&['S','A','B'].includes(region.tier)&&ownedCount>=PREF_BATTLE_ACTIVE&&ownedStrongCount>=PREF_BATTLE_ACTIVE)return false;
  if(ownedCount>=5&&rank<=3&&ownedStrongCount>=4)return false;
  return true;
}
function prefAiMarketMagicFastEligible(region,inst,heldTemplateIds,ownedCount,spendFloor){
  if(!inst||inst.sellerRegionId===region.id||heldTemplateIds.has(String(inst.templateId)))return false;
  const cost=prefValueFromInstance(inst);
  if(cost>Number(region.funds||0)-spendFloor)return false;
  const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
  if(!card||!prefAiMagicFitsRoster(region,card))return false;
  // Incomplete squads must not spend their refill budget on optional magic.
  if(ownedCount<PREF_BATTLE_ACTIVE)return false;
  return true;
}

function prefAiShortlistMarketUnitInstances(region, limit=36) {
  if(!region||!campaignState)return [];
  const owned=prefOwnedUnits(region.id),ownedTemplates=new Set(owned.map(x=>String(x.templateId))),funds=Number(region.funds)||0;
  const fiveCount=prefOwnedFiveStarUnits(region.id).length,fiveLimit=prefFiveStarLimit(region);
  const strongCount=owned.filter(x=>prefRankStars(prefCardForInstance(x.id)||prefTemplate(x.templateId))>=4).length;
  const floor=prefAiUnitReserveFloor(region);
  const otherOwners=new Set(prefOwnedInstancesAny().filter(x=>x.ownerId!==region.id&&!x.copyException).map(x=>String(x.templateId)));
  const rows=[];
  for(const inst of prefMarketListings('unit',false)){
    if(!inst||inst.sellerRegionId===region.id)continue;
    const templateId=String(inst.templateId||'');
    if(ownedTemplates.has(templateId)||(!inst.copyException&&otherOwners.has(templateId)))continue;
    const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);if(!card)continue;
    if(!prefAiMarketUnitFastEligible(region,inst,card,owned.length,funds,floor,strongCount))continue;
    const rank=prefRankStars(card);
    // At full capacity a market ★5 can replace one of the owned ★5s; while slots are missing,
    // do not exceed the rival's holder cap by taking a third ★5.
    if(rank===5&&fiveCount>=fiveLimit&&owned.length<5)continue;
    const p=card.stats||{},anchor=rank===5?PREF_GACHA_VALUE_LIMITS[5]:rank===4?PREF_GACHA_VALUE_LIMITS[4]:rank===3?3000000:1000000;
    const valueSignal=Math.max(-2,Math.min(2,Math.log10(Math.max(1,prefCardValue(card))/Math.max(1,anchor))));
    // Cheap first pass: rank and within-rank value dominate, with raw stats/skills as tie-breakers.
    const quick=rank*10+(rank>=4?4:0)+(rank===5?5:0)+valueSignal*3.2+
      Math.min(8,Number(p.atk||0)/1200)+Math.min(6,Number(p.hp||0)/6000)+
      Math.min(4,(Array.isArray(card.skills)?card.skills.length:0)*0.35)+
      (card.role==='attacker'?1.2:card.role==='controller'?0.8:card.role==='defender'?0.8:0);
    rows.push({inst,card,rank,quick,profile:null});
  }
  rows.sort((a,b)=>b.quick-a.quick);
  if(rows.length<=limit)return rows.map(x=>x.inst);
  const chosen=new Map();
  const add=row=>{if(row&&chosen.size<limit)chosen.set(String(row.inst.id),row);};
  rows.slice(0,Math.max(6,limit-18)).forEach(add);
  // Keep rank and declared-role coverage, so a strong synergy/support card is not discarded by raw stats.
  for(const rank of [5,4,3])rows.filter(x=>x.rank===rank).slice(0,2).forEach(add);
  for(const role of ['attacker','controller','defender'])rows.filter(x=>String(x.card.role||'')===role).slice(0,2).forEach(add);
  // From the upper-quality screen, retain essential tactical enablers even if their own stats are modest.
  const scan=rows.slice(0,Math.min(rows.length,Math.max(60,limit*2)));
  for(const row of scan)row.profile=prefCardProfile(row.card);
  for(const tag of ['ap_supply','damage_amp','attack_speed_buff','healing','shield_defense','status_debuff','status_condition','frontline_defender']){
    const row=scan.find(x=>x.profile?.tags?.has(tag));add(row);
  }
  for(const row of rows)add(row);
  return [...chosen.values()].sort((a,b)=>b.quick-a.quick).slice(0,limit).map(x=>x.inst);
}

// Cooperative yielding for the 47-representative AI economy. A representative with a large
// treasury may legitimately draw many times. Fixed draw-count caps weaken its reinforcement;
// instead we let the browser paint and show the exact ongoing phase every few draws.
async function prefAiEconomyYield(region,drawCount,phase) {
  if(drawCount%3!==0)return;
  const tx=campaignState?.turnProcessing;
  if(tx?.stage==='matching'){
    const name=String(region?.prefecture||region?.id||'代表');
    const step=String(phase||'カード補強');
    const funds=prefFormatMoney(Number(region?.funds)||0);
    const text=`${name}：${step}（抽選${drawCount}回・残高${funds}）`;
    const node=document.getElementById('pref-turn-loading-text');
    if(node)node.textContent=text;
    const panel=document.getElementById('pref-turn-progress-text');
    if(panel)panel.textContent=text;
  }
  await prefYieldToBrowser();
}

async function prefAiTryEconomy(region) {
  if(!region||region.isPlayer)return;
  region._aiEconomyPhase='初期構築計画';
  try { prefRefreshAIPlan(region,'市場・所持カードの確認'); }
  catch(err) { console.error(`[Prefecture] AI plan refresh failed for ${region.id}; continuing economy planning`,err); }
  // Recheck when a previously eligible caster was lost in battle or expired.
  prefAiListUnusableSkillCards(region);
  region._aiEconomyPhase='AI能力・性格の読込';
  let profile;
  try { profile=prefAIProfileForRegion(region); }
  catch(err) {
    console.error(`[Prefecture] AI profile loading failed for ${region.id}; using conservative defaults`,err);
    profile={primaryStrategy:'adaptive',secondaryStrategies:[],cardIQ:50,tacticalIQ:50,mainAttrPriority:[],effectPriority:[]};
  }
  let marketUnitPurchases=0,unitCountAtStart=prefOwnedUnits(region.id).length;
  // At most five holder slots exist; do not impose another purchase-count limit.

  // First preference: buy a real market card when it fits the current deck and does not consume the reserve.
  // If fewer than five characters are owned, filling missing battle slots is valued above optional luxury buys.
  region._aiEconomyPhase='不足枠の市場補充';
  try {
  while(prefOwnedUnits(region.id).length<5){
    const currentUnits=prefOwnedUnits(region.id);
    // All refill candidates join the same current roster, so compute its baseline trio quality once.
    const currentQuality=currentUnits.length>=3?prefAIQuickRosterQuality(region,currentUnits):null;
    const marketShortlist=prefAiShortlistMarketUnitInstances(region,24);
    const qualityFunds=['S','A','B'].includes(String(region.tier||''))&&Number(region.funds||0)>=PREF_GACHA.A.price+prefAiUnitReserveFloor(region);
    const gachaHasFourPlus=qualityFunds&&prefEligibleGachaUnitInstances().some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4);
    const marketHasFourPlus=qualityFunds&&marketShortlist.some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4&&prefAiCanBuyMarketUnit(region,inst));
    const requireFourPlus=qualityFunds&&(gachaHasFourPlus||marketHasFourPlus);
    const marketUnits=marketShortlist
      .filter(inst=>!(requireFourPlus&&prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))<=3))
      .map(inst=>({inst,utility:prefAiMarketUtility(region,inst,currentQuality)}))
      .filter(x=>prefAiCanBuyMarketUnit(region,x.inst,x.utility)&&x.utility>=-3)
      .sort((a,b)=>b.utility-a.utility);
    const best=marketUnits[0];if(!best)break;
    const inst=best.inst,card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
    if(!prefAiCanBuyMarketUnit(region,inst,best.utility))break;
    const price=prefValueFromInstance(inst),seller=inst.sellerRegionId;
    const reasons=prefAiMarketReasons(region,inst);
    reasons.push(`所持キャラ${currentUnits.length}/5枚の不足を補い、シナジー効用${best.utility.toFixed(1)}・価格${prefFormatMoney(price)}・購入後資金を比較`);
    if(region.aiMemory?.rebuildPending?.status==='pending')reasons.push('敗北後の再構築中：単なる穴埋めではなく、交換後の先発4枚の勝ち筋と控えまで比較');
    prefBook(region.id,-price,'market-buy');if(seller)prefBook(seller,price,'market-sale');
    prefSetInstanceOwner(inst,region.id,true);inst.expiresAtAbs=prefAbsTurn()+PREF_CARD_LIFETIME;
    prefRecordAIThought(region,'カード購入',`市場で「${card?.name||'キャラカード'}」を購入`,reasons,{cardName:card?.name,price,utility:best.utility,rosterBefore:currentUnits.length,rosterAfter:prefOwnedUnits(region.id).length});
    prefLog(`${region.prefecture}が所持キャラ${currentUnits.length}枚からの補強として、市場の「${card?.name||'キャラカード'}」を購入しました。`,'info');
    marketUnitPurchases++;
    try { prefRefreshAIPlan(region,'カード購入・編成シナジー再評価'); }
    catch(err) { console.error(`[Prefecture] AI plan refresh after market purchase failed for ${region.id}`,err); }
  }
  } catch(marketErr) {
    console.error(`[Prefecture] AI market refill scoring failed for ${region.id}; continuing to gacha`,marketErr);
    prefLog(`${region.prefecture}の市場補充評価に問題が発生したため、市場判断を切り上げてガチャ補充へ進みます。`,'warning');
  }

  // If the market cannot complete the roster, use gacha while funds and useful candidates remain.
  // B-rank gacha yields characters 80% of the time; C is the cheaper fallback (50%).
  region._aiEconomyPhase='不足枠のガチャ補充';
  let refillDraws=0;
  // No arbitrary pull-count cap. Every draw costs money, so affordability and available
  // worthwhile cards terminate naturally, including repeated magic or weak results.
  while(prefOwnedUnits(region.id).length<5){
    const available=prefEligibleGachaUnitInstances();if(!available.length)break;
    const prioritizeQuality=prefAiShouldPrioritizeQualityGacha(region,null,available);
    const hasHigherRankInPool=available.some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4);
    const key=prefAiChooseGachaTier(region,prioritizeQuality);if(!key)break;
    await prefAiEconomyYield(region,++refillDraws,'不足枠のガチャ補充');
    const g=PREF_GACHA[key];const beforeCount=prefOwnedUnits(region.id).length;
    const cost=g.price;prefBook(region.id,-cost,'gacha');
    region._aiPendingGachaDebit={amount:cost,stage:'不足枠補充'};
    const selected=prefResolveGachaTier(key);
    if(!selected){prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
    if(selected.kind==='unit'&&selected.instance){
      const inst=selected.instance;const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
      // Do not let a random low-rank outcome fill the final roster slot when this A/B/S rival
      // can afford quality gacha and the drawable pool contains ★4+ characters. List and retry
      // while funds and valuable pool remain; if no better pool exists, a ★3 remains valid.
      if(prioritizeQuality&&hasHigherRankInPool&&prefRankStars(card)<4){
        prefListInstance(inst,region.id,'ai-low-rank-draw-listing');
        prefGrantGachaBundleMagic(region.id); // Every paid unit draw still grants its guaranteed magic.
        delete region._aiPendingGachaDebit;
        prefRecordAIThought(region,'ガチャ','低ランクの補充を見送り',[
          'A/B/Sランクで資金に余裕があり、★4以上の排出候補も残っているため★3の補充を採用しない',
          `${g.label}の費用は抽選どおり支払い、不要な結果は市場に出品。資金と候補がある間は補充を継続する`
        ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,rosterBefore:beforeCount,rosterAfter:beforeCount});
        continue;
      }
      const acquired=prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha'});
      if(acquired===false){prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
      prefGrantGachaBundleMagic(region.id);
      delete region._aiPendingGachaDebit;
      const afterCount=prefOwnedUnits(region.id).length;
      prefRecordAIThought(region,'ガチャ',`ガチャで「${card?.name||'キャラカード'}」を獲得`,[
        `所持キャラ${beforeCount}/5枚の不足を埋めるため、補充を優先`,
        `${g.label}を${prefFormatMoney(cost)}で利用`,
        `獲得後に基礎性能・役割・手持ちとのシナジーを再評価`,
        `カード選びIQ${profile.cardIQ}/100`
      ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,rosterBefore:beforeCount,rosterAfter:afterCount});
      prefLog(`${region.prefecture}が${g.label}で「${card?.name||'キャラカード'}」を獲得し、所持キャラを${afterCount}/5枚に補充しました。`,'info');
      try { prefRefreshAIPlan(region,'ガチャによるキャラ獲得'); }
      catch(err) { console.error(`[Prefecture] AI plan refresh after gacha failed for ${region.id}`,err); }
    } else if(selected.kind==='magic') {
      if(!prefAiReceiveDrawnMagic(region,selected,'ai-gacha')){
        prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;
      }
      delete region._aiPendingGachaDebit;
      prefRecordAIThought(region,'ガチャ','キャラ以外の結果を受領',[
        `所持キャラ${beforeCount}/5枚の補充を試行`,`${g.label}はマジック排出だったためキャラ枚数は増えず`,
        `まだ補充枠がある場合のみ次の抽選を検討`
      ],{gacha:key,rosterBefore:beforeCount,rosterAfter:prefOwnedUnits(region.id).length});
    } else {
      prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;
    }
  }

  // At five characters, evaluate replacements instead of buying blindly. A high complement value can trigger
  // deterministic market reinforcement; repeated draws are funded only when the pool has
  // a meaningful upgrade opportunity and a sufficient cash reserve remains.
  region._aiEconomyPhase='5枚揃った後の市場・ガチャ改善';
  let units=prefOwnedUnits(region.id);
  let upgradeDraws=0;
  if(units.length>=5){
    let marketUnits=[];
    try {
      marketUnits=prefAiShortlistMarketUnitInstances(region,region.aiMemory?.rebuildPending?.status==='pending'?28:18)
        .map(inst=>({inst,utility:prefAiMarketUtility(region,inst)}))
        .filter(x=>prefAiCanBuyMarketUnit(region,x.inst,x.utility)&&prefAiMarketUpgradeQualifies(region,x.inst,x.utility))
        .sort((a,b)=>b.utility-a.utility)
        .slice(0,4);
    } catch(err) {
      console.error(`[Prefecture] AI market upgrade scoring failed for ${region.id}; continuing gacha evaluation`,err);
      prefLog(`${region.prefecture}の市場でシナジー補強を評価できなかったため、ガチャ判断は継続します。`,'warning');
    }
    let boughtUpgrade=false;
    for(const row of marketUnits){
      const inst=row.inst,card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
      const replacement=prefAiUnitReplacementChoice(region,units,inst);
      if(!replacement||replacement===inst.id)continue;
      if(!prefAiCanBuyMarketUnit(region,inst,row.utility))continue;
      const price=prefValueFromInstance(inst),seller=inst.sellerRegionId;
      // Decide the replacement before the purchase. Never pay for a card that the AI immediately rejects.
      prefBook(region.id,-price,'market-buy');if(seller)prefBook(seller,price,'market-sale');
      const old=campaignState.instances[replacement];if(old)prefListInstance(old,region.id,'ai-synergy-upgrade');
      prefSetInstanceOwner(inst,region.id,true);inst.expiresAtAbs=prefAbsTurn()+PREF_CARD_LIFETIME;
      prefRecordAIThought(region,'カード購入',`シナジー強化のため「${card?.name||'キャラカード'}」を採用`,[
        '5枚の基本枠は埋まっているため、単純な枚数確保ではなく置き換えを評価',
        ...prefAiMarketReasons(region,inst),
        `効用${row.utility.toFixed(1)}の候補を採用し、編成への適合度が低い「${prefCardForInstance(replacement)?.name||'既存カード'}」と交換`
      ],{cardName:card?.name,price,utility:row.utility,replaced:prefCardForInstance(replacement)?.name||replacement});
      prefLog(`${region.prefecture}がデッキの相性を強化するため「${card?.name||'キャラカード'}」を購入し、既存カードを入れ替えました。`,'info');
      prefRefreshAIPlan(region,'シナジー向上カードへ交換');boughtUpgrade=true;break;
    }

    // Continue only while a real upgrade remains affordable/likely. No artificial draw-count cap.
    // If only a magic was drawn, the character pool and roster are unchanged; reuse the
    // expensive expected-upgrade score instead of running a 12-22-card search again.
    let lastPotentialKey='', lastPotential=-Infinity;
    while(!boughtUpgrade){
      const eligible=prefEligibleGachaUnitInstances();
      const qualityPriority=prefAiShouldPrioritizeQualityGacha(region,units,eligible);
      const hasHigherRankInPool=eligible.some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4);
      const key=prefAiChooseGachaTier(region,qualityPriority);
      const utilityGate=2.5; // Every rival evaluates practical upgrade value without IQ-based blindness.
      let potential=-Infinity;
      // When a ★3 is present, the roster is rebuilding, or another good ★5 is available, quality
      // gacha is already justified. Skip the expensive average-potential calculation in that case.
      // Other tiers use a smaller shortlist; A/B/S use a broader one when no direct repair is needed.
      if(!qualityPriority&&eligible.length&&key){
        const potentialKey=`${key}|${eligible.length}|${units.map(x=>String(x.id)).join(',')}`;
        if(potentialKey===lastPotentialKey)potential=lastPotential;
        else {
          try { potential=prefAiBestGachaUpgradePotential(region,['S','A','B'].includes(region.tier)?22:12,eligible); }
          catch(err) { console.error(`[Prefecture] AI gacha upgrade scoring failed for ${region.id}`,err); }
          lastPotentialKey=potentialKey;lastPotential=potential;
        }
      }
      if(!(eligible.length&&(potential>=utilityGate||qualityPriority)&&key))break;
      await prefAiEconomyYield(region,++upgradeDraws,'シナジー強化のガチャ');
      {
        const g=PREF_GACHA[key],cost=g.price,before=units.length;prefBook(region.id,-cost,'gacha');
        region._aiPendingGachaDebit={amount:cost,stage:'シナジー補強'};
        const selected=prefResolveGachaTier(key);
        if(!selected){prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
        else if(selected.kind==='unit'&&selected.instance){
          const inst=selected.instance,card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
          if(qualityPriority&&hasHigherRankInPool&&prefRankStars(card)<4){
            prefListInstance(inst,region.id,'ai-low-rank-upgrade-listing');
        prefGrantGachaBundleMagic(region.id); // Every paid unit draw still grants its guaranteed magic.
            delete region._aiPendingGachaDebit;
            prefRecordAIThought(region,'ガチャ','低ランクの強化候補を拒否',[
              '★4以上の排出候補が残っており、上位ランクAIは★3で既存の★4以上を置き換えない',
              '抽選費用は消費し、不要カードは市場へ出品する。翌週も高品質候補を評価する'
            ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,rosterBefore:units.length,rosterAfter:units.length});
          } else {
          const replacement=prefAiUnitReplacementChoice(region,units,inst);
          if(replacement&&replacement!==inst.id){
            const old=campaignState.instances[replacement];if(old)prefListInstance(old,region.id,'ai-gacha-synergy-upgrade');
            const acquired=prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha-upgrade'});
            if(acquired===false){prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
            else {
              prefGrantGachaBundleMagic(region.id);
              delete region._aiPendingGachaDebit;
              prefRecordAIThought(region,'ガチャ','シナジー改善候補を抽選',[
                qualityPriority?'先発補充・★3改善・敗北後再構築・★5強化の優先条件を満たした':`現デッキの期待補強値${potential.toFixed(1)}が基準${utilityGate.toFixed(1)}以上`,
                `${g.label}を${prefFormatMoney(cost)}で利用し、獲得カードと最弱枠を比較`,
                `採用できるカードが出たため、${prefCardForInstance(replacement)?.name||'既存カード'}と交換`
              ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,potential,replaced:prefCardForInstance(replacement)?.name||replacement});
              prefLog(`${region.prefecture}がデッキ補強を狙ってガチャを利用し、シナジー候補「${card?.name||'キャラカード'}」を採用しました。`,'info');
              try { prefRefreshAIPlan(region,'ガチャでシナジー補強'); }
              catch(err) { console.error(`[Prefecture] AI plan refresh after synergy gacha failed for ${region.id}`,err); }
              boughtUpgrade=true; // objective fulfilled; remaining upgrades are re-evaluated on the next turn
            }
          }else{
            // Actual gacha draw is paid even when it cannot upgrade the roster.
            // Listing preserves the result for the market rather than granting a free reroll.
            prefListInstance(inst,region.id,'ai-rejected-gacha-upgrade');
            prefGrantGachaBundleMagic(region.id);
            delete region._aiPendingGachaDebit;
          }
          }
        }else if(selected.kind==='magic'){
          if(!prefAiReceiveDrawnMagic(region,selected,'ai-gacha-upgrade')){
            prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;
          }
          delete region._aiPendingGachaDebit;
          prefRecordAIThought(region,'ガチャ','シナジー補強を狙ったがマジック排出',[
            `現デッキの補強期待値${potential.toFixed(1)}を確認して抽選`,`${g.label}からマジックが排出されたため、キャラ編成は維持`
          ],{gacha:key,potential});
        }else{prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
      }
    }
  }

  // 敗北でカードを失った場合も、補充だけで終了せず、同じターンの経済処理内で5枚全体の再構築・置換候補を評価する。
  const rebuild=region.aiMemory?.rebuildPending;
  if(rebuild?.status==='pending'&&prefOwnedUnits(region.id).length>=5){
    prefRecordAIThought(region,'敗北後の再構築','敗北とカード損失を受けて編成を再評価',[
      `前回の敗北で失ったカード：${(rebuild.destroyedCards||[]).map(x=>x.name||'キャラカード').join('、')||'記録なし'}`,
      '補充枠を埋めるだけでなく、先発4枚の勝ち筋・AP需要・役割相性を再評価',
      '単体性能だけでなく、交換後の最良の先発4枚と控え1枚を比較',
      `資金残高：${prefFormatMoney(region.funds||0)}。購入は勝ち筋の改善と購入後の資金を併せて判断`
    ],{opponentId:rebuild.opponentId||null,destroyedCards:rebuild.destroyedCards||[],funds:Number(region.funds)||0,rosterNames:prefOwnedUnits(region.id).map(x=>(prefCardForInstance(x.id)||prefTemplate(x.templateId))?.name||'キャラ')});
    rebuild.status='evaluated';rebuild.evaluatedAtAbs=prefAbsTurn();
  }
  // Magic buying is secondary to the five-character battle roster, but still uses synergy and a cash reserve.
  region._aiEconomyPhase='マジック市場の補強';
  // The roster may have changed after market purchases/gacha this week.
  prefAiListUnusableSkillCards(region);
  units=prefOwnedUnits(region.id);
  const magics=prefOwnedMagics(region.id);
  if(units.length>=5){
    const floor=Math.min(10000000,Math.max(1000000,(Number(region.funds)||0)*0.05));
    const heldTemplateIds=new Set(magics.map(x=>String(x.templateId)));
    // Exclude incompatible spells, own/duplicate listings and unaffordable cards
    // *before* detailed scoring, and evaluate only the best tactically plausible
    // options (normally magic market contains many low-value duplicate listings).
    const candidates=prefMarketListings('magic',false)
      .filter(inst=>prefAiMarketMagicFastEligible(region,inst,heldTemplateIds,units.length,floor))
      .map(inst=>({inst,card:prefCardForInstance(inst.id)||prefTemplate(inst.templateId)}))
      .sort((a,b)=>prefMagicTacticalValue(b.card)-prefMagicTacticalValue(a.card))
      .slice(0,12)
      .map(row=>({inst:row.inst,utility:prefAiMarketUtility(region,row.inst)}))
      .sort((a,b)=>b.utility-a.utility);
    const best=candidates[0];
    const threshold=11; // 戦闘効果に基づく最低効用は全代表に共通
    if(best&&best.utility>=threshold&&region.funds-prefValueFromInstance(best.inst)>=floor){
      const candidate=best.inst,card=prefCardForInstance(candidate.id)||prefTemplate(candidate.templateId),price=prefValueFromInstance(candidate),seller=candidate.sellerRegionId;
      const oldId=magics.length>=5?prefAiMagicReplacementChoice(region,magics,candidate):null;
      // Do not buy an inferior spell merely to replace an existing hand card.
      if(oldId!==candidate.id){
        const old=oldId&&campaignState.instances[oldId];
        const reasons=prefAiMarketReasons(region,candidate);
        prefBook(region.id,-price,'market-buy');if(seller)prefBook(seller,price,'market-sale');
        if(old)prefListInstance(old,region.id,'ai-better-skill-card-market-upgrade');
        prefSetInstanceOwner(candidate,region.id,false);candidate.expiresAtAbs=null;
        prefRecordAIThought(region,'マジック購入',`「${card?.name||'マジック'}」を購入`,[...reasons,`候補の効用${best.utility.toFixed(1)}と価格${prefFormatMoney(price)}を比較`,old?`既存カード「${prefCardForInstance(old.id)?.name||'マジック'}」と入れ替え`:'所持枠に余裕があるため追加取得'],{cardName:card?.name,price,utility:best.utility,replaced:old?.id||null});
        prefLog(`${region.prefecture}が相性のよいマジック「${card?.name||'マジック'}」を${old?'入れ替えて':''}購入しました。`,'info');
        prefRefreshAIPlan(region,'マジックカードを購入');
      }
    }
  }
  region._aiEconomyPhase='構築計画の最終更新';
  prefRefreshAIPlan(region,'カード獲得・市場の変化');
  const countEnd=prefOwnedUnits(region.id).length;
  if(countEnd<5){
    prefRecordAIThought(region,'補充状況','補充処理後も5枚未満',[
      `開始時${unitCountAtStart}枚→現在${countEnd}枚`,
      prefEligibleGachaUnitInstances().length?'ガチャに対象キャラが残っているため、次のターンも補充を優先':'ガチャ対象キャラが残っていないため、市場への出品を待つ'
    ],{rosterStart:unitCountAtStart,rosterEnd:countEnd});
  }
  delete region._aiEconomyPhase;
}
function prefBuildTurnResolutionQueue(actions,pairs,unmatched,investigationsAlreadyResolved=false) {
  const pairByRegion=new Map();
  for(const pair of Array.isArray(pairs)?pairs:[]){pairByRegion.set(String(pair.a),pair);pairByRegion.set(String(pair.b),pair);}
  const queue=[];const seenPairs=new Set();
  // Once every command/opponent is known, resolve actions a second time in the same rank order.
  // A battle is one joint action and is placed where the higher-ranked member appears first.
  for(const region of prefTurnOrderRegions()){
    const id=String(region.id),action=actions?.[region.id];
    if(action?.type==='battle'){
      const pair=pairByRegion.get(id);
      if(pair&&!seenPairs.has(String(pair.id))){
        seenPairs.add(String(pair.id));
        queue.push({id:`battle:${pair.id}`,type:'battle',pairId:pair.id,status:pair.status==='done'?'done':'pending'});
      }else if(unmatched===region.id){
        queue.push({id:`unmatched:${id}`,type:'unmatched',regionId:region.id,status:'done'});
      }
    }else if(action?.type==='investigate'){
      queue.push({id:`investigate:${id}`,type:'investigate',regionId:region.id,status:investigationsAlreadyResolved?'done':'pending'});
    }
  }
  return queue;
}
function prefEnsureTurnResolutionQueue(tx) {
  if(!tx)return [];
  tx.pairs=Array.isArray(tx.pairs)?tx.pairs:[];
  tx.actions=tx.actions&&typeof tx.actions==='object'?tx.actions:{};
  if(!Array.isArray(tx.resolutionQueue)){
    tx.resolutionQueue=prefBuildTurnResolutionQueue(tx.actions,tx.pairs,tx.unmatched,!!tx.investigationsResolved);
  }
  const resolvedInvestigations=new Set(Array.isArray(tx.resolvedInvestigationIds)?tx.resolvedInvestigationIds.map(String):[]);
  for(const step of tx.resolutionQueue){
    if(step.type==='battle'){
      const pair=tx.pairs.find(x=>String(x.id)===String(step.pairId));
      if(pair?.status==='done')step.status='done';
    }else if(step.type==='investigate'&&(tx.investigationsResolved||resolvedInvestigations.has(String(step.regionId))))step.status='done';
  }
  const next=tx.resolutionQueue.findIndex(step=>step.status!=='done');
  tx.resolutionIndex=next<0?tx.resolutionQueue.length:next;
  return tx.resolutionQueue;
}
function prefEnsureTurnLoadingOverlay() {
  let overlay=document.getElementById('pref-turn-loading-overlay');
  if(overlay)return overlay;
  overlay=document.createElement('div');
  overlay.id='pref-turn-loading-overlay';
  overlay.className='hidden';
  overlay.style.position='fixed';overlay.style.inset='0';overlay.style.zIndex='110';
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','polite');
  overlay.innerHTML=`<div class="w-full max-w-md rounded-2xl border-2 border-amber-500/60 bg-slate-900 p-6 sm:p-8 text-center shadow-2xl">
    <div id="pref-turn-loading-spinner" aria-hidden="true"></div>
    <h2 id="pref-turn-loading-title" class="mt-5 text-xl sm:text-2xl font-black text-amber-200">ターン処理中</h2>
    <p id="pref-turn-loading-text" class="mt-3 text-sm leading-relaxed text-slate-200">AI代表の行動を準備しています…</p>
    <div id="pref-turn-loading-track"><div id="pref-turn-loading-bar" style="width:2%"></div></div>
    <p class="mt-3 text-[11px] text-slate-400">処理中です。画面を閉じず、そのままお待ちください。</p>
  </div>`;
  document.body.appendChild(overlay);
  return overlay;
}
function prefShowTurnLoading(title='ターン処理中',text='AI代表の行動を準備しています…',percent=2) {
  const overlay=prefEnsureTurnLoadingOverlay();
  overlay.classList.remove('hidden');
  const titleEl=document.getElementById('pref-turn-loading-title');
  const textEl=document.getElementById('pref-turn-loading-text');
  const bar=document.getElementById('pref-turn-loading-bar');
  if(titleEl)titleEl.textContent=String(title||'ターン処理中');
  if(textEl)textEl.textContent=String(text||'処理しています…');
  if(bar)bar.style.width=`${Math.max(2,Math.min(100,Number(percent)||2))}%`;
}
function prefHideTurnLoading() {
  document.getElementById('pref-turn-loading-overlay')?.classList.add('hidden');
}
function prefSetPreparationProgress(index,total,regionName='') {
  const safeTotal=Math.max(1,Number(total)||1),safeIndex=Math.max(0,Math.min(safeTotal,Number(index)||0));
  const percent=4+(safeIndex/safeTotal)*28;
  const where=regionName?`対象代表：${regionName}`:'AIの準備を開始しています';
  prefShowTurnLoading('全代表の行動を準備中',`市場・ガチャ・対戦・調査方針を計算しています（${safeIndex}/${safeTotal}代表） · ${where}`,percent);
  const panelText=document.getElementById('pref-turn-progress-text');
  const panelBar=document.getElementById('pref-turn-progress-bar');
  if(panelText)panelText.textContent=`AI代表の判断を準備中：${safeIndex}/${safeTotal}${regionName?`（${regionName}）`:''}`;
  if(panelBar)panelBar.style.width=`${Math.round(safeIndex/safeTotal*30)}%`;
}
async function prefYieldToBrowser() {
  await new Promise(resolve=>setTimeout(resolve,0));
}

function prefTurnResolutionProgress(tx) {
  const queue=Array.isArray(tx?.resolutionQueue)?tx.resolutionQueue:[];
  const done=queue.filter(step=>step.status==='done').length;
  const progress=Math.round(done/Math.max(1,queue.length)*100);
  const bar=document.getElementById('pref-turn-progress-bar'),txt=document.getElementById('pref-turn-progress-text');
  if(bar)bar.style.width=`${progress}%`;
  const message=`順位順の対戦・調査処理 ${done}/${queue.length} 件を処理しました。`;
  if(txt)txt.textContent=message;
  const txStage=campaignState?.turnProcessing?.stage;
  if(txStage && txStage!=='player-preview' && txStage!=='awaiting-capacity'){
    prefShowTurnLoading('対戦・調査を順番に処理中',message,35+progress*0.62);
  }
  return {done,total:queue.length,progress};
}
function prefNextTurnResolution(tx) {
  const queue=prefEnsureTurnResolutionQueue(tx);
  const step=queue[tx.resolutionIndex];
  return step||null;
}

function prefPairBattlers(actions) {
  const orderIndex=new Map(prefTurnOrderRegions().map((r,i)=>[String(r.id),i]));
  let fighters=Object.entries(actions).filter(([id,a])=>a?.type==='battle').map(([id])=>id);
  fighters.sort((a,b)=>prefRankOf(a)-prefRankOf(b)||(orderIndex.get(String(a))??999)-(orderIndex.get(String(b))??999)||String(a).localeCompare(String(b),'ja'));
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
  for(const region of prefTurnOrderRegions()){
    const action=actions?.[region.id];if(!action)continue;
    region.lastCommand=action.type;region.lastCommandAbs=prefAbsTurn();
    if(action.type==='battle'){region.nonBattleStreak=0;region.lastBattleAbs=prefAbsTurn();}
    else region.nonBattleStreak=Math.min(3,(region.nonBattleStreak||0)+1);
  }
}
function prefAutoBuyListedMagics(region){
  if(!campaignState||!region)return false;region.autoBuyMagicTemplateIds=Array.isArray(region.autoBuyMagicTemplateIds)?region.autoBuyMagicTemplateIds:[];
  for(const templateId of region.autoBuyMagicTemplateIds){
    if(prefOwnedMagics(region.id).some(i=>String(i.templateId)===String(templateId)))continue;
    const listing=prefMarketListings('magic').find(i=>String(i.templateId)===String(templateId)&&i.sellerRegionId!==region.id);
    if(!listing)continue;
    const cost=prefValueFromInstance(listing);if(Number(region.funds)<cost||Number(region.funds)-cost<0)continue;
    const owned=prefOwnedMagics(region.id);
    if(owned.length>=PREF_MAGIC_LIMIT){
      if(region.isPlayer){
        const seller=listing.sellerRegionId;
        prefBook(region.id,-cost,'auto-buy-magic');if(seller&&seller!==region.id)prefBook(seller,cost,'market-sale');
        listing.zone='pending';listing.ownerId=null;listing.sellerRegionId=null;listing.listedAtAbs=null;listing.marketExpiresAbs=null;listing.expiresAtAbs=null;listing.acquiredAtAbs=null;
        campaignState.pendingAcquisition={kind:'magic',instanceId:listing.id,regionId:region.id,reason:'auto-buy-magic'};
        prefLog(`自動購入でマジックカード「${prefTemplate(templateId)?.name||'カード'}」を購入しました。所持上限${PREF_MAGIC_LIMIT}枚のため、出品する既存カードを選んでください。`,'info');
        return 'pending';
      }
      // AI-controlled regions resolve capacity without player interaction: only replace a card when
      // the incoming magic has greater estimated utility than the weakest one currently held.
      const replacement=prefAiMagicReplacementChoice(region,owned,listing);
      if(replacement===listing.id)continue;
      prefBook(region.id,-cost,'auto-buy-magic');if(listing.sellerRegionId&&listing.sellerRegionId!==region.id)prefBook(listing.sellerRegionId,cost,'market-sale');
      const old=campaignState.instances[replacement];if(old)prefListInstance(old,region.id,'ai-magic-replacement');
      prefSetInstanceOwner(listing,region.id,false);listing.expiresAtAbs=null;
      prefLog(`${region.prefecture}が自動購入設定により「${prefTemplate(templateId)?.name||'マジックカード'}」を購入し、所持上限に合わせて既存カードを入れ替えました。`,'info');
      continue;
    }
    prefBook(region.id,-cost,'auto-buy-magic');if(listing.sellerRegionId&&listing.sellerRegionId!==region.id)prefBook(listing.sellerRegionId,cost,'market-sale');
    prefSetInstanceOwner(listing,region.id,false);listing.expiresAtAbs=null;
    prefLog(`${region.prefecture}が自動購入設定によりマジックカード「${prefTemplate(templateId)?.name||'カード'}」を${prefFormatMoney(cost)}で購入しました。`,'info');
  }
  return false;
}
async function prefAiEmergencyGachaRefill(region) {
  // Recovery path used only when the full AI economy planner throws. It deliberately avoids
  // market scoring and AI-plan helpers so a failure in those systems cannot suppress basic refill.
  if(!campaignState||!region||region.isPlayer)return 0;
  let acquired=0,attempts=0;
  while(prefOwnedUnits(region.id).length<5){
    await prefAiEconomyYield(region,++attempts,'復旧ガチャ補充');
    const eligible=prefEligibleGachaUnitInstances();
    if(!eligible.length)break;
    const hasHigherRankInPool=eligible.some(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4);
    const units=prefOwnedUnits(region.id).length;
    const funds=Math.max(0,Number(region.funds)||0);
    const tier=String(region.tier||'E');
    const allowedA=['S','A','B'].includes(tier);
    const allowedB=['S','A','B','C','D'].includes(tier);
    // Filling a battle roster takes priority over the normal cash reserve; still use the
    // highest affordable legal tier that leaves a small reserve where possible.
    let key=null;
    if(allowedA&&['S','A','B'].includes(tier)&&funds>=PREF_GACHA.A.price+10000000)key='A';
    else if(allowedB&&funds>=PREF_GACHA.B.price+2000000)key='B';
    else if(funds>=PREF_GACHA.C.price)key='C';
    if(!key)break;
    const cost=PREF_GACHA[key].price;
    let selected=null;
    try { selected=prefResolveGachaTier(key); }
    catch(err) {
      console.error(`[Prefecture] Emergency gacha draw resolution failed for ${region.id}`,err);
      break;
    }
    if(!selected||!['unit','magic'].includes(selected.kind))break;
    prefBook(region.id,-cost,'gacha');
    region._aiPendingGachaDebit={amount:cost,stage:'復旧ガチャ'};
    if(selected.kind==='unit'&&selected.instance){
      const inst=selected.instance;
      const card=prefCardForInstance(inst.id)||prefTemplate(inst.templateId);
      const qualityCanBeBought=['S','A','B'].includes(tier)&&funds>=PREF_GACHA.A.price+prefAiUnitReserveFloor(region);
      if(qualityCanBeBought&&hasHigherRankInPool&&prefRankStars(card)<4){
        prefListInstance(inst,region.id,'ai-low-rank-recovery-listing');
        prefGrantGachaBundleMagic(region.id); // Every paid unit draw still grants its guaranteed magic.
        delete region._aiPendingGachaDebit;
        prefRecordAIThought(region,'ガチャ','復旧補充の低ランク候補を見送り',[
          '通常の経済判断が失敗した場合でも、資金と★4以上の候補がある上位AIには★3を補充しない',
          '抽選費用は消費し不要カードは市場へ。資金と候補がある間は再抽選する'
        ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,recovery:true,rosterBefore:units,rosterAfter:units});
        continue;
      }
      const got=prefAcquireInstance(region.id,inst.id,{reason:'ai-gacha-recovery'});
      if(got===false){prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;}
      prefGrantGachaBundleMagic(region.id);
      delete region._aiPendingGachaDebit;
      acquired++;
      prefRecordAIThought(region,'ガチャ',`補充エラーから復旧し「${card?.name||'キャラカード'}」を獲得`,[
        '通常の市場・ガチャ判断で例外が発生したため、補充専用の安全経路を使用',
        `所持キャラ${units}/5枚から補充を再開`,
        `${PREF_GACHA[key].label}を${prefFormatMoney(cost)}で利用`,
        `補充後は所持キャラ${prefOwnedUnits(region.id).length}/5枚`
      ],{cardName:card?.name,rank:prefRankStars(card),gacha:key,recovery:true,rosterBefore:units,rosterAfter:prefOwnedUnits(region.id).length});
      prefLog(`${region.prefecture}が補充判断の復旧処理で${PREF_GACHA[key].label}を利用し、キャラカードを獲得しました。`,'warning');
    } else {
      if(!prefAiReceiveDrawnMagic(region,selected,'ai-gacha-recovery')){
        prefBook(region.id,cost,'gacha-refund');delete region._aiPendingGachaDebit;break;
      }
      delete region._aiPendingGachaDebit;
      prefRecordAIThought(region,'ガチャ','復旧用ガチャでマジックが排出',[
        '通常の経済判断が失敗したため、キャラ補充を継続する安全経路で抽選',
        `${PREF_GACHA[key].label}からマジックが排出され、キャラ枚数は増えず`,
        '所持枠・候補・資金が許す限り追加補充を検討'
      ],{gacha:key,recovery:true,rosterBefore:units,rosterAfter:prefOwnedUnits(region.id).length});
    }
  }
  return acquired;
}

function prefFallbackAiCommand(region) {
  const otherIds=prefTurnOrderRegions().filter(r=>r.id!==region?.id).map(r=>r.id);
  const target=otherIds.length?prefRandom(otherIds):null;
  const mustBattle=(Number(region?.nonBattleStreak)||0)>=3 && prefCanFormLegalBattleSquad(prefOwnedUnits(region?.id));
  const justBattled=Number(region?.lastBattleAbs)>0 && Number(region.lastBattleAbs)===prefAbsTurn()-1;
  if(mustBattle && !justBattled)return {type:'battle'};
  return {type:'investigate',target:target||PREF_PLAYER_ID,topic:'cards'};
}
async function prefGetAiTurnAction(region) {
  try {
    await prefAiTryEconomy(region);
  } catch(err) {
    const failedPhase=String(region._aiEconomyPhase||'処理開始前');
    console.error(`[Prefecture] AI economy failed for ${region.id} during ${failedPhase}; attempting isolated gacha refill`,err);
    if(region._aiPendingGachaDebit&&Number(region._aiPendingGachaDebit.amount)>0){
      const debit=Number(region._aiPendingGachaDebit.amount);
      prefBook(region.id,debit,'gacha-refund');
      delete region._aiPendingGachaDebit;
      prefLog(`${region.prefecture}のガチャ処理が結果の確定前に中断されたため、未確定の抽選費用を返金しました。`,'warning');
    }
    prefLog(`${region.prefecture}の市場・ガチャ判断で「${failedPhase}」中にエラーが発生しました。通常の補充判断を切り離し、ガチャ補充を再試行します。`,'warning');
    try {
      const recovered=await prefAiEmergencyGachaRefill(region);
      if(recovered>0)prefRefreshAIPlan(region,'エラー後のガチャ補充',true);
    } catch(recoveryErr) {
      console.error(`[Prefecture] AI emergency gacha refill failed for ${region.id}`,recoveryErr);
      if(region._aiPendingGachaDebit&&Number(region._aiPendingGachaDebit.amount)>0){prefBook(region.id,Number(region._aiPendingGachaDebit.amount),'gacha-refund');delete region._aiPendingGachaDebit;}
      prefLog(`${region.prefecture}のガチャ復旧処理にもエラーが発生しました。抽選未確定の費用は返金し、詳細をブラウザの開発者コンソールに記録しました。`,'warning');
    } finally { delete region._aiEconomyPhase; }
  }
  let action=null;
  try { action=prefDecideAiCommand(region); }
  catch(err) {
    console.error(`[Prefecture] AI command decision failed for ${region.id}; using fallback`,err);
    prefLog(`${region.prefecture}のコマンド選択でエラーが発生したため、安全な代替コマンドを使用しました。`,'warning');
    action=prefFallbackAiCommand(region);
  }
  if(!action || !['battle','investigate'].includes(action.type))action=prefFallbackAiCommand(region);
  if(action.type==='investigate' && (!action.target || !prefRegion(action.target) || action.target===region.id)){
    action={...action,target:prefTurnOrderRegions().find(x=>x.id!==region.id)?.id||PREF_PLAYER_ID,topic:action.topic||'cards'};
  }
  return action;
}
function prefMakeTurnActions(playerAction) {
  // Normally all actions were planned in a single ranked pass, after the market/gacha decision
  // for each representative. The fallback below supports older or partially saved transactions.
  const prepared=campaignState?.turnProcessing?.preparedActions;
  const actionById={[PREF_PLAYER_ID]:playerAction};
  for(const r of prefTurnOrderRegions()){
    if(r.isPlayer || r.id===PREF_PLAYER_ID)continue;
    const preselected=prepared?.[r.id];
    if(preselected&&['battle','investigate'].includes(preselected.type))actionById[r.id]=preselected;
    else {
      try { actionById[r.id]=prefFallbackAiCommand(r); }
      catch(err) {
        console.error(`[Prefecture] legacy AI action recovery failed for ${r.id}`,err);
        const canBattle=prefCanFormLegalBattleSquad(prefOwnedUnits(r.id));
        const mustBattle=canBattle&&(Number(r.nonBattleStreak)||0)>=3&&!(Number(r.lastBattleAbs)>0&&Number(r.lastBattleAbs)===prefAbsTurn()-1);
        actionById[r.id]=mustBattle?{type:'battle'}:{type:'investigate',target:prefTurnOrderRegions().find(x=>x.id!==r.id)?.id||PREF_PLAYER_ID,topic:'cards'};
      }
    }
  }
  const ordered={};
  for(const r of prefTurnOrderRegions())if(actionById[r.id])ordered[r.id]=actionById[r.id];
  if(!ordered[PREF_PLAYER_ID])ordered[PREF_PLAYER_ID]=playerAction;
  return ordered;
}
async function prefPrepareTurnActionsInRankOrder(playerAction,tx) {
  if(!campaignState||!tx||campaignState.turnProcessing!==tx)return false;
  const ordered=prefTurnOrderRegions();
  tx.preparedActions=tx.preparedActions&&typeof tx.preparedActions==='object'?tx.preparedActions:{};
  tx.preparedActions[PREF_PLAYER_ID]=playerAction;
  tx.preparationProcessedIds=Array.isArray(tx.preparationProcessedIds)?tx.preparationProcessedIds.map(String):[];
  const processed=new Set(tx.preparationProcessedIds);
  const start=Math.max(0,Number(tx.preparationIndex)||0);
  prefShowTurnLoading('全代表の行動を準備中',`市場・ガチャ・対戦・調査方針を計算しています（${processed.size}/${ordered.length}代表）`,4+(processed.size/Math.max(1,ordered.length))*28);
  for(let i=start;i<ordered.length;i++){
    const region=ordered[i],id=String(region.id);
    if(processed.has(id))continue;
    tx.preparationIndex=i;
    prefSetPreparationProgress(processed.size,ordered.length,region.prefecture||id);
    // Yield before the relatively expensive per-region AI calculation so the loader paints.
    await prefYieldToBrowser();
    // Each representative finishes their configured auto-buy, discretionary market/gacha
    // evaluation, and command selection before the next-ranked representative starts.
    let autoBuyResult=false;
    try { autoBuyResult=prefAutoBuyListedMagics(region); }
    catch(err) {
      console.error(`[Prefecture] auto-buy failed for ${id}; skipping only this representative's auto-buy`,err);
      prefLog(`${region.prefecture}の自動市場購入に失敗したため、その購入のみスキップしました。`,'warning');
    }
    if(autoBuyResult==='pending'){
      tx.stage='awaiting-capacity';tx.resumePlayerAction=playerAction;tx.preparationIndex=i;
      await prefSave();prefSyncCampaignClones();prefRenderAll();prefHideTurnLoading();prefShowReplaceModal();return false;
    }
    if(!region.isPlayer&&id!==String(PREF_PLAYER_ID)){
      try {
        tx.currentPreparingRegionId=id;
        tx.currentPreparingPhase='economy';
        tx.preparedActions[id]=await prefGetAiTurnAction(region);
      }
      catch(err) {
        console.error(`[Prefecture] AI command preparation failed for ${id}; using safe command`,err);
        const canBattle=prefCanFormLegalBattleSquad(prefOwnedUnits(id));
        const justBattled=Number(region.lastBattleAbs)>0&&Number(region.lastBattleAbs)===prefAbsTurn()-1;
        const mustBattle=canBattle&&!justBattled&&(Number(region.nonBattleStreak)||0)>=3;
        const target=prefTurnOrderRegions().find(x=>String(x.id)!==id)?.id||PREF_PLAYER_ID;
        tx.preparedActions[id]=mustBattle?{type:'battle'}:{type:'investigate',target,topic:'cards'};
        try { prefLog(`${region.prefecture||id}のAI判断に失敗したため、安全な${mustBattle?'対戦':'調査'}コマンドへ切り替えました。`,'warning'); } catch(_) {}
      }
    }
    delete tx.currentPreparingRegionId;
    delete tx.currentPreparingPhase;
    processed.add(id);tx.preparationProcessedIds=[...processed];tx.preparationIndex=i+1;
    prefSetPreparationProgress(processed.size,ordered.length,region.prefecture||id);
    // Save a compact checkpoint every four representatives instead of serializing the entire
    // campaign state after each one. This keeps the UI responsive while limiting replay on interruption.
    if(processed.size%3===0||i===ordered.length-1)await prefSave();
    await prefYieldToBrowser();
  }
  tx.preparationComplete=true;tx.stage='matching';delete tx.resumePlayerAction;
  await prefSave();
  prefShowTurnLoading('対戦相手と処理順を確定中','全代表の判断が終わりました。対戦相手・調査処理の順番を確定しています…',34);
  await prefYieldToBrowser();
  return true;
}
async function prefStartTurnAfterAutoBuy(playerAction,tx) {
  if(!campaignState||!tx||campaignState.turnProcessing!==tx)return;
  const ready=await prefPrepareTurnActionsInRankOrder(playerAction,tx);
  if(!ready)return;
  await prefFinishTurnInitialization(playerAction,tx);
}

async function prefBeginTurn(playerAction) {
  if(!campaignState||campaignState.gameOver||campaignState.turnProcessing)return;
  const p=prefPlayerRegion();
  if(playerAction.type==='battle'&&p.lastBattleAbs>0&&p.lastBattleAbs===prefAbsTurn()-1){prefShowModal('連戦禁止','同じ代表は連続する週に対戦できません。',[{label:'了解',action:'close-modal'}]);return;}
  if(playerAction.type==='investigate'&&(p.nonBattleStreak||0)>=3){prefShowModal('対戦が必要です','3ターン連続で対戦していないため、今週は対戦コマンドを選択してください。',[{label:'了解',action:'close-modal'}]);return;}
  if(playerAction.type==='battle'){
    const owned=prefOwnedUnits(PREF_PLAYER_ID);
    if(owned.length<PREF_BATTLE_ACTIVE){await prefTriggerGameOver('キャラカードが4枚未満の状態で対戦コマンドを選択しました。');return;}
    if(!prefCanFormLegalBattleSquad(owned)){prefShowModal('先発メンバーが不足しています','現在の所持カードでは、★5編成上限を守って先発4体を組めません。★5以外のキャラカードを補充するか、★5カードを市場へ出品してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
    const requested=playerAction.loadout||prefBuildAutoLoadout(owned);
    const normalized=prefNormalizeLoadoutSelection(requested.active||[],requested.reserve||[],owned);
    if(normalized.active.length!==PREF_BATTLE_ACTIVE){prefShowModal('出撃メンバーを確認','保存された編成を有効な出撃4体に修復できませんでした。編成を選び直してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
    playerAction={...playerAction,loadout:normalized};
  }
  const tx={id:generateUniqueId('prefturn'),year:campaignState.year,week:campaignState.week,absoluteTurn:prefAbsTurn(),stage:'matching',actions:{[PREF_PLAYER_ID]:playerAction},pairs:[],pairIndex:0,unmatched:null,investigationResult:null,startedAt:Date.now()};
  campaignState.turnProcessing=tx;campaignState.draftLoadout=null;
  if(playerAction.type==='battle') p.lastLoadout=JSON.parse(JSON.stringify(playerAction.loadout||{active:[],reserve:[]}));
  // Render a visible busy state immediately; previously the UI was refreshed only after
  // all 47 representatives had completed their synchronous AI economy/command calculations.
  prefRenderDashboard();
  prefSetPreparationProgress(0,prefTurnOrderRegions().length,'開始準備');
  await prefSave();
  await prefYieldToBrowser();
  await prefStartTurnAfterAutoBuy(playerAction,tx);
}

function prefInitializeTurnResolution(tx,playerAction) {
  const actions=prefMakeTurnActions(playerAction);
  prefApplyCommandStreaks(actions);
  let matched=prefPairBattlers(actions);
  // Normally there are many AI entrants. If the player is the only entrant, assign a valid
  // rival so a selected battle can proceed, then rebuild the opponent list before any action resolves.
  if(playerAction.type==='battle'&&matched.unmatched===PREF_PLAYER_ID&&!(matched.pairs||[]).some(pair=>pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID)){
    const fallback=prefTurnOrderRegions().filter(r=>r.id!==PREF_PLAYER_ID&&prefCanFormLegalBattleSquad(prefOwnedUnits(r.id))&&!(r.lastBattleAbs>0&&r.lastBattleAbs===prefAbsTurn()-1))
      .sort((a,b)=>Math.abs(prefRankOf(a.id)-prefRankOf(PREF_PLAYER_ID))-Math.abs(prefRankOf(b.id)-prefRankOf(PREF_PLAYER_ID)))[0];
    if(fallback){fallback.lastCommand='battle';fallback.lastCommandAbs=prefAbsTurn();fallback.nonBattleStreak=0;fallback.lastBattleAbs=prefAbsTurn();actions[fallback.id]={type:'battle'};matched=prefPairBattlers(actions);}
  }
  tx.actions=actions;tx.pairs=matched.pairs;tx.unmatched=matched.unmatched;tx.stage='battles';tx.pairIndex=0;tx.currentPairId=null;
  delete tx.preparedActions;delete tx.preparationProcessedIds;delete tx.preparationIndex;delete tx.preparationComplete;
  tx.investigationsResolved=false;tx.resolvedInvestigationIds=[];tx.playerLoadoutConfirmed=false;
  tx.resolutionQueue=prefBuildTurnResolutionQueue(actions,matched.pairs,matched.unmatched,false);tx.resolutionIndex=0;
  if(matched.unmatched)prefLog(`${prefRegion(matched.unmatched)?.prefecture||matched.unmatched}は対戦希望者が奇数だったため、今週は対戦不成立（対戦扱い）となりました。`,'info');
  return tx;
}
async function prefFinishTurnInitialization(playerAction,tx) {
  if(!campaignState||campaignState.turnProcessing!==tx)return;
  prefInitializeTurnResolution(tx,playerAction);
  await prefSave();prefRenderAll();
  prefShowTurnLoading('対戦・調査の処理を開始','代表の行動を順位順に処理しています…',35);
  await prefYieldToBrowser();
  // All pairings are now fixed. The joint battle/investigation actions are resolved in the same rank order.
  await prefContinueTurn();
}

async function prefShowRankedPlayerBattlePreview(pair,tx) {
  if(!campaignState||!tx||campaignState.turnProcessing!==tx||!pair)return;
  const playerAction=tx.actions?.[PREF_PLAYER_ID]||{};
  const opponentId=pair.a===PREF_PLAYER_ID?pair.b:pair.a;
  const opponent=prefRegion(opponentId);
  campaignState.draftLoadout=JSON.parse(JSON.stringify(playerAction.loadout||prefDefaultLoadout(PREF_PLAYER_ID)));
  tx.stage='player-preview';tx.currentPairId=pair.id;tx.pairIndex=Math.max(0,tx.pairs.indexOf(pair));
  tx.playerLoadoutConfirmed=false;
  prefHideTurnLoading();
  await prefSave();prefRenderDashboard();prefEnsurePreviewResumeButton();
  document.getElementById('pref-turn-progress')?.classList.remove('hidden');
  const opponentIconUrl=prefRegionIconUrl(opponent);
  const opponentAvatar=opponentIconUrl?`<img src="${prefEsc(opponentIconUrl)}" alt="" class="w-16 h-16 rounded-full object-cover mx-auto mb-2 border-2 border-rose-500" onerror="this.remove()">`:`<div class="text-4xl mb-2">${prefEsc(opponent?.icon||'🏯')}</div>`;
  prefShowModal('⚔️ 対戦相手が決定',`<div class="text-center">${opponentAvatar}<div class="text-2xl font-black text-rose-200">${prefEsc(opponent?.prefecture||opponentId)}</div><div class="text-lg font-bold mt-1">${prefEsc(opponent?.repName||'代表')}</div><div class="mt-2 text-amber-200 font-black">現在順位：${prefRankOf(opponentId)}位（${prefEsc(opponent?.tier||'E')}ランク）</div><div class="text-xs text-slate-400 mt-1">所持資金：${prefFormatMoney(opponent?.funds||0)}</div><div class="mt-4 rounded-lg border border-rose-900/60 bg-slate-900 p-3 text-sm text-slate-200">全代表の対戦相手は確定済みです。現在の順位順で先行する代表の行動を処理し、京都府の行動順になりました。相手のカード内容は、調査で判明した範囲だけ確認できます。</div><p class="text-xs text-slate-400 mt-3">編成を最終確認すると、この順位から戦闘を行い、その後の代表の対戦・調査を順位順に処理します。</p></div>`,[{label:'閉じる',action:'close-modal'},{label:'編成・調査を確認',action:'battle-preview-back'},{label:'編成を選んで対戦開始',action:'battle-preview-continue',style:'primary'}]);
}

function prefEstimateBuildScenarios(region,activeCards,reserveCards,magicCards) {
  // Lightweight expected-value proxy across three representative tactical situations.
  // This intentionally does not execute the complete battle engine; it gives candidate
  // lineups a small scenario-average adjustment while keeping browser-time bounded.
  const profile=prefAIProfileForRegion(region);
  const active=activeCards||[],reserve=reserveCards||[],magics=magicCards||[];
  const field=[...active,...magics];
  const allTags=new Set();const counts={};
  for(const card of field){for(const tag of prefCardProfile(card).tags){allTags.add(tag);counts[tag]=(counts[tag]||0)+1;}}
  const activeProfiles=active.map(prefCardProfile);
  const highCost=activeProfiles.filter(x=>x.maxCost>=25||x.tags.has('heavy_cost')).length;
  const apSupply=counts.ap_supply||0;
  const attackers=activeProfiles.filter(x=>x.role==='attacker'||(!x.role&&x.tags.has('damage'))).length;
  const frontlineDefenders=activeProfiles.filter(x=>x.tags.has('frontline_defender')).length;
  const roleDefenders=activeProfiles.filter(x=>x.role==='defender').length;
  const sustain=(counts.healing||0)+(counts.shield_defense||0)+(frontlineDefenders*1.2);
  const hasStatusDebuff=allTags.has('status_debuff'),hasStatusCondition=allTags.has('status_condition');
  const mainAttrCount=active.filter(x=>String(x.mainAttr||'')===String(active[0]?.mainAttr||'')).length;
  const attrFocus=profile.primaryStrategy==='attribute'||profile.secondaryStrategies.includes('attribute');

  // Situation A: a short burst window where a large attack has a chance to decide the battle.
  let burst=(counts.damage||0)*1.25+(counts.attack_speed_buff||0)*0.9+highCost*0.8;
  burst+=Math.min(highCost,apSupply)*1.7-Math.max(0,highCost-apSupply)*1.15;
  if(attackers===0)burst-=2.5;

  // Situation B: a longer battle where the main attacker must survive and keep acting.
  let sustainScore=sustain*1.65+activeProfiles.reduce((sum,x)=>sum+Math.min(1.4,Math.max(0,x.hp)/9000),0);
  if(attackers>=2&&sustain===0)sustainScore-=2.2;
  if(attackers>0&&roleDefenders===0)sustainScore-=0.8;
  if(attackers>0&&frontlineDefenders>0)sustainScore+=1.4;
  if(highCost>0&&apSupply===0)sustainScore-=0.6;
  if(active.length<PREF_BATTLE_ACTIVE)sustainScore-=Math.max(0,PREF_BATTLE_ACTIVE-active.length)*2;

  // Situation C: the planned chain actually has setup/payoff cards and enough active slots.
  let chain=0;
  const actualStatusChain=active.some((c,i)=>active.some((d,j)=>i!==j&&prefActualStatusChain(c,d)));
  if(actualStatusChain)chain+=3.0;
  else if(hasStatusCondition&&!active.some(c=>prefActualStatusChain(c,c)))chain-=1.0;
  if((counts.extra_effect||0)>0&&(counts.passive_chain||0)>0)chain+=2.0;
  if(attrFocus&&mainAttrCount>=2)chain+=Math.min(2.4,(mainAttrCount-1)*1.2);
  if(attrFocus&&mainAttrCount<2&&profile.mainAttrPriority.length)chain-=1.3;
  // Distinct role coverage reduces the risk that an otherwise powerful combo has no support.
  const hasDamage=attackers>0,hasSupport=sustain>0||apSupply>0;
  if(hasDamage&&hasSupport)chain+=0.8;
  if(hasDamage&&!hasSupport)chain-=0.7;
  if(hasDamage&&frontlineDefenders>0)chain+=1.2;

  // Secondary strategy shapes the relative importance of the three expected situations.
  let weights=[1,1,1];
  if(['rush','heavy'].includes(profile.primaryStrategy))weights=[1.2,0.75,0.9];
  else if(['sustain','protect','counter'].includes(profile.primaryStrategy))weights=[0.75,1.25,0.9];
  else if(['combo','passive','extra','status','attribute'].includes(profile.primaryStrategy))weights=[0.9,0.9,1.25];
  const vals=[burst,sustainScore,chain];
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  const mean=vals.reduce((sum,v,i)=>sum+v*weights[i],0)/totalWeight;
  const iq=Number(profile.cardIQ)||0;
  // Low card IQ has a noisier estimate and is less likely to recognise sophisticated lines.
  const accuracy=0.93+0.07*iq/100;
  return {mean:mean*accuracy,scenarios:{burst:Number(burst.toFixed(2)),sustain:Number(sustainScore.toFixed(2)),chain:Number(chain.toFixed(2))}};
}

function prefCardHasTeamBuff(card) {
  const skills=Array.isArray(card?.skills)?card.skills:[];
  const buffTypes=new Set(['mod_atk_ratio','mod_atk_val','mod_speed','damage_dealt_ratio','damage_taken_ratio','damage_cut_ratio','shield','mod_ap','mod_max_hp_val','heal_fixed','heal_max_hp_ratio']);
  const broadTargets=new Set(['all_ally','all_allies','all_ally_units','all_allies_units']);
  const isPositiveBuff=e=>{
    if(!e||!buffTypes.has(String(e.type||'')))return false;
    const v=Number(e.val)||0;const t=String(e.type||'');
    if(t==='damage_taken_ratio')return v<0;
    // Only beneficial magnitudes qualify; negative team-wide values are debuffs, not buffs.
    return v>0;
  };
  return skills.some(skill=>{
    const entries=[
      {effect:skill?.mainEffect,target:skill?.targetType||skill?.mainEffect?.targetType},
      ...(skill?.hasSubEffect&&skill?.subEffect?[{effect:skill.subEffect,target:skill.subEffect.targetType||skill?.subEffectTargetType||skill?.targetType}]:[])
    ];
    return entries.some(({effect,target})=>broadTargets.has(String(target||''))&&isPositiveBuff(effect));
  });
}

// v1.0.62: Score what a card actually contributes while it is on the opening field.
// A broad effect tag alone is not evidence that a controller supports its allies:
// inspect target, sign, AP cost, chance and trigger timing. Cached by card object.
const PREF_OPENING_KIT_CACHE = new WeakMap();
function prefOpeningKit(card) {
  if(!card)return {value:0,offense:0,sustain:0,support:0,ap:0,deploy:0,conditions:[],setups:[],reasons:[]};
  const cached=PREF_OPENING_KIT_CACHE.get(card);
  if(cached&&cached.skills===card.skills&&cached.stats===card.stats)return cached.kit;
  const kit={value:0,offense:0,sustain:0,support:0,ap:0,deploy:0,conditions:[],setups:[],reasons:[]};
  const skills=Array.isArray(card.skills)?card.skills:[];
  for(const sk of skills){
    if(!sk||!['active','passive'].includes(sk.type))continue;
    const passive=sk.type==='passive',timing=String(sk.timing||'');
    // On-deploy effects with deploy_turn_gte are useful for a delayed reserve, not the initial field.
    const delayedDeploy=passive&&['deploy','battle_start'].includes(timing)&&sk.selfCond?.type==='deploy_turn_gte'&&Number(sk.selfCond.val)>1;
    if(delayedDeploy)continue;
    const cost=Math.max(0,Number(sk.cost)||0);
    const chance=Math.max(0,Math.min(1,Number(sk.chance??100)/100));
    const selfCond=String(sk.selfCond?.type||'none');
    const conditional=!['none',''].includes(selfCond);
    let factor=chance*(conditional?0.72:1);
    if(passive){
      factor*=timing==='deploy'||timing==='battle_start'?1.15:timing==='turn_start'?1.0:timing==='turn_end'?0.75:0.44;
    }else factor*=cost>40?0.30:cost>20?0.52:cost>10?0.78:1;
    let total=0;
    const entries=[{effect:sk.mainEffect,target:sk.targetType},...(sk.hasSubEffect&&sk.subEffect?[{effect:sk.subEffect,target:sk.subEffect.targetType==='same_main_target'?sk.targetType:sk.subEffect.targetType}]:[])];
    for(const {effect:e,target:rawTarget} of entries){
      if(!e)continue;
      const type=String(e.type||''),v=Number(e.val)||0,target=String(rawTarget||'');
      const allies=['all_ally','all_allies','select_ally_1','random_ally_1','self'].includes(target);
      const enemies=['all_enemy','select_enemy_1','random_enemy_1'].includes(target);
      const broad=['all_ally','all_allies','all_enemy'].includes(target);
      const group=broad?1.65:target==='self'?0.64:1;
      let off=0,sup=0,heal=0,ap=0;
      if(/^dmg_/.test(type)&&enemies)off=type==='dmg_atk_ratio'?Math.min(5,Math.max(0,v)/45):type==='dmg_max_hp_ratio'?Math.min(7,Math.max(0,v)/6):Math.min(6,Math.max(0,v)/750);
      if((type==='mod_atk_ratio'||type==='mod_atk_val'||type==='mod_speed'||type==='damage_dealt_ratio')&&allies&&v>0)sup=Math.min(7,type==='mod_atk_val'?v/500:v/14);
      if(type==='damage_taken_ratio'){
        if(allies&&v<0)heal=Math.min(7,-v/13);
        if(enemies&&v>0)sup=Math.min(7,v/11);
      }
      if(type==='shield'&&allies&&v>0)heal=Math.min(7,v/550);
      if((type.startsWith('heal_')||type==='mod_max_hp_val')&&allies&&v>0)heal=Math.min(7,type==='heal_max_hp_ratio'?v/13:v/600);
      if(type==='mod_ap'){
        if(v>0&&['player_self','self_player','all_ally'].includes(target))ap=Math.min(8,v/5);
        if(v<0&&['enemy_player','player_enemy','opponent'].includes(target))sup=Math.min(6,-v/5);
      }
      if((type==='status_apply'||type==='skill_block'||type==='heal_block')&&enemies){
        const status=type==='status_apply'?String(e.status||''):type;
        sup=Math.max(sup,['freeze','paralysis','pressure','silence','skill_block'].includes(status)?5.5:3.2);
        if(type==='status_apply')kit.setups.push(status);
      }
      if(type==='clear_buffs'&&enemies)sup=Math.max(sup,4.6);
      if(['clear_debuffs','clear_statuses','clear_random_debuffs','heal_block'].includes(type)&&allies)heal=Math.max(heal,3.2);
      // Damage to the entire field and harmful effects on allies are liabilities, not team support.
      if(target==='all_field'&&/^dmg_/.test(type))total-=3.0*factor;
      if(allies&&((type==='mod_atk_ratio'&&v<0)||(type==='damage_taken_ratio'&&v>0)))total-=3.5*factor;
      const amount=(off+sup+heal+ap)*group*factor;
      kit.offense+=off*group*factor;kit.support+=sup*group*factor;
      kit.sustain+=heal*group*factor;kit.ap+=ap*group*factor;
      if(passive&&(timing==='deploy'||timing==='battle_start'))kit.deploy+=amount;
      total+=amount;
    }
    kit.value+=Math.min(11,Math.max(-3,total));
    if((sk.targetCond?.type==='status_is'||sk.selfCond?.type==='status_is')&&typeof(sk.targetCond?.status||sk.selfCond?.status)==='string')kit.conditions.push(sk.targetCond?.status||sk.selfCond?.status);
    if(sk.selfCond?.type==='ally_has_attr'&&sk.selfCond.attr)kit.conditions.push(`ally:${sk.selfCond.attr}`);
  }
  // This is an opening-field opportunity score, not an additional card rank.
  kit.value=Math.min(18,kit.value*0.66);
  kit.support=Math.min(12,kit.support);kit.offense=Math.min(12,kit.offense);
  kit.sustain=Math.min(12,kit.sustain);kit.ap=Math.min(12,kit.ap);
  PREF_OPENING_KIT_CACHE.set(card,{skills:card.skills,stats:card.stats,kit});
  return kit;
}
function prefConcreteOpeningSynergy(cards, kits) {
  const trio=(cards||[]).filter(Boolean),ks=kits||trio.map(prefOpeningKit);
  if(trio.length!==PREF_BATTLE_ACTIVE)return {score:-10,reasons:['先発4体が不足']};
  let score=0;const reasons=[];
  const attrs=trio.map(c=>[String(c.mainAttr||''),...(Array.isArray(c.subAttrs)?c.subAttrs:[])]);
  const setups=new Set(ks.flatMap(k=>k.setups));
  // Explicitly model permanent opening buffs reaching the other two units.
  // Three related units receiving +ATK/+speed is not equivalent to three unrelated
  // cards which merely happen to have the same effect tag.
  let openingTeamBuffs=0;
  for(let i=0;i<trio.length;i++){
    for(const skill of Array.isArray(trio[i].skills)?trio[i].skills:[]){
      const openingPassive=skill?.type==='passive'&&['deploy','battle_start'].includes(String(skill.timing||''));
      const activeSkill=skill?.type==='active'&&Number(skill.cost||0)<=20;
      if(!openingPassive&&!activeSkill)continue;
      if(openingPassive&&skill.selfCond?.type==='deploy_turn_gte'&&Number(skill.selfCond.val)>1)continue;
      if(skill.selfCond?.type==='ally_has_attr'&&!attrs.some((a,j)=>j!==i&&a.includes(String(skill.selfCond.attr||''))))continue;
      const entries=[{e:skill.mainEffect,target:skill.targetType,cond:skill.targetCond},...(skill.hasSubEffect&&skill.subEffect?[{e:skill.subEffect,target:skill.subEffect.targetType==='same_main_target'?skill.targetType:skill.subEffect.targetType,cond:skill.subEffect.targetType==='same_main_target'?skill.targetCond:skill.subEffect.targetCond}]:[])];
      for(const {e,target,cond} of entries){
        const type=String(e?.type||''),v=Number(e?.val||0);
        if(!['all_ally','all_allies'].includes(String(target||'')))continue;
        const beneficial=(['mod_atk_ratio','mod_atk_val','mod_speed','shield','mod_max_hp_val','damage_dealt_ratio'].includes(type)&&v>0)||(type==='damage_taken_ratio'&&v<0);
        if(!beneficial)continue;
        const matches=attrs.reduce((sum,a,j)=>{
          if(cond?.type==='attr_is'&&!a.includes(String(cond.attr||'')))return sum;
          const stat=trio[j]?.stats||{};
          if(cond?.type==='atk_val_lte'&&Number(stat.atk)>Number(cond.val))return sum;
          if(cond?.type==='atk_val_gte'&&Number(stat.atk)<Number(cond.val))return sum;
          if(cond?.type==='hp_val_lte'&&Number(stat.hp)>Number(cond.val))return sum;
          return sum+1;
        },0);
        if(matches<2)continue;
        let impact=type==='mod_atk_ratio'?Math.abs(v)/12:type==='mod_speed'?Math.abs(v)/15:type==='shield'?Math.abs(v)/700:type==='damage_taken_ratio'?Math.abs(v)/15:type==='mod_atk_val'?Math.abs(v)/500:Math.abs(v)/22;
        impact=Math.min(5,impact);
        const mult=(openingPassive?1.65:0.74)*(Number(e.duration)===-1?1.45:1);
        const bonus=impact*matches*mult;
        score+=bonus;openingTeamBuffs++;
        if(openingPassive&&matches>=2)reasons.push(`${trio[i].name}の登場時全体強化が先発${matches}体に適用`);
      }
    }
  }
  if(openingTeamBuffs>=2)score+=Math.min(13,(openingTeamBuffs-1)*5);
  const hasDamage=ks.some(k=>k.offense>=2.3),hasAp=ks.some(k=>k.ap>=2.0);
  const hasSupport=ks.some(k=>k.support>=2.5),hasSustain=ks.some(k=>k.sustain>=2.6);
  for(let i=0;i<PREF_BATTLE_ACTIVE;i++){
    const card=trio[i],k=ks[i],skills=Array.isArray(card.skills)?card.skills:[];
    const needs=k.conditions||[];
    for(const condition of needs){
      if(condition.startsWith('ally:')){
        const attr=condition.slice(5);
        if(attrs.some((a,j)=>j!==i&&a.includes(attr))){score+=3;reasons.push(`${card.name}の味方属性条件が先発で成立`);}
        else score-=2;
      }else if(setups.has(condition)){
        score+=3.2;reasons.push(`状態異常「${condition}」の付与と条件技が連携`);
      }else score-=2.3;
    }
    if(k.offense>=3.5){
      if(ks.some((x,j)=>j!==i&&(x.support>=2.5||x.ap>=2.5))){score+=3.5;reasons.push(`${card.name}の攻撃を先発支援で強化`);}
      if(ks.some((x,j)=>j!==i&&x.sustain>=3.5))score+=1.5;
    }
    // A controller whose best effects only work after a turn or more is less crucial on turn 1.
    for(const sk of skills){
      if(sk.type==='passive'&&sk.timing==='deploy'&&sk.selfCond?.type==='deploy_turn_gte'&&Number(sk.selfCond.val)>1)score-=0.3;
    }
  }
  if(hasDamage&&hasAp&&hasSupport)score+=3;
  if(hasDamage&&hasSustain)score+=2;
  if(!hasDamage)score-=12;
  if(!hasSupport&&!hasSustain&&!hasAp)score-=9;
  if(ks.filter(k=>k.offense>4.2&&k.support<2&&k.sustain<2).length>=2&&!hasSustain&&!hasAp)score-=7;
  return {score:Math.max(-20,Math.min(70,score)),reasons:[...new Set(reasons)].slice(0,4)};
}

function prefRivalQualityRosterUnits(region, units) {
  const roster=Array.isArray(units)?units:[];
  if(!region||region.isPlayer)return roster.slice();
  const strong=roster.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))>=4);
  const strongFiveCount=strong.filter(inst=>prefRankStars(prefCardForInstance(inst.id)||prefTemplate(inst.templateId))===5).length;
  const legalStrongCount=strong.length-strongFiveCount+Math.min(strongFiveCount,PREF_BATTLE_RANK5_LIMIT);
  // Only apply the quality floor when it still leaves four legal starters under the ★5 cap.
  // If there are too many ★5s and not enough ★4 cards, keep the full roster as fallback material.
  return legalStrongCount>=PREF_BATTLE_ACTIVE?strong:roster.slice();
}

function prefChooseRivalLoadout(regionId,opponentId=null) {
  const region=prefRegion(regionId);const units=prefOwnedUnits(regionId);if(!region||region.isPlayer)return prefDefaultLoadoutFallback(regionId);
  const profile=prefAIProfileForRegion(region);const cardById=id=>prefCardForInstance(id)||prefTemplate(campaignState.instances[id]?.templateId);
  const rosterUnits=prefRivalQualityRosterUnits(region,units);
  const cards=rosterUnits.map(x=>({inst:x,card:cardById(x.id)})).filter(x=>x.card);
  const mags=prefOwnedMagics(regionId).map(x=>cardById(x.id)).filter(Boolean);
  const opponentIntel=opponentId?prefGetOpponentIntel(region,opponentId):null;
  if(cards.length<=PREF_BATTLE_ACTIVE){
    const active=cards.map(x=>x.inst.id);const reserve=[];
    prefRecordAIThought(region,'編成構築','出撃メンバーを選出',['所持キャラが4体未満のため、全員を出撃候補に設定',`カード選びの賢さ${profile.cardIQ}/100`,...(opponentIntel?.confidence>0.2?[`調査・対戦記憶を参照（信頼度${Math.round(opponentIntel.confidence*100)}%）`]:[])],{activeNames:active.map(id=>cardById(id)?.name||'キャラ'),opponentId:opponentId||null});
    const normalized=prefNormalizeLoadoutSelection(active,reserve,rosterUnits);
    if(!prefCanFormLegalBattleSquad(rosterUnits)){
      try { prefLog(`${region.prefecture}は★5編成上限を守って先発4体を組めないため、キャラ補充が必要です。`,'warning'); } catch(_) {}
    }
    return normalized;
  }
  const candidateSets=[];
  const pick=(arr,start,need,chosen)=>{if(need===0){candidateSets.push([...chosen]);return;}for(let i=start;i<=arr.length-need;i++)pick(arr,i+1,need-1,[...chosen,arr[i]]);};
  pick(cards,0,Math.min(PREF_BATTLE_ACTIVE,cards.length),[]);
  const scoredBuilds=[];
  const cardProfile=new Map(cards.map(x=>[String(x.inst.id),prefCardProfile(x.card)]));
  const openingKit=new Map(cards.map(x=>[String(x.inst.id),prefOpeningKit(x.card)]));
  const topTier=['S','A','B'].includes(String(region.tier||''));
  const ownedFiveCount=cards.filter(x=>(cardProfile.get(String(x.inst.id))||prefCardProfile(x.card)).rank===5).length;
  const highValueFiveCount=cards.filter(x=>(cardProfile.get(String(x.inst.id))||prefCardProfile(x.card)).rank===5&&Number(x.card?.value||0)>=PREF_GACHA_VALUE_LIMITS[5]).length;
  const cardScore=new Map(cards.map(x=>[String(x.inst.id),prefCardIntrinsicScore(region,x.card)+prefCardStrategyScore(region,x.card)+prefCardPreferenceScore(region,x.card)+prefAIPlanFitScore(region,x.card)+(topTier&&prefRankStars(x.card)===5&&Number(x.card.value||0)>=PREF_GACHA_VALUE_LIMITS[5]?4.5:0)]));
  const ownedControllerCount=cards.filter(x=>(cardProfile.get(String(x.inst.id))||prefCardProfile(x.card)).role==='controller').length;
  const teamBuffIds=new Set(cards.filter(x=>prefCardHasTeamBuff(x.card)).map(x=>String(x.inst.id)));
  const rankFiveCount=xs=>xs.reduce((sum,x)=>sum+(cardProfile.get(String(x.inst.id))?.rank===5?1:0),0);
  const pairCache=new Map();
  const pair=(a,b)=>{
    const ak=String(a?.id??a?.name??''),bk=String(b?.id??b?.name??'');
    const key=ak<bk?`${ak}\u0000${bk}`:`${bk}\u0000${ak}`;
    if(pairCache.has(key))return pairCache.get(key);
    const value=prefPairSynergyRaw(a,b,profile)*(0.88+0.12*profile.cardIQ/100);pairCache.set(key,value);return value;
  };
  const cachedPair=(a,b)=>pair(a,b);
  function opponentCounterBonus(activeCards){
    if(!opponentIntel||opponentIntel.confidence<0.15)return 0;
    const adaptive=profile.primaryStrategy==='adaptive'||profile.primaryStrategy==='counter'||profile.secondaryStrategies.some(x=>x==='adaptive'||x==='counter');
    if(!adaptive)return 0;
    let bonus=0;const conf=opponentIntel.confidence;
    const observed=opponentIntel.actions||[];
    const skillActions=observed.filter(a=>a.type==='skill'||a.type==='magic').length;
    const normalActions=observed.filter(a=>a.type==='attack').length;
    const tags=new Set(activeCards.flatMap(c=>[...prefCardProfile(c).tags]));
    if(skillActions>=3&&(tags.has('status_debuff')||tags.has('ap_supply')))bonus+=2.5*conf;
    if(normalActions>=3&&(tags.has('shield_defense')||tags.has('healing')))bonus+=2.0*conf;
    const knownCards=opponentIntel.cards||[];const counts={};knownCards.forEach(c=>{if(c.mainAttr)counts[c.mainAttr]=(counts[c.mainAttr]||0)+1;});
    const dominant=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    if(dominant&&dominant[1]>=2){const same=activeCards.filter(c=>prefCardProfile(c).mainAttr===dominant[0]).length;if(same>=3)bonus-=1.5*conf;else if(same<=2)bonus+=0.6*conf;}
    return bonus;
  }
  function reserveCandidateValue(reserveEntry,activeEntries,activeCards,activeProfiles){
    const rp=cardProfile.get(String(reserveEntry.inst.id))||prefCardProfile(reserveEntry.card);
    const base=cardScore.get(String(reserveEntry.inst.id))||0;
    let value=base*0.22;
    const reserveIsUpperFive=rp.rank===5&&Number(reserveEntry.card?.value||0)>=PREF_GACHA_VALUE_LIMITS[5];
    const activeHasUpperFive=activeEntries.some(entry=>{
      const card=entry.card||prefCardForInstance(entry.inst?.id)||prefTemplate(entry.inst?.templateId);
      return prefRankStars(card)===5&&Number(card?.value||0)>=PREF_GACHA_VALUE_LIMITS[5];
    });
    if(topTier&&reserveIsUpperFive)value+=4.5;
    if(topTier&&highValueFiveCount>0&&!activeHasUpperFive&&reserveIsUpperFive)value+=8.0;
    if(topTier&&ownedFiveCount>=2&&rankFiveCount(activeEntries)<2&&rp.rank===5)value+=8.0;
    const roleSet=new Set(activeProfiles.map(x=>x.role).filter(Boolean));
    // Reserves are actual substitutions, not a score bonus for every unselected owned card.
    // A deploy-triggered passive is particularly useful when a reserve enters after a KO.
    value+=Math.min(5,rp.deployPassiveValue*0.85);
    value+=Math.min(2.8,rp.onFieldPassiveValue*0.12);
    for(const card of activeCards)value+=cachedPair(reserveEntry.card,card)*0.20;
    // Keeping one replacement for a core role is valuable; role coverage in the opening three
    // still takes priority over building a bench of duplicates.
    if(roleSet.has(rp.role)){
      if(rp.role==='defender')value+=2.1;
      else if(rp.role==='attacker')value+=1.55;
      else if(rp.role==='controller')value+=0.65;
    }
    // A second high-quality attacker is a sensible finisher; an extra defender can replace the
    // tank that was protecting the main attacker. These bonuses are intentionally modest.
    if(rp.role==='attacker'&&activeProfiles.filter(x=>x.role==='attacker').length===1)value+=0.9;
    if(rp.role==='defender'&&activeProfiles.some(x=>x.role==='defender'))value+=0.8;
    return value;
  }
  for(const selected of candidateSets){
    if(rankFiveCount(selected)>PREF_BATTLE_RANK5_LIMIT)continue;
    const activeCards=selected.map(x=>x.card);const activeIds=selected.map(x=>x.inst.id);
    const activeProfiles=selected.map(x=>cardProfile.get(String(x.inst.id))||prefCardProfile(x.card));
    const activeKits=selected.map(x=>openingKit.get(String(x.inst.id)));
    const concrete=prefConcreteOpeningSynergy(activeCards,activeKits);
    const activeRoles=new Set(activeProfiles.map(x=>x.role).filter(Boolean));
    const activeScore=selected.reduce((sum,x)=>sum+(cardScore.get(String(x.inst.id))||0),0);
    // Broad ally buffs lose value if their controller waits on the bench. Prioritize fielding them,
    // especially when this deck owns few controllers and cannot easily replace the missing support.
    const activeTeamBuffControllers=selected.filter(x=>teamBuffIds.has(String(x.inst.id))&&(cardProfile.get(String(x.inst.id))||prefCardProfile(x.card)).role==='controller').length;
    const allActiveTags=new Set();activeProfiles.forEach(x=>x.tags.forEach(t=>allActiveTags.add(t)));
    const hasAttacker=activeRoles.has('attacker'),hasController=activeRoles.has('controller'),hasDefender=activeRoles.has('defender');
    const hasFrontlineDefender=activeProfiles.some(x=>x.tags.has('frontline_defender'));
    let score=activeScore;
    const openingPlan=prefAIActiveTrioPlanEvaluation(activeCards,activeProfiles,profile);
    score+=openingPlan.score;
    // Actual opening skills count substantially more than the card label or price.
    score+=concrete.score*1.7;
    score+=activeKits.reduce((sum,k)=>sum+k.value*2.0,0);
    if(activeTeamBuffControllers)score+=activeTeamBuffControllers*(4.5+(ownedControllerCount<=1?2.0:0));
    // Make the first three slots a coherent opening team. Prefer an attacker, a defender/healer,
    // and a controller/support when suitably strong cards exist, without banning all-attacker rush builds.
    if(hasAttacker)score+=2.8;
    if(hasDefender)score+=3.0;
    if(hasController)score+=2.6;
    if(hasAttacker&&hasDefender)score+=4.0;
    if(hasAttacker&&hasController)score+=2.5;
    if(hasDefender&&hasController)score+=2.2;
    if(hasAttacker&&hasDefender&&hasController)score+=4.8;
    if(hasAttacker&&hasFrontlineDefender)score+=7.5;
    // A powerful protector is more valuable beside the main attacker than on the bench.
    // Start-of-turn and recurring passives have more opportunities when the unit begins in the field.
    score+=activeProfiles.reduce((sum,x)=>sum+Math.min(7,x.onFieldPassiveValue),0);
    // AP-threshold passives may benefit from a quiet reserve slot when active skills would spend the needed AP.
    const apBankRisk=activeProfiles.reduce((sum,x)=>sum+x.apThresholdPassiveValue,0);
    score-=apBankRisk*0.25; // Do not bench a strong controller merely because its passive has an AP threshold.
    // Score actual two-card reserve options, obeying the shared ★5 cap. Do not count unselected
    // owned cards as though they were on the five-card battle roster.
    const reservePool=cards.filter(x=>!activeIds.includes(x.inst.id)&&!(rankFiveCount(selected)>=PREF_BATTLE_RANK5_LIMIT&&cardProfile.get(String(x.inst.id))?.rank===5));
    const reserveRanked=reservePool.map(x=>({entry:x,value:reserveCandidateValue(x,selected,activeCards,activeProfiles)})).sort((a,b)=>b.value-a.value);
    const reserveEntries=[];let selectedFiveCount=rankFiveCount(selected);
    for(const item of reserveRanked){
      if(reserveEntries.length>=1)break;
      const isFive=cardProfile.get(String(item.entry.inst.id))?.rank===5;
      if(isFive&&selectedFiveCount>=PREF_BATTLE_RANK5_LIMIT)continue;
      reserveEntries.push(item.entry);if(isFive)selectedFiveCount++;
    }
    // The reserve queue is a replacement order: if the opening team has a defender, put its
    // backup tank ahead of a second attacker so the protective role is restored promptly.
    const activeHasDefender=activeProfiles.some(x=>x.role==='defender');
    const activeHasAttacker=activeProfiles.some(x=>x.role==='attacker');
    reserveEntries.sort((a,b)=>{
      const pa=cardProfile.get(String(a.inst.id))||prefCardProfile(a.card);
      const pb=cardProfile.get(String(b.inst.id))||prefCardProfile(b.card);
      const priority=x=>(activeHasDefender&&x.role==='defender'?2.4:0)+(activeHasAttacker&&x.role==='attacker'?0.5:0);
      return priority(pb)-priority(pa);
    });
    const reserveCards=reserveEntries.map(x=>x.card);
    const reserveProfiles=reserveEntries.map(x=>cardProfile.get(String(x.inst.id))||prefCardProfile(x.card));
    const reserveHasFrontlineDefender=reserveProfiles.some(x=>x.tags.has('frontline_defender'));
    if(hasAttacker&&reserveHasFrontlineDefender&&!hasFrontlineDefender)score-=6.0;
    // Opportunity cost of keeping a broadly useful controller off the opening field:
    // entry-on-KO is not equivalent to buffing/protecting all four teammates from turn 1.
    const weakestOpening=Math.min(...activeKits.map(k=>k.value));
    for(const reserveEntry of reserveEntries){
      const rk=openingKit.get(String(reserveEntry.inst.id));
      const rp=cardProfile.get(String(reserveEntry.inst.id));
      if(rk&&(rk.support>=3||rk.ap>=2.5||rk.sustain>=3)&&rk.value>weakestOpening+1){
        const delayedOnly=Math.max(0,rk.deploy-rk.value);
        score-=Math.max(0,rk.value-weakestOpening-1)*2.7*(delayedOnly>2?0.5:1);
      }
    }
    score+=reserveEntries.reduce((sum,entry)=>sum+(reserveRanked.find(x=>String(x.entry.inst.id)===String(entry.inst.id))?.value||0)*0.18,0);
    if(topTier&&ownedFiveCount>=2)score+=Math.min(2,rankFiveCount(selected)+rankFiveCount(reserveEntries))*4.0;
    // Score only pairs actually co-deployed, with a slightly stronger emphasis on explicit synergy.
    for(let i=0;i<activeCards.length;i++)for(let j=i+1;j<activeCards.length;j++)score+=cachedPair(activeCards[i],activeCards[j])*1.28;
    mags.forEach(m=>activeCards.forEach(c=>score+=cachedPair(m,c)*0.75));
    // Reserve pair synergy matters less than the opening four because the lone reserve enters only after a KO.
    // Reserve has one unit, so there is no intra-reserve pair to score.
    // Keep a meaningful fallback team even if a small/old save cannot supply every role.
    if(allActiveTags.has('ap_supply')&&allActiveTags.has('heavy_cost'))score+=3.5;
    if(allActiveTags.has('healing'))score+=1.8;if(allActiveTags.has('shield_defense'))score+=1.8;
    if(activeCards.some((a,i)=>activeCards.some((b,j)=>i!==j&&prefActualStatusChain(a,b))))score+=3.0;
    const attrs=new Set(activeCards.map(c=>String(c.mainAttr||'')).filter(Boolean));
    if(activeCards.length===PREF_BATTLE_ACTIVE&&attrs.size===1&&profile.primaryStrategy==='attribute')score+=2.5;
    const buildQuality=0.50+profile.cardIQ/200;
    const scenarioEstimate=prefEstimateBuildScenarios(region,activeCards,reserveCards,mags);
    score=score*buildQuality+scenarioEstimate.mean*0.45+opponentCounterBonus(activeCards)+prefCardEstimateError(profile.cardIQ);
    scoredBuilds.push({active:activeIds,reserve:reserveEntries.map(x=>x.inst.id),score,concreteReasons:concrete.reasons,concreteScore:concrete.score,scenarioMean:scenarioEstimate.mean,scenarios:scenarioEstimate.scenarios,activeNames:activeCards.map(c=>c.name||'キャラ'),reserveNames:reserveCards.map(c=>c.name||'キャラ'),attrs:[...attrs],roleCoverage:[...activeRoles],openingPlan:{title:openingPlan.title,coreName:openingPlan.coreName,score:openingPlan.score,reasons:openingPlan.reasons}});
  }
  scoredBuilds.sort((a,b)=>b.score-a.score);
  // Keep the three highest-scoring builds; small randomness remains only among genuinely close candidates.
  const shortlist=scoredBuilds.slice(0,3);let best=shortlist[0];
  if(shortlist.length>1){const top=shortlist[0].score;const near=shortlist.filter(x=>top-x.score<=0.45);if(near.length>1)best=near[Math.floor(Math.random()*near.length)];}
  const fallback=best?null:prefEmergencyLoadout(regionId);
  const active=best?.active||fallback?.active||[];
  const reserve=best?.reserve||fallback?.reserve||[];
  const reservedApThresholdCards=reserve.filter(id=>prefCardProfile(cardById(id)).apThresholdPassiveValue>=3).map(id=>cardById(id)?.name||'AP条件パッシブ持ち');
  const chosenPlan=best?.openingPlan;
  const reasons=[`カード選びの賢さ${profile.cardIQ}/100で構築候補を評価`,`主戦術「${(PREF_AI_STRATEGIES.find(x=>x.id===profile.primaryStrategy)||{}).label||'対応型'}」と副戦術を反映`,`先発4体の勝ち筋を先に評価：${chosenPlan?.title||'基礎性能と役割補完'}`,...(chosenPlan?.coreName?[`中心となる主力候補：「${chosenPlan.coreName}」`]:[]),...(chosenPlan?.reasons||[]),...(best?.concreteReasons||[]),`控えは先発4枚の完成を優先したうえで、交代後の役割補充・登場時パッシブ・追加連携を比較`,`AP条件パッシブは有用性と必要APを見て、APを温存しやすい控え配置も評価`,...(reservedApThresholdCards.length?[`AP条件パッシブを持つ控え候補：${reservedApThresholdCards.join('、')}`]:[]),`候補${candidateSets.length}案を効果解析で評価し、上位${shortlist.length}案を3つの想定戦況（速攻・長期戦・連携成立）で平均比較`];
  if(opponentIntel?.confidence>0.15)reasons.push(`調査・対戦記憶の情報を対策に使用（信頼度${Math.round(opponentIntel.confidence*100)}%）`);
  prefRecordAIThought(region,'編成構築','出撃メンバーを選出',reasons,{activeNames:best?.activeNames||active.map(id=>cardById(id)?.name||'キャラ'),reserveNames:best?.reserveNames||reserve.map(id=>cardById(id)?.name||'キャラ'),apThresholdReserveNames:reservedApThresholdCards,score:best?.score,alternatives:shortlist.map(x=>({names:x.activeNames,reserveNames:x.reserveNames,roles:x.roleCoverage,score:Math.round(x.score*10)/10,scenarioMean:Math.round((x.scenarioMean||0)*10)/10,scenarios:x.scenarios,attributes:x.attrs,openingPlan:x.openingPlan,openingSkillScore:x.concreteScore})),openingPlan:chosenPlan||null,opponentId:opponentId||null,opponentIntelConfidence:opponentIntel?.confidence||0});
  return prefNormalizeLoadoutSelection(active.slice(0,PREF_BATTLE_ACTIVE),reserve.slice(0,1),rosterUnits);
}
function prefDefaultLoadoutFallback(regionId) {
  const units=prefOwnedUnits(regionId);const r=prefRegion(regionId);const saved=r?.lastLoadout||{};
  let active=(saved.active||[]).filter(id=>units.some(x=>x.id===id));let reserve=(saved.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id));
  if(active.length<Math.min(PREF_BATTLE_ACTIVE,units.length)){const auto=prefBuildAutoLoadout(units);active=auto.active;reserve=auto.reserve;}
  return prefNormalizeLoadoutSelection(active.slice(0,PREF_BATTLE_ACTIVE),reserve.slice(0,1),units);
}
function prefDefaultLoadout(regionId,opponentId=null) {
  const region=prefRegion(regionId);
  if(region&&!region.isPlayer) {
    try { return prefChooseRivalLoadout(regionId,opponentId); }
    catch(err) {
      console.error(`[Prefecture] rival loadout evaluation failed for ${regionId}; using safe roster selection`,err);
      try { prefLog(`${region.prefecture||regionId}の編成評価でエラーが発生したため、安全な自動編成へ切り替えました。`,'warning'); } catch(_) {}
      return prefEmergencyLoadout(regionId);
    }
  }
  return prefDefaultLoadoutFallback(regionId);
}

function prefBattleOverrideForRegions(aId,bId,playerLoadout=null) {
  const a=prefRegion(aId),b=prefRegion(bId);
  if(!a||!b)throw new Error(`対戦編成を作れません。代表データが見つかりません: ${aId} / ${bId}`);
  const unitsA=prefOwnedUnits(aId),unitsB=prefOwnedUnits(bId);
  const magsA=prefOwnedMagics(aId),magsB=prefOwnedMagics(bId);
  const loadA=playerLoadout||prefDefaultLoadout(aId,bId);const loadB=prefDefaultLoadout(bId,aId);
  const battleUnitsA=a.isPlayer?unitsA:prefRivalQualityRosterUnits(a,unitsA);
  const battleUnitsB=b.isPlayer?unitsB:prefRivalQualityRosterUnits(b,unitsB);
  const legalA=prefNormalizeLoadoutSelection(loadA.active,loadA.reserve,battleUnitsA);
  const legalB=prefNormalizeLoadoutSelection(loadB.active,loadB.reserve,battleUnitsB);
  const selectedA=[...legalA.active,...legalA.reserve].filter(id=>battleUnitsA.some(x=>x.id===id)).slice(0,5);
  const selectedB=[...legalB.active,...legalB.reserve].filter(id=>battleUnitsB.some(x=>x.id===id)).slice(0,5);
  battleUnitsA.forEach(x=>{if(selectedA.length<5&&!selectedA.includes(x.id)&&prefCountFiveStarIds([...selectedA,x.id],battleUnitsA)<=PREF_BATTLE_RANK5_LIMIT)selectedA.push(x.id);});
  battleUnitsB.forEach(x=>{if(selectedB.length<5&&!selectedB.includes(x.id)&&prefCountFiveStarIds([...selectedB,x.id],battleUnitsB)<=PREF_BATTLE_RANK5_LIMIT)selectedB.push(x.id);});
  const activeA=legalA.active.filter(id=>selectedA.includes(id)).slice(0,PREF_BATTLE_ACTIVE);
  while(activeA.length<Math.min(PREF_BATTLE_ACTIVE,selectedA.length)){const id=selectedA.find(x=>!activeA.includes(x));if(!id)break;activeA.push(id);}
  const reserveA=selectedA.filter(id=>!activeA.includes(id)).slice(0,1);
  const activeB=legalB.active.filter(id=>selectedB.includes(id)).slice(0,PREF_BATTLE_ACTIVE);while(activeB.length<Math.min(PREF_BATTLE_ACTIVE,selectedB.length)){const id=selectedB.find(x=>!activeB.includes(x));if(!id)break;activeB.push(id);}const reserveB=selectedB.filter(id=>!activeB.includes(id)).slice(0,1);
  if(activeA.length!==PREF_BATTLE_ACTIVE||activeB.length!==PREF_BATTLE_ACTIVE){
    throw new Error(`対戦編成の先発が4体に達していません（${a.prefecture||aId}: ${activeA.length}体、${b.prefecture||bId}: ${activeB.length}体）。カード所持数または★5編成上限を確認してください。`);
  }
  const profileA=a.isPlayer?null:prefAIProfileForRegion(a),profileB=b.isPlayer?null:prefAIProfileForRegion(b);
  return {playerDeck:{id:`pref-${aId}`,name:`${a.prefecture}デッキ`,unitIds:selectedA,magicIds:magsA.map(x=>x.id)},enemyDeck:{id:`pref-${bId}`,name:`${b.prefecture}デッキ`,unitIds:selectedB,magicIds:magsB.map(x=>x.id)},playerActive:activeA,playerReserve:reserveA,
    enemyIntelligence:b.aiIntelligence||'normal',playerIntelligence:a.aiIntelligence||'expert',enemyTacticalIQ:profileB?.tacticalIQ,playerTacticalIQ:profileA?.tacticalIQ,
    enemyAIProfile:profileB,playerAIProfile:profileA,enemyPersonality:b.personality,playerPersonality:a.personality,
    enemyOpponentMemory:prefGetOpponentIntel(b,aId),playerOpponentMemory:prefGetOpponentIntel(a,bId),
    playerName:a.repName,enemyName:b.repName,enemyRivalId:null,enemyIconUrl:prefRegionIconUrl(b),playerIconUrl:prefRegionIconUrl(a),regionA:aId,regionB:bId,selectedA,selectedB};
}
function prefBattleResultFromEngine() { return {winner:battleState.resultWinner||'draw',usedAMagic:[...(battleState.usedMagicCardIds||[])],usedBMagic:[...(battleState.enemyUsedMagicCardIds||[])],selectedA:(campaignBattleOverride?.selectedA||[]).slice(),selectedB:(campaignBattleOverride?.selectedB||[]).slice()}; }
function prefConsumeMagic(regionId, ids) {
  for(const id of ids||[]){const inst=campaignState.instances[id];if(inst&&inst.kind==='magic'&&inst.zone==='owner'&&inst.ownerId===regionId){inst.zone='consumed';inst.ownerId=null;inst.sellerRegionId=null;}}
}
function prefRandomDestroyUnits(regionId, candidateIds) {
  const valid=(candidateIds||[]).filter(id=>{const inst=campaignState.instances[id];return inst&&inst.zone==='owner'&&inst.ownerId===regionId&&inst.kind==='unit';});
  const destroyed=prefShuffle(valid).slice(0,Math.min(3,valid.length));
  destroyed.forEach(id=>{const card=prefCardForInstance(id);prefSendToGacha(campaignState.instances[id],'battle-loss');prefLog(`${prefRegion(regionId)?.prefecture||regionId}の「${card?.name||'キャラカード'}」が敗北により破壊され、ガチャへ戻りました。`,'warning');});
  return destroyed;
}
// Cash is carried between years. Only an actual negative balance triggers resignation;
// zero yen is legal, and support payments never postpone an already bankrupt rival.
function prefResolveNegativeFunds(region,reason='') {
  if(!region||!(Number(region.funds)<0))return false;
  if(region.isPlayer){
    if(!campaignState.gameOver){
      campaignState.gameOver=true;
      campaignState.gameOverReason='所持資金がマイナスになったため、京都府代表はゲームオーバーです。';
      prefLog('京都府の資金がマイナスとなり、即時ゲームオーバーが確定しました。','warning');
    }
    return true;
  }
  prefResignRival(region);
  return true;
}
function prefResignRival(region) {
  const old=region.repName;let name=prefRandom(PREF_NAMES);let tries=0;while(name===old&&tries++<10)name=prefRandom(PREF_NAMES);
  const personality=prefRandom(PREF_PERSONALITIES);
  region.repName=name;region.personality=personality.id;region.personalityLabel=personality.name;region.personalityFocus=personality.focus;region.aiIntelligence=personality.intelligence||'normal';
  region.aiProfile=prefDefaultAIProfileForTier(region.tier,personality.id);region.aiTacticalIQ=region.aiProfile.tacticalIQ;region.aiCardIQ=region.aiProfile.cardIQ;region.aiMemory={opponents:{},decisions:[]};
  region.profileRivalId=null;region.funds=100000000;region.resignations=(region.resignations||0)+1;
  region.lastLoadout={active:[],reserve:[]};
  delete region._aiPendingGachaDebit;delete region._aiEconomyPhase;
  prefLog(`${region.prefecture}の代表${old}が資金マイナスで辞職。${name}が初期資金1億円で就任しました。カードと都道府県の年間成績は引き継がれます。`,'warning');
}
async function prefApplyBattleOutcome(aId,bId,engineResult,selectedA,selectedB,settlementId=null) {
  const a=prefRegion(aId),b=prefRegion(bId);if(!a||!b)throw new Error(`対戦結果を適用する代表が見つかりません: ${aId} / ${bId}`);
  const settlementKey=settlementId==null?'':String(settlementId);
  campaignState.settledBattles=campaignState.settledBattles&&typeof campaignState.settledBattles==='object'&&!Array.isArray(campaignState.settledBattles)?campaignState.settledBattles:{};
  if(settlementKey&&Object.prototype.hasOwnProperty.call(campaignState.settledBattles,settlementKey)){
    // A saved match may have been committed just before the prior release crashed.
    // Do not pay twice, but do finish any overdue resignation.
    prefResolveNegativeFunds(a,'settlement-recovery');
    prefResolveNegativeFunds(b,'settlement-recovery');
    return {...campaignState.settledBattles[settlementKey],alreadyApplied:true};
  }
  const ensureStats=region=>{
    region.yearStats=region.yearStats&&typeof region.yearStats==='object'?region.yearStats:prefNewStats();
    region.allTimeStats=region.allTimeStats&&typeof region.allTimeStats==='object'?region.allTimeStats:{wins:0,losses:0,draws:0,battles:0,assetMetric:0};
  };
  ensureStats(a);ensureStats(b);
  prefConsumeMagic(aId,Array.isArray(engineResult?.usedAMagic)?engineResult.usedAMagic:[]);prefConsumeMagic(bId,Array.isArray(engineResult?.usedBMagic)?engineResult.usedBMagic:[]);
  const rawResult=engineResult?.winner;
  const result=['player','enemy','draw'].includes(rawResult)?rawResult:'draw';let winnerId=null,loserId=null;
  if(result==='player'){winnerId=aId;loserId=bId;}else if(result==='enemy'){winnerId=bId;loserId=aId;}
  if(result==='draw'){
    if(aId===PREF_PLAYER_ID||bId===PREF_PLAYER_ID){campaignState.lastPlayerBattleDestroyed=[];campaignState.lastPlayerBattleDestroyedIds=[];}
    a.yearStats.draws=(a.yearStats.draws||0)+1;b.yearStats.draws=(b.yearStats.draws||0)+1;
    a.allTimeStats.draws=(a.allTimeStats.draws||0)+1;b.allTimeStats.draws=(b.allTimeStats.draws||0)+1;
    a.yearStats.battles=(a.yearStats.battles||0)+1;b.yearStats.battles=(b.yearStats.battles||0)+1;
    a.allTimeStats.battles=(a.allTimeStats.battles||0)+1;b.allTimeStats.battles=(b.allTimeStats.battles||0)+1;
    try{prefLog(`${a.prefecture}と${b.prefecture}の対戦は引き分けでした。`,'info');}catch(err){console.warn('[Prefecture] match log update failed',err);}
  }else{
    const w=prefRegion(winnerId),l=prefRegion(loserId);
    w.yearStats.wins=(w.yearStats.wins||0)+1;l.yearStats.losses=(l.yearStats.losses||0)+1;
    w.allTimeStats.wins=(w.allTimeStats.wins||0)+1;l.allTimeStats.losses=(l.allTimeStats.losses||0)+1;
    w.yearStats.battles=(w.yearStats.battles||0)+1;l.yearStats.battles=(l.yearStats.battles||0)+1;
    w.allTimeStats.battles=(w.allTimeStats.battles||0)+1;l.allTimeStats.battles=(l.allTimeStats.battles||0)+1;
    const amount=Math.max(30000000,Math.floor(Math.max(0,Number(l.funds)||0)*0.30));
    prefBook(winnerId,amount,'battle-win');prefBook(loserId,-amount,'battle-loss');
    const loserDeck=loserId===aId?selectedA:selectedB;
    let destroyed=[];
    try{destroyed=prefRandomDestroyUnits(loserId,loserDeck)||[];}
    catch(err){console.error('[Prefecture] card destruction follow-up failed; battle result was retained',err);}
    if(loserId!==PREF_PLAYER_ID){
      const defeated=prefRegion(loserId);
      if(defeated){
        defeated.aiMemory=defeated.aiMemory&&typeof defeated.aiMemory==='object'?defeated.aiMemory:{opponents:{},decisions:[]};
        defeated.aiMemory.rebuildPending={status:'pending',createdAtAbs:prefAbsTurn(),opponentId:winnerId,destroyedCards:destroyed.map(id=>{const card=prefCardForInstance(id)||prefTemplate(campaignState.instances[id]?.templateId);return {name:String(card?.name||'キャラカード'),rank:prefRankStars(card),role:prefCardProfile(card).role,templateId:String(card?.id||'')};})};
        prefRecordAIThought(defeated,'敗北後の再構築準備','カード損失を検知し、次の経済行動で編成を見直す',[
          `対戦相手：${prefRegion(winnerId)?.prefecture||winnerId}`,
          `破壊されたカード：${defeated.aiMemory.rebuildPending.destroyedCards.map(x=>x.name).join('、')||'なし'}`,
          '敗北後は残存カードを無条件に固定せず、勝ち筋を成立させるために必要な交換・補充を比較する'
        ],{opponentId:winnerId,destroyedCards:defeated.aiMemory.rebuildPending.destroyedCards,selectedCount:(loserDeck||[]).length});
      }
    }
    if(loserId===PREF_PLAYER_ID){
      campaignState.lastPlayerBattleDestroyed=destroyed.map(id=>{const card=prefCardForInstance(id)||prefTemplate(campaignState.instances[id]?.templateId);return card?.name||'キャラカード';});
      campaignState.lastPlayerBattleDestroyedIds=destroyed.slice();
    }else{campaignState.lastPlayerBattleDestroyed=[];campaignState.lastPlayerBattleDestroyedIds=[];}
    try{prefLog(`${w.prefecture}が${l.prefecture}に勝利。${prefFormatMoney(amount)}を獲得しました。${l.prefecture}は${prefFormatMoney(amount)}を支払い、キャラカード${destroyed.length}枚を失いました。`,'success');}catch(err){console.warn('[Prefecture] match log update failed',err);}
  }
  // Mark the core settlement before optional analytics. If a later step fails, retrying this
  // pair must not apply money, stats, consumed magic, or card loss a second time.
  const settlement={result,winnerId,loserId};
  if(settlementKey){
    campaignState.settledBattles[settlementKey]=settlement;
    const keys=Object.keys(campaignState.settledBattles);
    if(keys.length>2000)keys.slice(0,keys.length-2000).forEach(key=>delete campaignState.settledBattles[key]);
  }
  // Post-match AI memory/plan refresh is useful but must not turn a committed match into
  // a failed match if an optional analytics function encounters malformed legacy data.
  try { prefPersistBattleMemory(aId,bId,engineResult,selectedA,selectedB,winnerId,loserId,result); }
  catch(err) { console.error('[Prefecture] could not refresh AI battle memory; result was already applied',err); }
  // Mandatory settlement completed. Resign now, even if the loser has 0 cards or
  // optional strategy/memory logging failed. The next match will see the replacement.
  if(loserId)prefResolveNegativeFunds(prefRegion(loserId),'battle-loss');
  for(const region of [a,b])try{prefRefreshAIPlan(region,'対戦結果・主要カード損失の確認',true);}catch(err){console.error(`[Prefecture] AI plan refresh failed for ${region.id}; match result was kept`,err);}
  return {winnerId,loserId,result};
}
function prefPersistBattleMemory(aId,bId,engineResult,selectedA,selectedB,winnerId,loserId,result) {
  if(!campaignState)return;
  const sides={ [aId]:'player', [bId]:'enemy' };
  const summarize=(ids)=> (ids||[]).map(id=>{const inst=campaignState.instances[id];const c=prefCardForInstance(id)||prefTemplate(inst?.templateId);return c?{id:String(c.id),name:c.name,mainAttr:c.mainAttr||'',subAttrs:Array.isArray(c.subAttrs)?c.subAttrs.slice(0,5):[],rank:prefRankStars(c)}:null;}).filter(Boolean);
  const hist=Array.isArray(battleState?.aiActionHistory)?battleState.aiActionHistory:[];
  for(const [id,opponentId,ownSelected,enemySelected] of [[aId,bId,selectedA,selectedB],[bId,aId,selectedB,selectedA]]){
    const region=prefRegion(id),opponent=prefRegion(opponentId);if(!region||region.isPlayer)continue;
    const outcome=result==='draw'?'draw':winnerId===id?'win':'loss';
    const observed=hist.filter(x=>x.side===sides[opponentId]).slice(-20).map(x=>({turn:x.turn,type:x.type,name:x.name,target:x.target||'',result:x.result||''}));
    const oppCards=summarize(ownSelected===selectedA?selectedB:selectedA);
    prefRecordBattleAIObservation(region,opponentId,{result:outcome,opponentName:opponent?.repName||opponentId,opponentCards:oppCards,actions:observed});
    const myActs=hist.filter(x=>x.side===sides[id]).slice(-10).map(x=>`${x.actor||'キャラ'}：${x.name||x.type}${x.target?` → ${x.target}`:''}`);
    const sideName=sides[id];const plans=(battleState?.aiDecisionHistory||[]).filter(x=>x.side===sideName).slice(-5).map(x=>({turn:x.turn,iq:x.iq,primary:x.primary,actions:(x.actions||[]).map(a=>`${a.actor}：${a.name}${a.target?` → ${a.target}`:''}`)}));
    prefRecordAIThought(region,'対戦振り返り',`${opponent?.prefecture||opponentId}戦：${outcome==='win'?'勝利':outcome==='loss'?'敗北':'引き分け'}`,
      [`戦術の賢さ${prefAIProfileForRegion(region).tacticalIQ}/100`,`カード選びの賢さ${prefAIProfileForRegion(region).cardIQ}/100`,`対戦相手の行動${observed.length}件を記録`,...(plans.length?[`行動計画${plans.length}ターン分を保存`]:[]),...(myActs.length?['自分の実行行動：'+myActs.join('、')]:[])],
      {opponentId,opponentCards:oppCards,observedActions:observed,myActions:myActs,plans,result:outcome});
  }
}
async function prefSimulateAiBattle(pair) {
  // A previous run may have committed this match but failed while saving queue progress.
  // Reuse the stored result instead of simulating a second, potentially different battle.
  const committed=campaignState?.settledBattles?.[String(pair?.id)];
  if(committed&&['player','enemy','draw'].includes(committed.result))return committed.result;
  let override=null,engineResult=null,selectedA=[],selectedB=[],simulationError=null;
  try {
    override=prefBattleOverrideForRegions(pair.a,pair.b);
    selectedA=(override.selectedA||[]).slice();selectedB=(override.selectedB||[]).slice();
    campaignBattleOverride=override;campaignBattlePending=null;campaignHeadlessBattle=true;window.__campaignHeadlessBattle=true;
    battleState=null;
    startBattle();
    if(!battleState||!Array.isArray(battleState.playerUnits)||!Array.isArray(battleState.enemyUnits)){
      throw new Error('戦闘エンジンが新しい対戦状態を初期化できませんでした。以前の対戦結果は使用しません。');
    }
    let guard=0;
    while(!battleState?.resultWinner && guard<20){
      if(battleState?.phase==='decision'){
        chooseAiTurnPlan('player');
        await confirmPlayerActions();
      } else if(battleState?.phase==='result')break;
      // Async turn resolution itself yields where necessary. One UI yield every three
      // turns preserves responsiveness without repeatedly scheduling empty macrotasks.
      if((guard%3)===2)await prefYieldToBrowser();
      guard++;
    }
    if(!battleState?.resultWinner){battleState.resultWinner='draw';battleState.phase='result';}
    engineResult=prefBattleResultFromEngine();
  } catch(err) {
    simulationError=err;
  } finally {
    campaignHeadlessBattle=false;window.__campaignHeadlessBattle=false;campaignBattleOverride=null;campaignBattlePending=null;
  }

  if(simulationError||!engineResult){
    console.error('[Prefecture] AI battle engine failed; using a safe, single-result fallback',simulationError||new Error('対戦エンジンが結果を返しませんでした'));
    prefLog(`${prefRegion(pair.a)?.prefecture||pair.a}対${prefRegion(pair.b)?.prefecture||pair.b}の通常対戦処理に失敗したため、代替評価で結果を確定しました。原因詳細はコンソールに記録されています。`,'warning');
    // Do not call the advanced deck search again here: that may be the source of the error.
    const safeA=prefDefaultLoadoutFallback(pair.a),safeB=prefDefaultLoadoutFallback(pair.b);
    if(!selectedA.length)selectedA=[...(safeA.active||[]),...(safeA.reserve||[])].slice(0,5);
    if(!selectedB.length)selectedB=[...(safeB.active||[]),...(safeB.reserve||[])].slice(0,5);
    const score=ids=>(ids||[]).reduce((sum,id)=>{
      const card=prefCardForInstance(id)||prefTemplate(campaignState?.instances?.[id]?.templateId);
      return sum+(Number(card?.stats?.hp)||0)*0.2+(Number(card?.stats?.atk)||0)+prefRankStars(card)*250;
    },0);
    engineResult={winner:score(selectedA)>score(selectedB)?'player':score(selectedB)>score(selectedA)?'enemy':'draw',usedAMagic:[],usedBMagic:[]};
  }

  // Apply the battle exactly once, outside the simulation catch. If result settlement itself fails,
  // let the turn recovery UI show the precise stack rather than retrying and double-counting rewards.
  await prefApplyBattleOutcome(pair.a,pair.b,engineResult,selectedA,selectedB,pair.id);
  try { prefSyncCampaignClones(); } catch(err) { console.warn('[Prefecture] card-clone refresh failed after AI battle',err); }
  return engineResult.winner||'draw';
}

function prefLaunchPlayerBattle(pair) {
  const tx=campaignState?.turnProcessing;
  if(!tx||!pair)throw new Error('対戦開始時にターン情報または対戦相手が見つかりません。');
  const a=PREF_PLAYER_ID,bId=pair.a===PREF_PLAYER_ID?pair.b:pair.a;
  const loadout=tx.actions?.[PREF_PLAYER_ID]?.loadout||prefDefaultLoadoutFallback(PREF_PLAYER_ID);
  const override=prefBattleOverrideForRegions(a,bId,loadout);
  campaignBattleOverride=override;
  campaignBattlePending={pairId:pair.id,pairIndex:tx.pairs.indexOf(pair),playerRegionId:a,opponentRegionId:bId,selectedPlayer:override.selectedA,selectedOpponent:override.selectedB};
  pair.status='player-running';tx.currentPairId=pair.id;
  prefSave().then(()=>{prefRenderDashboard();startBattle();}).catch(err=>{
    console.error('[Prefecture] player battle failed to launch',err);
    pair.status='pending';tx.currentPairId=null;campaignBattlePending=null;campaignBattleOverride=null;
    tx.stage='battles';
    prefSave().catch(saveErr=>console.error('[Prefecture] could not save failed-launch recovery state',saveErr));
    prefShowModal('対戦を開始できませんでした',`対戦相手は確定したままです。保存済みのターン処理から再開できます。<pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.stack||err?.message||String(err))}</pre>`,[{label:'閉じる',action:'close-modal',style:'slate'},{label:'保存済み処理を再開',action:'resume-turn-processing',style:'primary'}]);
  });
}
async function prefSettlePendingPlayerBattle(pair,tx) {
  const saved=pair?.pendingSettlement;
  if(!pair||!tx||!saved)throw new Error('保存済みの対戦結果が見つからないため、精算を再開できません。');
  await prefApplyBattleOutcome(saved.playerRegionId,saved.opponentRegionId,saved.engineResult,saved.selectedPlayer,saved.selectedOpponent,pair.id);
  pair.status='done';pair.winner=saved.winner||saved.engineResult?.winner||'draw';pair.draw=pair.winner==='draw';
  tx.pairIndex=Math.max(Number(tx.pairIndex)||0,Math.max(0,tx.pairs.indexOf(pair))+1);tx.currentPairId=null;
  const queue=Array.isArray(tx.resolutionQueue)?tx.resolutionQueue:[];
  const stepIndex=queue.findIndex(step=>step.type==='battle'&&String(step.pairId)===String(pair.id));
  if(stepIndex>=0){queue[stepIndex].status='done';const next=queue.findIndex(step=>step.status!=='done');tx.resolutionIndex=next<0?queue.length:next;}
  delete pair.settlementError;
  try{prefSyncCampaignClones();}catch(err){console.warn('[Prefecture] clone refresh failed after player match',err);}
  prefTurnResolutionProgress(tx);
  // First persist both the committed result and its recovery snapshot. If this save fails,
  // pendingSettlement stays available and settledBattles prevents double rewards on retry.
  await prefSave();
  delete pair.pendingSettlement;
  if(campaignBattlePending?.pairId===pair.id){campaignBattlePending=null;campaignBattleOverride=null;}
  // The next ordinary progress save will persist this cleanup. If the page closes first,
  // loading the still-saved snapshot simply re-enters the idempotent recovery path above.
  return true;
}
async function prefFinalizePlayerBattle(winner) {
  const pending=campaignBattlePending;const tx=campaignState?.turnProcessing;if(!pending||!tx)return;
  const pair=tx.pairs.find(x=>String(x.id)===String(pending.pairId));
  if(!pair){
    campaignBattlePending=null;campaignBattleOverride=null;tx.currentPairId=null;
    throw new Error(`対戦結果を記録する組み合わせが見つかりません: ${pending.pairId}`);
  }
  if(pair.status==='done'&&!pair.pendingSettlement){campaignBattlePending=null;campaignBattleOverride=null;return true;}
  // A duplicate end-of-battle event must await the first settlement attempt instead of
  // displaying a success result before money, cards, and statistics are committed.
  if(pending.finalizePromise)return pending.finalizePromise;
  pending.finalizing=true;
  const finalizePromise=(async()=>{
    if(!pair.pendingSettlement){
      const engineResult=prefBattleResultFromEngine();
      if(!['player','enemy','draw'].includes(engineResult.winner))engineResult.winner=['player','enemy','draw'].includes(winner)?winner:'draw';
      pair.pendingSettlement={
        playerRegionId:pending.playerRegionId,opponentRegionId:pending.opponentRegionId,
        selectedPlayer:(pending.selectedPlayer||[]).slice(),selectedOpponent:(pending.selectedOpponent||[]).slice(),
        engineResult:{winner:engineResult.winner,usedAMagic:Array.isArray(engineResult.usedAMagic)?engineResult.usedAMagic:[],usedBMagic:Array.isArray(engineResult.usedBMagic)?engineResult.usedBMagic:[]},
        winner:engineResult.winner,createdAt:Date.now()
      };
    }
    try {
      // Persist the finished battle result before doing financial/card settlement. Recovery retries
      // settlement from this snapshot instead of restarting an already-finished battle.
      pair.status='settlement-pending';
      await prefSave();
      await prefSettlePendingPlayerBattle(pair,tx);
      return true;
    } catch(err) {
      pair.status='settlement-error';pair.settlementError=String(err?.message||err||'精算に失敗しました');
      try{await prefSave();}catch(saveErr){console.error('[Prefecture] failed to save pending settlement state',saveErr);}
      throw err;
    }
  })();
  pending.finalizePromise=finalizePromise;
  try { return await finalizePromise; }
  finally {
    pending.finalizing=false;
    if(pending.finalizePromise===finalizePromise)delete pending.finalizePromise;
  }
}
async function prefContinueTurn() {
  if(campaignState?.gameOver){prefHideTurnLoading();prefRenderAll();prefShowGameOverModal();return;}
  if(prefProcessingPromise)return prefProcessingPromise;
  if(!campaignState?.turnProcessing)return;
  prefProcessingPromise=(async()=>{
    const tx=campaignState.turnProcessing;
    if(tx.stage==='player-preview'||tx.stage==='awaiting-capacity')prefHideTurnLoading();
    else if(tx.stage==='matching')prefShowTurnLoading('全代表の行動を準備中','AI代表の市場・ガチャ判断と対戦・調査方針を準備しています…',4);
    else if(tx.stage==='settling')prefShowTurnLoading('ターン結果を確定中','対戦結果・資金・カード・ランキングを保存しています…',97);
    else prefShowTurnLoading('対戦・調査を順番に処理中','代表の行動を順位順に処理しています…',35);
    if(tx.stage==='matching'){
      const playerAction=tx.resumePlayerAction||tx.actions?.[PREF_PLAYER_ID]||{type:'investigate',target:prefTurnOrderRegions().find(r=>r.id!==PREF_PLAYER_ID)?.id||PREF_PLAYER_ID,topic:'cards'};
      const ready=await prefPrepareTurnActionsInRankOrder(playerAction,tx);
      if(!ready)return;
      prefInitializeTurnResolution(tx,playerAction);
      await prefSave();prefRenderAll();
    }
    if(tx.stage==='player-preview'){prefRenderDashboard();prefEnsurePreviewResumeButton();return;}
    if(tx.stage==='settling'){await prefCompleteTurn(tx);return;}
    // Only at the start of a resumed processing run, release stale in-progress markers.
    // UI rerenders must not reset an action that is currently being resolved.
    for(const pair of tx.pairs||[])if(pair.status==='simulating')pair.status='pending';
    for(const step of tx.resolutionQueue||[])if(step.status==='processing')step.status='pending';
    const queue=prefEnsureTurnResolutionQueue(tx);
    if(!queue.length){tx.investigationsResolved=true;tx.stage='settling';await prefSave();await prefCompleteTurn(tx);return;}
    document.getElementById('pref-turn-progress')?.classList.remove('hidden');
    prefTurnResolutionProgress(tx);
    let safety=0;
    let actionsSinceCheckpoint=0;
    const saveResolutionCheckpoint=async(force=false)=>{
      actionsSinceCheckpoint++;
      if(!force&&actionsSinceCheckpoint<3&&tx.resolutionIndex<queue.length)return;
      await prefSave();
      actionsSinceCheckpoint=0;
      prefRenderDashboard();
    };
    while(tx.resolutionIndex<queue.length && safety++<queue.length+2){
      const step=queue[tx.resolutionIndex];
      if(!step){tx.resolutionIndex++;continue;}
      if(step.status==='done'){tx.resolutionIndex++;continue;}
      if(step.type==='unmatched'){
        step.status='done';tx.resolutionIndex++;prefTurnResolutionProgress(tx);await saveResolutionCheckpoint();continue;
      }
      if(step.type==='battle'){
        const pair=tx.pairs.find(item=>String(item.id)===String(step.pairId));
        if(!pair){step.status='done';tx.resolutionIndex++;await saveResolutionCheckpoint();continue;}
        if(pair.pendingSettlement){
          await prefSettlePendingPlayerBattle(pair,tx);
          if(campaignState.gameOver){await prefSave();prefHideTurnLoading();prefRenderAll();prefShowGameOverModal();return;}
          prefTurnResolutionProgress(tx);await saveResolutionCheckpoint(true);
          continue;
        }
        if(pair.status==='done'){step.status='done';tx.resolutionIndex++;prefTurnResolutionProgress(tx);await saveResolutionCheckpoint();continue;}
        if(pair.a===PREF_PLAYER_ID||pair.b===PREF_PLAYER_ID){
          tx.pairIndex=Math.max(0,tx.pairs.indexOf(pair));tx.currentPairId=pair.id;
          if(!tx.playerLoadoutConfirmed){await prefShowRankedPlayerBattlePreview(pair,tx);return;}
          if(pair.status==='player-running'&&!campaignBattlePending)pair.status='pending';
          tx.stage='battles';prefHideTurnLoading();prefLaunchPlayerBattle(pair);return;
        }
        pair.status='simulating';step.status='processing';tx.currentPairId=pair.id;tx.pairIndex=Math.max(0,tx.pairs.indexOf(pair));
        // Persist resolved work in small batches. If interrupted mid-battle, the last checkpoint
        // still contains a pending pair and can safely replay it without corrupting the settlement.
        const winner=await prefSimulateAiBattle(pair);
        pair.status='done';pair.winner=winner;pair.draw=winner==='draw';step.status='done';tx.currentPairId=null;
        tx.pairIndex=Math.max(tx.pairIndex,tx.pairs.indexOf(pair)+1);tx.resolutionIndex++;
        prefTurnResolutionProgress(tx);await saveResolutionCheckpoint();
        // Yield after each representative action so the progress display and UI stay responsive.
        await new Promise(resolve=>setTimeout(resolve,0));
        continue;
      }
      if(step.type==='investigate'){
        const regionId=String(step.regionId);
        const already=Array.isArray(tx.resolvedInvestigationIds)&&tx.resolvedInvestigationIds.includes(regionId);
        step.status='processing';
        if(!already){
          try {
            const resolved=prefResolveInvestigationAction(tx,regionId,tx.actions?.[regionId]);
            if(!resolved)prefLog(`${prefRegion(regionId)?.prefecture||regionId}の調査は対象情報が不正なため実行できませんでした。`,'warning');
          }
          catch(err) {
            console.error(`[Prefecture] investigation failed for ${regionId}; skipping only this investigation`,err);
            prefLog(`${prefRegion(regionId)?.prefecture||regionId}の調査処理でエラーが発生しました。この調査のみ失敗として処理を続行します。`,'warning');
          }
          tx.resolvedInvestigationIds=Array.isArray(tx.resolvedInvestigationIds)?tx.resolvedInvestigationIds:[];
          if(!tx.resolvedInvestigationIds.includes(regionId))tx.resolvedInvestigationIds.push(regionId);
        }
        step.status='done';tx.resolutionIndex++;
        prefTurnResolutionProgress(tx);await saveResolutionCheckpoint();
        await new Promise(resolve=>setTimeout(resolve,0));
        continue;
      }
      // Unknown queue entries are ignored safely rather than locking the campaign turn.
      console.warn('[Prefecture] unknown turn resolution entry; skipping',step);
      step.status='done';tx.resolutionIndex++;await saveResolutionCheckpoint();
    }
    if(tx.resolutionIndex<queue.length){
      // Avoid an infinite loop if a malformed queue was restored from an older save.
      prefLog('ターン処理の順序データを再構築しました。ゲーム画面から再開してください。','warning');
      tx.resolutionQueue=prefBuildTurnResolutionQueue(tx.actions,tx.pairs,tx.unmatched,!!tx.investigationsResolved);
      tx.resolutionIndex=0;prefEnsureTurnResolutionQueue(tx);await prefSave();prefRenderAll();return;
    }
    tx.investigationsResolved=true;tx.stage='settling';tx.currentPairId=null;
    await prefSave();await prefCompleteTurn(tx);
  })().catch(err=>{
    prefHideTurnLoading();
    console.error('[Prefecture] turn processing error',err);
    const tx=campaignState?.turnProcessing;
    const action=tx?.actions?.[PREF_PLAYER_ID]?.type||'不明';
    const step=tx?.resolutionQueue?.[tx.resolutionIndex];
    prefShowModal('ターン処理を復旧できませんでした',`保存済みの結果は保持されています。現在の処理：${prefEsc(step?.type==='battle'?'対戦':step?.type==='investigate'?'調査':action)}／順位順 ${Number(tx?.resolutionIndex||0)+1} 件目。ゲーム画面の「ターン処理を再開する」から再開できます。<pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.stack||err?.message||String(err))}</pre>`,[{label:'閉じる',action:'close-modal',style:'slate'},{label:'保存済み処理を再開',action:'resume-turn-processing',style:'primary'}]);
  }).finally(()=>{
    prefProcessingPromise=null;
    const stage=campaignState?.turnProcessing?.stage;
    if(!campaignState?.turnProcessing||stage==='player-preview'||stage==='awaiting-capacity')prefHideTurnLoading();
  });
  return prefProcessingPromise;
}

function prefResolveInvestigationAction(tx,id,action) {
  if(!campaignState||!tx||action?.type!=='investigate')return false;
  const investigator=prefRegion(id),target=prefRegion(action.target);
  if(!investigator||!target||target.id===investigator.id)return false;
  const gradeGap=prefGradeValue(target)-prefGradeValue(investigator);
  let chance=prefClamp(0.70-gradeGap*0.12,0.12,0.90);
  if(investigator.personality==='scout')chance=Math.min(0.95,chance+0.12);
  if(investigator.personality==='careful')chance=Math.min(0.92,chance+0.04);
  const success=Math.random()<chance;const topic=action.topic||'cards';
  const result={year:campaignState.year,week:campaignState.week,absoluteTurn:prefAbsTurn(),investigatorId:id,targetPrefecture:target.prefecture,targetRepName:target.repName,targetTier:target.tier,chance,success,topic,cards:[],summary:''};
  if(success){
    const units=prefOwnedUnits(target.id);const max=gradeGap<=-2?Math.min(units.length,4):gradeGap>=2?Math.min(units.length,1):Math.min(units.length,2);
    if(topic==='cards'||topic==='both'){
      const selected=prefShuffle(units).slice(0,max);result.cards=selected.map(i=>{const c=prefCardForInstance(i.id)||prefTemplate(i.templateId);return {name:c?.name||'不明',rank:prefRankStars(c),mainAttr:c?.mainAttr||'',templateId:i.templateId,observedInstanceId:i.id};});
    }
    if(topic==='behavior'||topic==='both')result.summary=`行動方針：${target.personalityLabel}。${target.personalityFocus}。ランク${target.tier}、調査時点の資金 ${prefFormatMoney(target.funds)}。`;
    if(topic==='cards')result.summary=`調査時点で${result.cards.length}枚のキャラカードを確認しました。`;
    if(topic==='both')result.summary='行動方針とキャラカードの一部を確認しました。';
  }
  if(id===PREF_PLAYER_ID){
    campaignState.investigations=Array.isArray(campaignState.investigations)?campaignState.investigations:[];
    campaignState.investigations.push(result);investigator.yearStats.investigations=(investigator.yearStats.investigations||0)+1;
    prefLog(success?`調査成功：${target.prefecture}の情報を入手しました。`:`調査失敗：${target.prefecture}の情報を得られませんでした。`,success?'success':'warning');
  } else {
    if(success)prefRecordAIScouting(investigator,target,result);
    if(success||Math.random()<0.25)investigator.yearStats.investigations=(investigator.yearStats.investigations||0)+1;
  }
  return true;
}
async function prefResolveInvestigations(tx) {
  if(!campaignState||!tx)return;
  for(const region of prefTurnOrderRegions()){
    const action=tx.actions?.[region.id];if(action?.type!=='investigate')continue;
    const already=Array.isArray(tx.resolvedInvestigationIds)&&tx.resolvedInvestigationIds.includes(String(region.id));
    if(already)continue;
    prefResolveInvestigationAction(tx,region.id,action);
    tx.resolvedInvestigationIds=Array.isArray(tx.resolvedInvestigationIds)?tx.resolvedInvestigationIds:[];
    tx.resolvedInvestigationIds.push(String(region.id));
  }
  tx.investigationsResolved=true;
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
  prefResolveNegativeFunds(prefPlayerRegion(),'turn-end');
  if(campaignState.gameOver){await prefSave();prefHideTurnLoading();prefRenderAll();prefShowGameOverModal();return;}
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
  prefShowModal(`🏆 ${review.year}年度・決算報告`,`<div class="max-h-[78vh] overflow-y-auto pr-1"><div class="rounded-xl bg-slate-900 border border-amber-500/30 p-4"><div class="text-xs text-amber-200 font-black">京都府の年間成績</div><div class="text-3xl font-black text-white mt-1">${prefEsc(String(player?.rankPosition||47))}位${(player?.rankTieCount||1)>1?'タイ':''} / ランク${prefEsc(player?.tier||'E')}</div><div class="grid grid-cols-2 gap-3 mt-3"><div><div class="text-[10px] text-slate-500">年間獲得資産額（収入−対象支出）</div><div class="font-black text-emerald-200">${prefFormatMoney(player?.assetMetric||0)}</div></div><div><div class="text-[10px] text-slate-500">年間勝率</div><div class="font-black text-cyan-200">${((player?.winRate||0)*100).toFixed(1)}%</div><div class="text-[10px] text-slate-500">${player?.wins||0}勝 ${player?.losses||0}敗 ${player?.draws||0}分</div></div></div><div class="border-t border-slate-800 mt-3 pt-3 text-xs text-slate-300">次年度の定期資金提供：${prefFormatMoney(review.nextFunding?.[PREF_PLAYER_ID]||PREF_FUNDING_BY_TIER[player?.tier]||PREF_FUNDING_BY_TIER.E)} × 年4回（第1・14・27・40週）</div></div><div class="flex items-end justify-between gap-2 mt-4 mb-2"><h4 class="font-black text-amber-200">全国47都道府県ランキング</h4><span class="text-[10px] text-slate-500">資産額・年間勝率</span></div><div class="rounded-lg border border-slate-800 overflow-hidden"><div class="grid grid-cols-[2.8rem_minmax(0,1fr)_auto] sm:grid-cols-[3.3rem_minmax(0,1fr)_minmax(5.5rem,auto)_3rem] gap-2 px-2 py-2 bg-slate-900 text-[10px] font-black text-slate-500"><div>順位</div><div>都道府県・代表 / 年間成績</div><div class="text-right">獲得資産 / 翌年支援</div><div class="hidden sm:block text-right">ランク</div></div>${rankingRows}</div><p class="text-[10px] text-slate-500 mt-3">年間成績のみ次年度にリセットします。所持資金・通算成績・カード所有はそのまま引き継ぎ、翌年度第1週の補助金は所持資金に加算します。年間ランキングは決算履歴に保存されます。</p></div>`,[{label:'次年度を開始',action:'next-year',style:'primary'}]);
}
async function prefNextYear() {
  if(!campaignState?.yearReview||campaignState.gameOver)return;
  // Safety check for old saves before applying any new-year support.
  Object.values(campaignState.regions).forEach(r=>prefResolveNegativeFunds(r,'year-transition'));
  if(campaignState.gameOver){await prefSave();prefShowGameOverModal();return;}
  // Freeze next year's support bracket from the just-finished final ranking.
  // Cash (r.funds) and owned cards carry over untouched; ONLY annual stats and
  // command history are reset. Funding for week 1 is subsequently added on top.
  Object.values(campaignState.regions).forEach(r=>{
    r.supportTier=r.tier;r.yearStats=prefNewStats();r.lastCommand=null;r.lastCommandAbs=0;r.nonBattleStreak=0;r.lastBattleAbs=0;
  });
  campaignState.year++;campaignState.week=1;campaignState.absoluteTurn=(campaignState.year-1)*52+1;campaignState.yearReview=null;campaignState.phase='ready';
  prefOpenWeek();prefLog(`第${campaignState.year}年度が始まりました。全代表の前年度末の所持資金を引き継ぎ、最終ランクに応じた第1週の補助金を上乗せしました。`,'success');
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
  if(action==='ai-thoughts'){prefShowAIThoughts(id);return;}
  if(action==='confirm-surrender'){prefCloseModal();if(typeof finalizeSurrenderBattle==='function')finalizeSurrenderBattle();return;}
  if(action==='close-modal'){prefCloseModal();if(campaignState?.turnProcessing?.stage==='player-preview'){document.getElementById('pref-turn-progress')?.classList.add('hidden');if(document.querySelector('.view-section:not(.hidden)')?.id==='view-prefecture')prefRenderDashboard();prefEnsurePreviewResumeButton();}return;}
  if(action==='battle-preview-back'){prefCloseModal();document.getElementById('pref-turn-progress')?.classList.add('hidden');if(document.querySelector('.view-section:not(.hidden)')?.id==='view-prefecture')prefRenderDashboard();prefEnsurePreviewResumeButton();return;}
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
  if(action==='gacha-result-close'){prefCloseModal();if(campaignState?.pendingAcquisition)prefShowReplaceModal();else if(campaignState?.pendingAcquisitionQueue?.length)prefStartNextQueuedAcquisition();return;}
  if(action==='gacha-pull-again'){
    const key=String(id||button?.dataset?.id||'C');
    if(campaignState?.pendingAcquisition){campaignState.pendingGachaContinueKey=key;await prefSave();prefCloseModal();prefShowReplaceModal();return;}
    prefCloseModal();await prefPullGacha(key);return;
  }
  const resolvingAutoBuyCapacity=action==='replace-held'&&campaignState?.pendingAcquisition?.reason==='auto-buy-magic'&&['awaiting-capacity','matching'].includes(campaignState?.turnProcessing?.stage);
  if(campaignState?.turnProcessing && ['list-card','confirm-list-card','withdraw-listing','buy-card','confirm-buy-card','pull-gacha','replace-held','confirm-battle','confirm-investigation'].includes(action)&&!resolvingAutoBuyCapacity){
    prefShowModal('ターン処理中','47都道府県のAI対戦と決算処理を行っています。二重処理を防ぐため、完了するまでカードの購入・出品・ガチャ利用・コマンド変更はできません。マジックの自動購入上限に関する選択だけは続行できます。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;
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
    const owned=prefOwnedUnits(PREF_PLAYER_ID);
    if(owned.length<PREF_BATTLE_ACTIVE){await prefTriggerGameOver('キャラカードが4枚未満の状態で対戦コマンドを選択しました。');return;}
    if(!prefCanFormLegalBattleSquad(owned)){prefShowModal('先発メンバーが不足しています','現在の所持カードでは、★5編成上限を守って先発4体を組めません。★5以外のキャラカードを補充するか、★5カードを市場へ出品してください。',[{label:'閉じる',action:'close-modal',style:'primary'}]);return;}
    const loadout=prefDefaultLoadout(PREF_PLAYER_ID);
    await prefBeginTurn({type:'battle',loadout:{active:[...loadout.active],reserve:[...loadout.reserve]}});return;
  }
  if(action==='choose-investigation'){if((prefPlayerRegion()?.nonBattleStreak||0)>=3)return;prefShowInvestigationSelection();return;}
  if(action==='cancel-command'){document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-investigation-selection')?.classList.add('hidden');if(campaignState?.turnProcessing?.stage==='player-preview'){document.getElementById('pref-turn-progress')?.classList.add('hidden');prefRenderDashboard();prefEnsurePreviewResumeButton();}return;}
  if(action==='toggle-loadout'){prefToggleLoadout(id);return;}
  if(action==='auto-loadout'){prefAutoLoadout();return;}
  if(action==='confirm-final-loadout'){
    const tx=campaignState?.turnProcessing;const draft=campaignState?.draftLoadout;const units=prefOwnedUnits(PREF_PLAYER_ID);
    if(tx?.stage!=='player-preview'){prefShowModal('対戦準備を確認','対戦相手の決定状態を確認できません。画面を更新して再確認してください。',[{label:'閉じる',action:'close-modal'}]);return;}
    const active=(draft?.active||[]).filter(id=>units.some(x=>x.id===id)).slice(0,PREF_BATTLE_ACTIVE);
    const reserve=(draft?.reserve||[]).filter(id=>units.some(x=>x.id===id)&&!active.includes(id)).slice(0,1);
    if(prefCountFiveStarIds([...active,...reserve],units)>PREF_BATTLE_RANK5_LIMIT){prefShowModal('★5カードの上限','ゲームモードでは出撃4体と控えを合わせて★5キャラは2体までです。編成を見直してください。',[{label:'編成に戻る',action:'close-modal',style:'primary'}]);return;}
    if(active.length!==PREF_BATTLE_ACTIVE){prefShowModal('出撃メンバーを確認','出撃するキャラカードを4体選択してください。',[{label:'編成に戻る',action:'close-modal',style:'primary'}]);return;}
    const loadout={active,reserve};tx.actions[PREF_PLAYER_ID].loadout=JSON.parse(JSON.stringify(loadout));
    prefPlayerRegion().lastLoadout=JSON.parse(JSON.stringify(loadout));campaignState.lastLoadout=JSON.parse(JSON.stringify(loadout));
    tx.playerLoadoutConfirmed=true;tx.stage='battles';tx.pairIndex=Math.max(0,tx.pairIndex||0);campaignState.draftLoadout=null;
    document.getElementById('pref-battle-selection')?.classList.add('hidden');document.getElementById('pref-turn-progress')?.classList.remove('hidden');
    prefShowTurnLoading('対戦・調査を再開中','確定した編成で対戦し、その後の代表の行動を順位順に処理しています…',35);
    await prefSave();prefEnsurePreviewResumeButton();prefRenderDashboard();await prefYieldToBrowser();await prefContinueTurn();return;
  }
  if(action==='confirm-battle'){
    const draft=campaignState?.draftLoadout,units=prefOwnedUnits(PREF_PLAYER_ID);if(!draft||draft.active.length!==PREF_BATTLE_ACTIVE){prefShowModal('出撃メンバーを確認','出撃するキャラカードを4体選択してください。',[{label:'戻る',action:'close-modal',style:'primary'}]);return;}
    if(prefCountFiveStarIds([...draft.active,...draft.reserve],units)>PREF_BATTLE_RANK5_LIMIT){prefShowModal('★5カードの上限','ゲームモードでは出撃4体と控えを合わせて★5キャラは2体までです。編成を見直してください。',[{label:'戻る',action:'close-modal',style:'primary'}]);return;}
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
  if(action==='replace-held'){await prefCommitReplace(id);return;}
  if(action==='next-year'){await prefNextYear();return;}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-pref-action]');if(!button)return;
  const action=button.dataset.prefAction,id=button.dataset.id;
  if(button.disabled)return;
  prefHandleClick(action,id,button).catch(err=>{
    prefHideTurnLoading();
    console.error(`[Prefecture] action failed (${action})`,err);
    const tx=campaignState?.turnProcessing;
    const labels={'choose-battle':'対戦コマンド','confirm-battle':'対戦開始','choose-investigation':'調査コマンド','confirm-investigation':'調査実行','confirm-final-loadout':'出撃編成の確定','confirm-buy-card':'市場購入','pull-gacha':'ガチャ'};
    const title=tx?'ターン処理でエラーが発生しました':'操作に失敗しました';
    const body=`操作：${prefEsc(labels[action]||action||'不明')}<br>進行段階：${prefEsc(tx?.stage||'ターン外')}<br><p class="mt-2 text-slate-300">保存済みの進行データは自動消去していません。ターン処理が残っている場合は、再開操作を試してください。</p><pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.stack||err?.message||String(err))}</pre>`;
    prefShowModal(title,body,tx?[{label:'閉じる',action:'close-modal',style:'slate'},{label:'保存済み処理を再開',action:'resume-turn-processing',style:'primary'}]:[{label:'閉じる',action:'close-modal'}]);
  });
});

// The original card detail editor is retained. Campaign instances are read-only: editing the card library remains separate from the game state.
const prefOriginalOpenCardDetail = openCardDetail;
openCardDetail = function(cardId, options={}) {
  const inst=campaignState?.instances?.[String(cardId)];
  if(inst) { prefOriginalOpenCardDetail(cardId,{readOnly:true}); return; }
  prefOriginalOpenCardDetail(cardId,options);
};

// The result-modal button must await the previous queue invocation (if its cleanup is still
// pending) and start a NEW continuation. A single ignored click used to require a page refresh.
let prefPostBattleAdvancePromise=null;
async function prefAdvanceAfterPlayerBattle(){
  if(campaignState?.gameOver){prefHideTurnLoading();prefRenderAll();prefShowGameOverModal();return;}
  if(prefPostBattleAdvancePromise)return prefPostBattleAdvancePromise;
  const run=(async()=>{
    if(!campaignState?.turnProcessing){prefHideTurnLoading();prefRenderAll();return;}
    if(campaignState.gameOver){prefHideTurnLoading();prefRenderAll();prefShowGameOverModal();return;}
    prefShowTurnLoading('残りの代表の処理を再開中','京都府の対戦結果を保持し、未処理の組み合わせから続行しています…',35);
    const earlier=prefProcessingPromise;
    if(earlier){
      await earlier;
      // Some post-result events fire before the earlier continuation's finally callback
      // resets the global promise. Only clear the *same, already awaited* promise.
      if(prefProcessingPromise===earlier)prefProcessingPromise=null;
    }
    await prefYieldToBrowser();
    if(campaignState?.turnProcessing&&campaignState.turnProcessing.stage!=='player-preview'&&campaignState.turnProcessing.stage!=='awaiting-capacity'){
      await prefContinueTurn();
    }
  })();
  prefPostBattleAdvancePromise=run;
  try {return await run;}
  finally {if(prefPostBattleAdvancePromise===run)prefPostBattleAdvancePromise=null;}
}

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
  const settlementPending=!!campaignState?.turnProcessing?.pairs?.some(pair=>pair?.pendingSettlement&&pair.status!=='done');
  message.innerText=settlementPending?'戦闘は終了しましたが、結果の精算が未完了です。「次へ」を押すと保存済み結果の精算を再試行します。':'対戦結果を記録しました。敗北時は出場したキャラカードからランダムに3枚が破壊され、ガチャへ戻ります。使用したマジックカードは消費されます。';
  if(!settlementPending&&winner==='enemy'&&reward&&Array.isArray(campaignState?.lastPlayerBattleDestroyedIds)&&campaignState.lastPlayerBattleDestroyedIds.length){
    const lostIds=campaignState.lastPlayerBattleDestroyedIds;
    const lostNames=Array.isArray(campaignState.lastPlayerBattleDestroyed)?campaignState.lastPlayerBattleDestroyed:[];
    reward.classList.remove('hidden');
    reward.innerHTML=`<div class="text-xl sm:text-2xl font-black text-rose-300 mb-2">💔 敗北により失ったカード</div><div class="text-sm sm:text-base text-slate-200 mb-4 font-bold">以下のキャラカード${lostIds.length}枚は所持から失われ、ガチャに戻りました。</div><div class="grid grid-cols-3 gap-3 sm:gap-4">${lostIds.map((id,index)=>{const inst=campaignState.instances?.[id];const card=prefCardForInstance(id)||prefTemplate(inst?.templateId);const name=lostNames[index]||card?.name||'キャラカード';return `<div class="min-w-0"><div class="mb-1 text-center text-xs sm:text-sm font-black text-rose-200">${index+1}. ${prefEsc(name)}</div>${prefCardDisplay(id,{small:true})}</div>`;}).join('')}</div>`;
  }
  const rematch=document.getElementById('battle-result-rematch'),back=document.getElementById('battle-result-back');
  if(rematch){rematch.classList.add('hidden');rematch.onclick=null;}
  if(back){back.classList.remove('hidden');back.innerText=campaignState?.gameOver?'ゲームオーバーを確認':'次へ：残りの代表を処理';back.onclick=async()=>{
    // Settlement is already idempotent. The button never starts a fresh player battle.
    back.disabled=true;
    try {
      modal.classList.add('hidden');battleExecutionRunning=false;switchView('prefecture');
      await prefAdvanceAfterPlayerBattle();
    } catch(err) {
      console.error('[Prefecture] post-battle continuation failed',err);
      prefHideTurnLoading();
      prefShowModal('残りの対戦処理を再開できませんでした',`確定した試合結果は保存されています。ゲーム画面の「ターン処理を再開する」から再試行できます。<pre class="text-[10px] text-rose-200 whitespace-pre-wrap mt-2">${prefEsc(err?.message||String(err))}</pre>`,[{label:'閉じる',action:'close-modal'},{label:'処理を再開',action:'resume-turn-processing',style:'primary'}]);
    } finally {back.disabled=false;}
  };}
  modal.classList.remove('hidden');
};

// Restore pending player battles on load. The unresolved pair has not posted money/card changes yet, so restarting the duel is safe.
async function prefResumePendingTurn() {
  if(!campaignState)return;
  if(campaignState.gameOver){prefShowGameOverModal();return;}
  if(campaignState.yearReview){prefShowYearReview();return;}
  if(campaignState.pendingAcquisition){prefSyncCampaignClones();prefShowReplaceModal();return;}
  if(campaignState.pendingAcquisitionQueue?.length){prefRenderAll();prefStartNextQueuedAcquisition();return;}
  if(campaignState.turnProcessing?.stage==='awaiting-capacity'){
    const tx=campaignState.turnProcessing;const action=tx.resumePlayerAction||tx.actions?.[PREF_PLAYER_ID];
    if(action){tx.stage='matching';delete tx.resumePlayerAction;await prefSave();await prefStartTurnAfterAutoBuy(action,tx);}else prefRenderDashboard();
    return;
  }
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
