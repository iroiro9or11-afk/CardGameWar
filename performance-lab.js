/*
 * 都道府県カード戦争 v1.0.70 - カード性能検証ラボ
 * Uses the existing battle engine in isolated, temporary headless battles.
 * Results are intentionally memory-only and never saved to IndexedDB/campaign state.
 */
(function () {
  'use strict';

  let labRunning = false;
  let labCancelRequested = false;
  let labCurrentMatch = null;
  let labActiveActor = null;
  let labActiveSource = null;
  let labOriginalSwitchView = null;
  let labNavigationState = [];

  let LAB_TOTAL_BATTLES = 150;
  // Estimated values from the latest completed batch report; not persisted until user confirms.
  let labLastCompleteBatchValues = null;

  function labReadBattleCount() {
    const input = document.getElementById('performance-lab-battle-count');
    const raw = Number(input?.value ?? 150);
    const count = Math.round(labClamp(Number.isFinite(raw) ? raw : 150, 1, 100000));
    LAB_TOTAL_BATTLES = count;
    if (input) input.value = String(count);
    return count;
  }

  function labSkillUsageKey(index, skill) {
    return `${Number(index)}::${String(skill?.name || `スキル${Number(index) + 1}`)}`;
  }

  function labGetSkillUsageBucket(targetMetrics, index, skill) {
    targetMetrics.skillUsage = targetMetrics.skillUsage || {};
    const key = labSkillUsageKey(index, skill);
    if (!targetMetrics.skillUsage[key]) {
      targetMetrics.skillUsage[key] = {
        index: Number(index), name: String(skill?.name || `スキル${Number(index) + 1}`),
        cost: Math.max(0, Number(skill?.cost) || 0), plannedUses: 0, executedUses: 0,
        apDeltaTotal: 0
      };
    }
    return targetMetrics.skillUsage[key];
  }

  // Reference bounds follow each rank's actual valuation curve, rather than the old shared 10^15 cap.
  const LAB_VALUE_RANGES = {
    3: { min: 300_000, max: 30_000_000 },
    4: { min: 10_000_000, max: 1_000_000_000 },
    5: { min: 500_000_000, max: 50_000_000_000 }
  };

  // Exponential valuation: each 20 percentage-point increase in win rate multiplies value by 10.
  const LAB_VALUE_CURVES = {
    3: [{rate:0.30,value:300_000},{rate:0.50,value:3_000_000},{rate:0.70,value:30_000_000}],
    4: [{rate:0.30,value:10_000_000},{rate:0.50,value:100_000_000},{rate:0.70,value:1_000_000_000}],
    5: [{rate:0.30,value:500_000_000},{rate:0.50,value:5_000_000_000},{rate:0.70,value:50_000_000_000}]
  };

  function labEstimateValue(stars, winRate) {
    const curve=LAB_VALUE_CURVES[Number(stars)];if(!curve)return null;
    const rate=Number.isFinite(Number(winRate))?Number(winRate):0;
    return Math.round(curve[0].value*Math.pow(10,(rate-0.30)/0.20));
  }

  const labOriginalRenderBattleState = renderBattleState;
  renderBattleState = function (...args) {
    if (window.__performanceLabRunning) return;
    return labOriginalRenderBattleState.apply(this, args);
  };
  const labOriginalShowActionPopup = showActionPopup;
  showActionPopup = function (...args) {
    // Headless tests must not enqueue or render thousands of action popups.
    if (window.__performanceLabRunning) return Promise.resolve();
    return labOriginalShowActionPopup.apply(this, args);
  };
  const labOriginalLogBattle = logBattle;
  logBattle = function (...args) {
    // Do not accumulate a huge battle-log DOM tree during configurable automated fights.
    if (window.__performanceLabRunning) return;
    return labOriginalLogBattle.apply(this, args);
  };

  function labClamp(value, min, max) {
    const n = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  }

  function labEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function labUniqueCards(cards) {
    const seen = new Set();
    return (Array.isArray(cards) ? cards : []).filter(card => {
      if (!card || card.id == null) return false;
      const key = String(card.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function labAllUnits() {
    // Use the authored card-template list when the campaign module exposes it.
    // Campaign-owned/listed/gacha copies are never valid lab candidates.
    const source = typeof prefCardTemplates === 'function'
      ? prefCardTemplates()
      : (Array.isArray(allCards) ? allCards.filter(card => !card?.campaignInstance && !card?.templateId) : []);
    return labUniqueCards(source.filter(card => (card.cardType || 'unit') === 'unit'))
      .filter(card => labStars(card) >= 3 && labStars(card) <= 5);
  }

  function labAllMagics() {
    return [];
  }

  function labStars(card) {
    const raw = Number(card?.rank);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 5) return Math.round(raw);
    if (typeof estimateUnitRank === 'function') return labClamp(Math.round(Number(estimateUnitRank(card?.stats || {})) || 1), 1, 5);
    return 3;
  }

  function labEffectMagnitude(effect) {
    if (!effect || typeof effect !== 'object') return 0;
    let score = Math.abs(Number(effect.val) || 0) * 0.08;
    if (String(effect.type || '').startsWith('dmg_')) score += 18;
    if (String(effect.type || '').startsWith('heal_') || effect.type === 'shield') score += 12;
    if (effect.type === 'mod_ap') score += 10;
    return score;
  }

  function labBasePower(card) {
    const stats = card?.stats || {};
    const skills = Array.isArray(card?.skills) ? card.skills : [];
    let power = (Number(stats.hp) || 0) * 0.12 + (Number(stats.atk) || 0) * 1.25 + (Number(stats.priority) || 0) * 0.35;
    for (const skill of skills) {
      power += skill.type === 'passive' ? 90 : 65;
      power += labEffectMagnitude(skill.mainEffect);
      if (skill.hasSubEffect) power += labEffectMagnitude(skill.subEffect) * 0.55;
      power -= Math.max(0, Number(skill.cost) || 0) * 1.5;
    }
    return Number.isFinite(power) ? power : 0;
  }

  function labComparator(a, b) {
    return labBasePower(a) - labBasePower(b) || String(a.name || '').localeCompare(String(b.name || ''), 'ja');
  }

  function labShuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function labPick(items, count, excludeIds = []) {
    const excluded = new Set(excludeIds.map(String));
    const eligible = items.filter(card => !excluded.has(String(card.id)));
    return labShuffle(eligible).slice(0, count);
  }

  function labEffects(card) {
    const out = [];
    for (const skill of (card?.skills || [])) {
      if (!skill) continue;
      if (skill.mainEffect) out.push({ ...skill.mainEffect, timing: skill.timing, skillType: skill.type, selfCond: skill.selfCond });
      if (skill.hasSubEffect && skill.subEffect) out.push({ ...skill.subEffect, timing: skill.timing, skillType: skill.type, selfCond: skill.selfCond });
    }
    return out;
  }

  function labRoleProfile(card) {
    const skills = Array.isArray(card?.skills) ? card.skills : [];
    const effects = labEffects(card);
    const active = effects.filter(e => e.skillType === 'active');
    const passive = effects.filter(e => e.skillType === 'passive');
    const has = (list, types) => list.some(e => types.includes(String(e.type || '')));
    const damage = has(active, ['dmg_fixed','dmg_fixed_pierce','dmg_atk_ratio','atk_ratio','atk_val']);
    const control = has(effects, ['status_apply','skill_block','heal_block','damage_taken_ratio','mod_atk_ratio','mod_atk_val','mod_speed']);
    const support = has(effects, ['heal_fixed','heal_max_hp_ratio','shield','mod_ap','clear_statuses','clear_debuffs','status_remove','mod_atk_ratio','mod_atk_val','mod_speed']);
    const openingPassive = passive.some(e => ['battle_start','turn_start','deploy'].includes(e.timing));
    const delayedDeploy = skills.some(sk => sk.type === 'passive' && sk.timing === 'deploy' && sk.selfCond?.type === 'turn_gte' && Number(sk.selfCond?.val) >= 2);
    const hp = Number(card?.stats?.hp) || 0;
    const atk = Number(card?.stats?.atk) || 0;
    const priority = Number(card?.stats?.priority) || 0;
    // Every living character can use a normal attack. Do not label a high-ATK
    // card as a non-attacker merely because its authored active skill is support/control.
    const damagePotential = damage || atk >= 700;
    return { damage: damagePotential, hasDamageSkill: damage, control, support, openingPassive, delayedDeploy, hp, atk, priority,
      damageScore: (damagePotential ? 4 : 0) + Math.min(4, atk / 900), supportScore: (support ? 2.8 : 0) + (control ? 1.4 : 0),
      speedScore: Math.min(2.5, priority / 45), openingScore: openingPassive ? 1.2 : 0 };
  }

  // Preserve random card distribution, but do not confuse random sampling with random deployment.
  // Choose the best four active units for role coverage and synergy; keep a delayed-deploy
  // specialist in reserve when possible so its arrival passive is not wasted at battle start.
  function labArrangeRoster(roster, focalCard = null) {
    if (!Array.isArray(roster) || roster.length <= 4) return roster || [];
    const cards = [...roster];
    const focalId = focalCard ? String(focalCard.id) : null;
    const focal = focalCard ? cards.find(c => String(c.id) === focalId) : null;
    const fp = focal ? labRoleProfile(focal) : null;
    const targetShouldReserve = !!(fp?.delayedDeploy && cards.length > 4);
    // A battle-start/turn-start passive should not be wasted in reserve. Conversely,
    // a delayed-deployment specialist belongs in reserve. For ordinary focal cards,
    // let the role-based lineup optimizer decide whether the card is one of the best
    // four openers; this makes the reported deployment-position distribution real
    // instead of forcing every tested card into the active line in every trial.
    const targetMustStart = !!(focal && fp?.openingPassive && !targetShouldReserve);
    const combos = [];
    for (let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) for(let k=j+1;k<cards.length;k++) for(let m=k+1;m<cards.length;m++) {
      const active = [cards[i],cards[j],cards[k],cards[m]];
      const focalActive = !!(focal && active.some(c => String(c.id) === focalId));
      if (targetMustStart && !focalActive) continue;
      if (targetShouldReserve && focalActive) continue;
      const profiles = active.map(labRoleProfile);
      const attackers = profiles.filter(p => p.damage).length;
      const supporters = profiles.filter(p => p.support || p.control).length;
      const score = profiles.reduce((sum,p)=>sum+p.damageScore+p.supportScore*0.45+p.speedScore*0.45+p.openingScore,0)
        + (attackers >= 1 ? 2.5 : -5) + (attackers >= 2 ? 2.0 : 0)
        + (supporters >= 1 ? 1.5 : 0) + (supporters >= 2 ? 0.6 : 0)
        + (attackers === 0 ? -12 : 0);
      combos.push({active,score});
    }
    combos.sort((a,b)=>b.score-a.score);
    let chosen = combos[0]?.active;
    if (!chosen) chosen = cards.slice(0,4);
    const activeIds = new Set(chosen.map(c=>String(c.id)));
    let reserves = cards.filter(c=>!activeIds.has(String(c.id)));
    // Reserve order is a real part of deployment timing. Randomize ordinary reserve
    // ordering across samples, while retaining the focal card's observed reserve position
    // in the report. This does not randomize the active/reserve decision when a passive's
    // timing requires one side of that boundary.
    if (focal && reserves.some(c => String(c.id) === focalId) && reserves.length > 1) {
      const focalIndex = fp?.delayedDeploy ? (Math.random() < 0.65 ? 1 : 0) : (Math.random() < 0.5 ? 1 : 0);
      const other = reserves.filter(c => String(c.id) !== focalId);
      reserves = focalIndex === 1 ? [other[0], focal, ...other.slice(1)] : [focal, ...other];
    } else {
      reserves = labShuffle(reserves);
    }
    return [...chosen, ...reserves];
  }

  function labBuildPlayerRoster(targetCard, allUnits, excludeIds = []) {
    const stars = labStars(targetCard);
    const excluded = new Set(excludeIds.map(String));
    if (stars === 5) {
      const star5 = allUnits.filter(card => labStars(card) === 5 && !excluded.has(String(card.id)));
      const star4 = allUnits.filter(card => labStars(card) === 4 && !excluded.has(String(card.id)));
      // Each side uses 4 starters and 1 reserve (two ★5 and three ★4 in its five-card roster). The focal card is guaranteed to participate.
      const otherStar5 = star5.filter(card => String(card.id) !== String(targetCard.id));
      if (star4.length < 3 || otherStar5.length < 1 || star5.length < 2) throw new Error('★5カードの検証には、作成カード一覧に★5キャラカードが合計4枚以上、★4キャラカードが6枚以上必要です（両陣営それぞれ★5を2枚・★4を3枚）。');
      const chosen5 = labPick(otherStar5, 1);
      const chosen4 = labPick(star4, 3);
      return labArrangeRoster([targetCard, ...chosen5, ...chosen4], targetCard);
    }
    const sameRank = allUnits.filter(card => labStars(card) === stars && !excluded.has(String(card.id)));
    if (sameRank.length < 5) throw new Error(`★${stars}カードの検証には、作成カード一覧に★${stars}キャラカードが合計10枚以上必要です。★1・★2やキャンペーン中のカードは使用しません。`);
    return labArrangeRoster([targetCard, ...labPick(sameRank.filter(c=>String(c.id)!==String(targetCard.id)), 4)], targetCard);
  }

  function labBuildEnemyRoster(targetCard, allUnits, excludeIds = []) {
    const stars = labStars(targetCard);
    const excluded = new Set(excludeIds.map(String));
    if (stars === 5) {
      const star5 = allUnits.filter(card => labStars(card) === 5 && !excluded.has(String(card.id)));
      const star4 = allUnits.filter(card => labStars(card) === 4 && !excluded.has(String(card.id)));
      if (star5.length < 2 || star4.length < 3) throw new Error('★5カードの検証で両陣営のカードを重複させないため、★5キャラカード4枚以上・★4キャラカード6枚以上が必要です。');
      return labArrangeRoster([...labPick(star5, 2), ...labPick(star4, 3)]);
    }
    const sameRank = allUnits.filter(card => labStars(card) === stars && !excluded.has(String(card.id)));
    if (sameRank.length < 5) throw new Error(`★${stars}カードの検証には、作成カード一覧に★${stars}キャラカードが合計10枚以上必要です。`);
    return labArrangeRoster(labPick(sameRank, 5));
  }

  function labFreshMetrics(targetCardId) {
    const side = () => ({ damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, shieldAbsorbed: 0, supportEffects: 0, controlEffects: 0, actions: 0, activeSkills: 0, magicUses: 0, hpReductionEffects: 0 });
    return {
      targetCardId: String(targetCardId),
      sides: { player: side(), enemy: side() },
      target: { actions: 0, activeSkills: 0, damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, supportEffects: 0, controlEffects: 0, utilityEffects: 0, hpReductionEffects: 0, appearancePosition: 'active', skillUsage: {} },
      opponentRosterKey: ''
    };
  }

  function labGetSource(actor, isPlayerActor) {
    return actor || labActiveActor || labActiveSource || { side: isPlayerActor ? 'player' : 'enemy' };
  }

  function labCountSourceUtility(effect, target, source, result) {
    if (!labCurrentMatch || !effect || !result) return;
    const type = String(effect.type || '');
    if (!type || type === 'none' || /^dmg_/.test(type)) return;
    const resultText = String(result.result || result.effect || '');
    if (/失敗|不発|効果を受けない|対象なし|条件未達|既に継続中|解除対象なし|解除できる.*なし/.test(resultText)) return;

    const sourceSide = source?.side || 'player';
    const targetSide = target?.side || (target?.__playerTarget ? (target.__playerTarget === 'opp' ? (sourceSide === 'player' ? 'enemy' : 'player') : sourceSide) : null);
    const isFriendly = targetSide === sourceSide;
    const value = Number(effect.val) || 0;
    // Support credit is reserved for beneficial effects. Applying a debuff to oneself/allies
    // (for example weak, poison, reduced attack, or increased damage taken) is not support.
    const beneficialTypes = new Set(['heal_fixed', 'heal_max_hp_ratio', 'shield', 'status_remove', 'clear_statuses', 'clear_debuffs', 'clear_random_debuffs']);
    const positiveFriendlyEffect = beneficialTypes.has(type)
      || (type === 'status_apply' && String(effect.status || 'poison') === 'stealth')
      || (['mod_atk_ratio', 'mod_atk_val', 'mod_speed', 'mod_max_hp_val', 'sub_chance_mod'].includes(type) && value > 0)
      || (type === 'damage_taken_ratio' && value < 0)
      || (type === 'damage_cut_ratio' && value > 0)
      || (type === 'mod_ap' && value > 0);
    const controlTypes = new Set(['status_apply', 'skill_block', 'heal_block', 'damage_taken_ratio', 'mod_atk_ratio', 'mod_atk_val', 'mod_speed', 'mod_max_hp_val', 'clear_buffs', 'clear_random_buffs']);
    const isControl = !isFriendly && controlTypes.has(type);
    const isSupport = isFriendly && positiveFriendlyEffect;

    if (isSupport) labCurrentMatch.sides[sourceSide].supportEffects++;
    if (isControl) labCurrentMatch.sides[sourceSide].controlEffects++;
    if (sourceSide === 'player' && String(source?.cardId) === labCurrentMatch.targetCardId) {
      labCurrentMatch.target.utilityEffects++;
      if (isSupport) labCurrentMatch.target.supportEffects++;
      if (isControl) labCurrentMatch.target.controlEffects++;
    }
  }

  // Instrument actual resolved damage/healing/effects without changing the rules themselves.
  const labOriginalDealDamage = dealDamage;
  dealDamage = function (target, ...args) {
    const beforeHp = Number(target?.currentHp);
    const source = labActiveSource || labActiveActor || null;
    const result = labOriginalDealDamage.call(this, target, ...args);
    const afterHp = Number(target?.currentHp);
    if (labCurrentMatch && target && target.side && Number.isFinite(beforeHp) && Number.isFinite(afterHp)) {
      const loss = Math.max(0, beforeHp - afterHp);
      if (loss > 0) {
        const sourceSide = source?.side || null;
        const targetSide = target.side;
        labCurrentMatch.sides[targetSide].damageTaken += loss;
        if (sourceSide && sourceSide !== targetSide) {
          labCurrentMatch.sides[sourceSide].damageDealt += loss;
          if (beforeHp > 0 && afterHp <= 0) labCurrentMatch.sides[sourceSide].kills++;
          if (sourceSide === 'player' && String(source?.cardId) === labCurrentMatch.targetCardId) {
            labCurrentMatch.target.damageDealt += loss;
            if (beforeHp > 0 && afterHp <= 0) labCurrentMatch.target.kills++;
          }
        }
        if (targetSide === 'player' && String(target.cardId) === labCurrentMatch.targetCardId) labCurrentMatch.target.damageTaken += loss;
      }
      const absorbed = Math.max(0, Number(result?.absorbed) || 0);
      if (absorbed > 0) labCurrentMatch.sides[target.side].shieldAbsorbed += absorbed;
    }
    return result;
  };

  const labOriginalApplyEffect = applyEffect;
  applyEffect = function (effect, target, isPlayerActor, isMagic = false, actor = null) {
    const source = labGetSource(actor, isPlayerActor);
    const beforeHp = target && !target.__playerTarget ? Number(target.currentHp) : null;
    const beforeShield = target && !target.__playerTarget && Array.isArray(target.shields) ? target.shields.reduce((sum, shield) => sum + Math.max(0, Number(shield.remaining ?? shield.amount) || 0), 0) : 0;
    const previousSource = labActiveSource;
    labActiveSource = source;
    let result;
    try {
      result = labOriginalApplyEffect.call(this, effect, target, isPlayerActor, isMagic, actor);
    } finally {
      labActiveSource = previousSource;
    }
    if (!labCurrentMatch || !effect || !target || target.__playerTarget) return result;
    const sourceSide = source?.side || (isPlayerActor ? 'player' : 'enemy');
    const targetSide = target.side;
    const afterHp = Number(target.currentHp);
    const effectType = String(effect.type || '');
    const isDirectDamage = effectType.startsWith('dmg_');
    if (Number.isFinite(beforeHp) && Number.isFinite(afterHp) && afterHp > beforeHp) {
      const gained = afterHp - beforeHp;
      if (targetSide === sourceSide) {
        labCurrentMatch.sides[sourceSide].healing += gained;
        if (sourceSide === 'player' && String(source?.cardId) === labCurrentMatch.targetCardId) labCurrentMatch.target.healing += gained;
      }
    } else if (Number.isFinite(beforeHp) && Number.isFinite(afterHp) && afterHp < beforeHp && !isDirectDamage) {
      const reduction = beforeHp - afterHp;
      // Max-HP reductions / removed max-HP buffs are recorded separately from ordinary damage.
      if (sourceSide !== targetSide) {
        labCurrentMatch.sides[sourceSide].hpReductionEffects += reduction;
        if (sourceSide === 'player' && String(source?.cardId) === labCurrentMatch.targetCardId) labCurrentMatch.target.hpReductionEffects += reduction;
      }
      if (targetSide === 'player' && String(target.cardId) === labCurrentMatch.targetCardId && sourceSide !== 'player') labCurrentMatch.target.damageTaken += reduction;
    }
    const afterShield = Array.isArray(target.shields) ? target.shields.reduce((sum, shield) => sum + Math.max(0, Number(shield.remaining ?? shield.amount) || 0), 0) : 0;
    const shieldAdded = Math.max(0, afterShield - beforeShield);
    if (shieldAdded > 0) {
      labCurrentMatch.sides[sourceSide].shieldGranted += shieldAdded;
      if (sourceSide === 'player' && String(source?.cardId) === labCurrentMatch.targetCardId) labCurrentMatch.target.shieldGranted += shieldAdded;
    }
    labCountSourceUtility(effect, target, source, result);
    return result;
  };

  const labOriginalChooseAiTurnPlan = chooseAiTurnPlan;
  chooseAiTurnPlan = function (side, ...args) {
    const result = labOriginalChooseAiTurnPlan.call(this, side, ...args);
    if (labCurrentMatch && side === 'player') {
      const targetUnit = (battleState?.playerUnits || []).find(unit => String(unit?.cardId) === labCurrentMatch.targetCardId);
      const action = targetUnit?.reservedAction || {};
      if (targetUnit && action.type === 'skill') {
        const skill = targetUnit.skills?.[action.skillIndex];
        if (skill) labGetSkillUsageBucket(labCurrentMatch.target, action.skillIndex, skill).plannedUses++;
      }
    }
    return result;
  };

  const labOriginalExecuteUnitAction = executeUnitAction;
  executeUnitAction = async function (unit, ...args) {
    if (!labCurrentMatch) return labOriginalExecuteUnitAction.call(this, unit, ...args);
    const action = unit?.reservedAction || {};
    const side = unit?.side;
    const targetIsCard = side === 'player' && String(unit?.cardId) === labCurrentMatch.targetCardId;
    let skillBucket = null;
    let apKey = null;
    let apBefore = null;
    if (side && labCurrentMatch.sides[side]) labCurrentMatch.sides[side].actions++;
    if (targetIsCard) {
      labCurrentMatch.target.actions++;
      if (action.type === 'skill') {
        labCurrentMatch.target.activeSkills++;
        const skill = unit.skills?.[action.skillIndex];
        if (skill) {
          skillBucket = labGetSkillUsageBucket(labCurrentMatch.target, action.skillIndex, skill);
          skillBucket.executedUses++;
          apKey = 'ap';
          apBefore = Number(unit?.ap) || 0;
        }
      }
    }
    if (side && labCurrentMatch.sides[side] && action.type === 'skill') labCurrentMatch.sides[side].activeSkills++;
    const previousActor = labActiveActor;
    const previousSource = labActiveSource;
    labActiveActor = unit;
    labActiveSource = unit;
    try {
      return await labOriginalExecuteUnitAction.call(this, unit, ...args);
    } finally {
      if (skillBucket && apKey) {
        const apAfter = Number(unit?.ap) || 0;
        skillBucket.apDeltaTotal += apAfter - apBefore;
      }
      labActiveActor = previousActor;
      labActiveSource = previousSource;
    }
  };

  const labOriginalExecuteMagicCard = executeMagicCard;
  executeMagicCard = async function (card, side = 'player', ...args) {
    const previousSource = labActiveSource;
    labActiveSource = { side, cardId: null, isMagic: true };
    let result;
    try {
      result = await labOriginalExecuteMagicCard.call(this, card, side, ...args);
    } finally {
      labActiveSource = previousSource;
    }
    if (labCurrentMatch && card) {
      const used = side === 'enemy' ? battleState?.enemyUsedMagicCardIds?.has?.(card.id) : battleState?.usedMagicCardIds?.has?.(card.id);
      if (used) labCurrentMatch.sides[side].magicUses++;
    }
    return result;
  };

  function labFormatYen(value) {
    const amount = Math.max(0, Math.round(Number(value) || 0));
    if (amount < 100_000_000) return `${Math.round(amount / 10_000).toLocaleString('ja-JP')}万円`;
    const oku = Math.floor(amount / 100_000_000);
    const man = Math.round((amount - oku * 100_000_000) / 10_000);
    return man ? `${oku.toLocaleString('ja-JP')}億${man.toLocaleString('ja-JP')}万円` : `${oku.toLocaleString('ja-JP')}億円`;
  }

  function labFormatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('ja-JP');
  }

  function labSetProgress(done, selectedCard) {
    const pct = Math.round(done / LAB_TOTAL_BATTLES * 100);
    const bar = document.getElementById('performance-lab-progress-bar');
    const count = document.getElementById('performance-lab-progress-count');
    const percent = document.getElementById('performance-lab-progress-percent');
    const title = document.getElementById('performance-lab-progress-title');
    const description = document.getElementById('performance-lab-progress-description');
    if (bar) bar.style.width = `${pct}%`;
    if (count) count.textContent = `${done} / ${LAB_TOTAL_BATTLES} 戦`;
    if (percent) percent.textContent = `${pct}%`;
    if (title) title.textContent = `${selectedCard.name || '選択カード'} を検証中…`;
    if (description) description.textContent = `選択カードのランクに合わせ、登録済みキャラをランダム編成。マジックなし・最高ランクAI同士で${LAB_TOTAL_BATTLES}戦しています。`;
    const el = document.getElementById('performance-lab-tier-progress');
    if (el) el.innerHTML = `<div class="rounded-lg border border-violet-400 bg-violet-950/50 p-3 col-span-3"><div class="text-xs font-black text-violet-200">ランダム編成での総合検証</div><div class="text-lg font-black text-white mt-1">${done} / ${LAB_TOTAL_BATTLES} 戦</div></div>`;
  }

  function labAggregateAdd(total, item) {
    for (const key of Object.keys(total)) {
      if (typeof total[key] === 'number') total[key] += Number(item?.[key]) || 0;
    }
  }

  function labNewTotals() {
    return { actions: 0, activeSkills: 0, damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, supportEffects: 0, controlEffects: 0, utilityEffects: 0, hpReductionEffects: 0 };
  }

  function labNewSideTotals() {
    return { damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, shieldAbsorbed: 0, supportEffects: 0, controlEffects: 0, actions: 0, activeSkills: 0, magicUses: 0, hpReductionEffects: 0 };
  }

  function labOutcomeScore(winner) {
    return winner === 'player' ? 1 : winner === 'draw' ? 0.5 : 0;
  }

  async function labYieldToBrowser() {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function labPlayBattle(targetCard, level, iteration, playerRoster, enemyRoster, magicPool) {
    const previousBattleState = battleState;
    const previousDeploymentSelection = deploymentSelection;
    const previousStoryOverride = storyBattleOverride;
    const previousCampaignOverride = campaignBattleOverride;
    const previousLabOverride = performanceLabBattleOverride;
    const previousCampaignHeadless = campaignHeadlessBattle;
    const previousWindowHeadless = window.__campaignHeadlessBattle;
    const previousLabFlag = window.__performanceLabRunning;
    const previousRunningFlag = battleExecutionRunning;
    const playerIds = playerRoster.map(card => card.id);
    const enemyIds = enemyRoster.map(card => card.id);
    const magicIds = [];
    const match = labFreshMetrics(targetCard.id);
    // The chosen array order is also the deployment order: first 4 active, then reserve 1.
    const targetRosterIndex = playerIds.findIndex(id => String(id) === String(targetCard.id));
    match.target.appearancePosition = targetRosterIndex < 0 ? 'active'
      : targetRosterIndex < 4 ? 'active' : 'reserve1';
    // A roster's order does not make it a new matchup; count unique card sets, not permutations.
    match.opponentRosterKey = enemyIds.map(String).sort().join('|');
    labCurrentMatch = match;
    labActiveActor = null;
    labActiveSource = null;

    try {
      // Isolate all mutable battle globals from story/campaign state.
      storyBattleOverride = null;
      campaignBattleOverride = null;
      performanceLabBattleOverride = {
        playerDeck: { id: `lab_player_${Date.now()}_${iteration}`, name: '検証チーム', unitIds: playerIds, magicIds: [] },
        enemyDeck: { id: `lab_enemy_${Date.now()}_${iteration}`, name: '比較チーム', unitIds: enemyIds, magicIds: [] },
        playerActive: playerIds.slice(0, 4),
        playerReserve: playerIds.slice(4, 5),
        enemyActive: enemyIds.slice(0, 4),
        enemyReserve: enemyIds.slice(4, 5),
        playerName: '検証チーム',
        enemyName: 'ランダム編成AI',
        playerIntelligence: 'master',
        enemyIntelligence: 'master',
        playerTacticalIQ: 100,
        enemyTacticalIQ: 100,
        playerAIProfile: null,
        enemyAIProfile: null,
        enemyPersonality: 'adaptive',
        playerPersonality: 'adaptive'
      };
      deploymentSelection = { player: { active: [], reserve: [] }, enemy: { active: [], reserve: [] } };
      campaignHeadlessBattle = true;
      window.__campaignHeadlessBattle = true;
      window.__performanceLabRunning = true;
      battleExecutionRunning = false;

      startBattle();
      await labYieldToBrowser();
      let guard = 0;
      while (!battleState?.resultWinner && guard < 22) {
        if (battleState?.phase === 'decision') {
          chooseAiTurnPlan('player');
          let validation = getPlayerReservationValidation();
          if (validation.apShortage || validation.hasUnselectedTarget) {
            // Defensive fallback only if the planner produced a reservation the battle engine rejects.
            (battleState.playerUnits || []).forEach(unit => { unit.reservedAction = { type: 'attack', targetInstanceId: null }; });
            battleState.reservedMagic = null;
            battleState.reservedMagicTargetInstanceId = null;
            battleState.reservedMagicSubTargetInstanceId = null;
            validation = getPlayerReservationValidation();
          }
          const beforeTurn = Number(battleState.turn) || 1;
          await confirmPlayerActions();
          if (!battleState.resultWinner && battleState.phase === 'decision' && (Number(battleState.turn) || 1) === beforeTurn) {
            // Avoid an infinite loop if an unexpected engine validation failure prevents turn execution.
            battleState.resultWinner = 'draw';
            battleState.phase = 'result';
            break;
          }
        } else if (battleState?.phase === 'execution') {
          await labYieldToBrowser();
        } else {
          break;
        }
        guard++;
        await labYieldToBrowser();
      }
      if (!battleState?.resultWinner) {
        battleState.resultWinner = 'draw';
        battleState.phase = 'result';
      }
      const targetUnit = (battleState.playerUnits || []).find(unit => String(unit.cardId) === String(targetCard.id));
      return {
        level,
        winner: battleState.resultWinner,
        turns: Math.max(1, Number(battleState.turn) || 1),
        targetSurvived: !!targetUnit && Number(targetUnit.currentHp) > 0,
        targetHpRatio: targetUnit && Number(targetUnit.maxHp) > 0 ? labClamp(Number(targetUnit.currentHp) / Number(targetUnit.maxHp), 0, 1) : 0,
        target: { ...match.target },
        sides: { player: { ...match.sides.player }, enemy: { ...match.sides.enemy } },
        opponentRosterKey: match.opponentRosterKey,
        playerRosterIds: playerIds.map(String),
        enemyRosterIds: enemyIds.map(String),
        playerRosterKey: playerIds.map(String).sort().join('|'),
        enemyRosterKey: enemyIds.map(String).sort().join('|')
      };
    } finally {
      labCurrentMatch = null;
      labActiveActor = null;
      labActiveSource = null;
      battleState = previousBattleState;
      deploymentSelection = previousDeploymentSelection;
      storyBattleOverride = previousStoryOverride;
      campaignBattleOverride = previousCampaignOverride;
      performanceLabBattleOverride = previousLabOverride;
      campaignHeadlessBattle = previousCampaignHeadless;
      window.__campaignHeadlessBattle = previousWindowHeadless;
      window.__performanceLabRunning = previousLabFlag;
      battleExecutionRunning = previousRunningFlag;
    }
  }

  function labPercent(value) {
    return `${(labClamp(value, 0, 1) * 100).toFixed(1)}%`;
  }

  function labScoreAndValue(targetCard, results, uniqueEnemyRosters, sameRankCount) {
    const count = results.length || 1;
    const wins = results.filter(row => row.winner === 'player').length;
    const draws = results.filter(row => row.winner === 'draw').length;
    const losses = results.filter(row => row.winner === 'enemy').length;
    // Win rate for value calibration counts wins only; draws are shown separately.
    const winRate = wins / count;
    const winPointRate = (wins + draws * 0.5) / count;
    const totalTarget = labNewTotals();
    const appearancePositions = { active: 0, reserve1: 0 };
    const skillUsage = {};
    for (const row of results) {
      const position = row.target?.appearancePosition;
      if (Object.prototype.hasOwnProperty.call(appearancePositions, position)) appearancePositions[position]++;
      for (const [key, metric] of Object.entries(row.target?.skillUsage || {})) {
        if (!skillUsage[key]) skillUsage[key] = { ...metric, plannedUses: 0, executedUses: 0, apDeltaTotal: 0 };
        skillUsage[key].plannedUses += Number(metric.plannedUses) || 0;
        skillUsage[key].executedUses += Number(metric.executedUses) || 0;
        skillUsage[key].apDeltaTotal += Number(metric.apDeltaTotal) || 0;
        skillUsage[key].cost = Math.max(0, Number(metric.cost) || 0);
      }
    }
    const totalPlayer = labNewSideTotals();
    const totalEnemy = labNewSideTotals();
    let survived = 0;
    let targetHpRatio = 0;
    let turnTotal = 0;
    for (const row of results) {
      labAggregateAdd(totalTarget, row.target);
      labAggregateAdd(totalPlayer, row.sides.player);
      labAggregateAdd(totalEnemy, row.sides.enemy);
      if (row.targetSurvived) survived++;
      targetHpRatio += Number(row.targetHpRatio) || 0;
      turnTotal += Number(row.turns) || 0;
    }
    const survivalRate = survived / count;
    const damageShare = totalTarget.damageDealt / Math.max(1, totalPlayer.damageDealt);
    const offenseScore = labClamp(damageShare / 0.32, 0, 1);
    const supportPerBattle = (totalTarget.supportEffects + totalTarget.controlEffects + totalTarget.healing / 1200 + totalTarget.shieldGranted / 1600) / count;
    const supportScore = labClamp(supportPerBattle / 2.2, 0, 1);
    const activityScore = Math.max(offenseScore, supportScore * 0.95);
    const averageDamageDealt = totalTarget.damageDealt / count;
    const averageDamageTaken = totalTarget.damageTaken / count;
    const averageKills = totalTarget.kills / count;
    const averageActions = totalTarget.actions / count;
    const averageSkills = totalTarget.activeSkills / count;
    const averageHealing = totalTarget.healing / count;
    const averageShield = totalTarget.shieldGranted / count;
    const averageSupport = totalTarget.supportEffects / count;
    const averageControl = totalTarget.controlEffects / count;
    const absoluteScore = labClamp(winRate * 65 + activityScore * 20 + survivalRate * 10 + labClamp(1 - Math.abs(winRate - 0.5), 0, 1) * 5, 0, 100);
    const relativeScore = labClamp(winRate * 100, 0, 100);
    const combinedScore = labClamp(absoluteScore * 0.70 + relativeScore * 0.30, 0, 100);
    const stars = labStars(targetCard);
    const range = LAB_VALUE_RANGES[stars] || null;
    const value = labEstimateValue(stars, winRate);
    const confidence = uniqueEnemyRosters >= 30 && sameRankCount >= 8 ? '比較的高い' : uniqueEnemyRosters >= 10 && sameRankCount >= 4 ? '標準' : '限定的';
    const confidenceFactor = confidence === '比較的高い' ? 0.06 : confidence === '標準' ? 0.12 : 0.22;
    const margin = range ? Math.max(10_000, Math.round((range.max - range.min) * confidenceFactor / 10_000) * 10_000) : null;
    const interval = range && value != null ? { min: Math.max(range.min, value - margin), max: Math.min(range.max, value + margin) } : null;
    return {
      stars, wins, draws, losses, winRate, winPointRate, totalTarget, totalPlayer, totalEnemy,
      survivalRate, averageHpRatio: targetHpRatio / count, averageTurns: turnTotal / count,
      damageShare, offenseScore: offenseScore * 100, supportScore: supportScore * 100, activityScore: activityScore * 100,
      absoluteScore, relativeScore, combinedScore, range, value, interval,
      confidence, count, uniqueEnemyRosters, sameRankCount,
      averageDamageDealt, averageDamageTaken, averageKills, averageActions, averageSkills,
      averageHealing, averageShield, averageSupport, averageControl, skillUsage, appearancePositions,
      appearancePositionRates: Object.fromEntries(Object.entries(appearancePositions).map(([key, value]) => [key, count ? value / count : 0]))
    };
  }

  function labEffectCanBePositiveSupport(effect, targetType) {
    if (!effect || typeof effect !== 'object') return false;
    const type = String(effect.type || '');
    const value = Number(effect.val) || 0;
    const target = String(targetType || 'self');
    const canTargetFriend = target === 'self' || target === 'player_self' || target.includes('ally') || target === 'same_main_target';
    if (!canTargetFriend) return false;
    if (['heal_fixed', 'heal_max_hp_ratio', 'shield', 'status_remove', 'clear_statuses', 'clear_debuffs', 'clear_random_debuffs'].includes(type)) return true;
    if (type === 'status_apply') return String(effect.status || 'poison') === 'stealth';
    if (['mod_atk_ratio', 'mod_atk_val', 'mod_speed', 'mod_max_hp_val', 'sub_chance_mod'].includes(type)) return value > 0;
    if (type === 'damage_taken_ratio') return value < 0;
    if (type === 'damage_cut_ratio') return value > 0;
    if (type === 'mod_ap') return value > 0;
    return false;
  }

  function labCardHasPositiveSupportSkill(card) {
    for (const skill of (Array.isArray(card?.skills) ? card.skills : [])) {
      if (labEffectCanBePositiveSupport(skill.mainEffect, skill.targetType)) return true;
      if (skill.hasSubEffect && skill.subEffect) {
        const targetType = skill.subEffect.targetType === 'same_main_target' ? skill.targetType : skill.subEffect.targetType;
        if (labEffectCanBePositiveSupport(skill.subEffect, targetType)) return true;
      }
    }
    return false;
  }

  function labBuildEvaluationText(card, summary) {
    const strengths = [];
    const weaknesses = [];
    const share = summary.damageShare;
    const avgDmg = summary.averageDamageDealt;
    const avgTaken = summary.averageDamageTaken;
    const avgKills = summary.averageKills;
    const avgActions = summary.averageActions;
    const avgSkills = summary.averageSkills;
    const avgHealing = summary.averageHealing;
    const avgShield = summary.averageShield;
    const avgSupport = summary.averageSupport;
    const avgControl = summary.averageControl;
    const survival = summary.survivalRate;
    const rate = summary.winRate;
    if (rate >= 0.70) strengths.push(`今回${summary.count}戦の勝率は${labPercent(rate)}（${summary.wins}勝・${summary.draws}分・${summary.losses}敗）。ランダム編成の同ランク帯に対して、チーム全体として高い勝率を記録しました。`);
    else if (rate >= 0.50) strengths.push(`今回${summary.count}戦の勝率は${labPercent(rate)}（${summary.wins}勝・${summary.draws}分・${summary.losses}敗）。ランダム編成の同ランク帯に対して、平均よりやや有利な結果です。`);
    else if (rate <= 0.30) weaknesses.push(`勝率は${labPercent(rate)}（${summary.wins}勝・${summary.draws}分・${summary.losses}敗）で、今回のランダム編成群に対して苦戦しました。本人の性能だけでなく、味方との相性や行動選択も含めて確認が必要です。`);
    if (share >= 0.30) strengths.push(`本人の平均与ダメージは1試合あたり${labFormatNumber(avgDmg)}。チーム総ダメージの${(share * 100).toFixed(1)}%を担当しており、主力アタッカーとして勝利に貢献しています。平均撃破数は${avgKills.toFixed(2)}体です。`);
    else if (share < 0.12) weaknesses.push(`本人の平均与ダメージは1試合あたり${labFormatNumber(avgDmg)}、チーム総ダメージに占める割合は${(share * 100).toFixed(1)}%です。直接攻撃での貢献は限定的でした。支援役として設計されたカードでない場合、攻撃スキルや行動機会が十分に活かせていない可能性があります。`);
    if (avgKills >= 0.45) strengths.push(`平均撃破数は1試合あたり${avgKills.toFixed(2)}体。ダメージを与えるだけでなく、相手を戦闘不能にするところまでつなげています。`);
    else if (avgDmg > 0 && avgKills < 0.12) weaknesses.push(`平均撃破数は1試合あたり${avgKills.toFixed(2)}体です。ダメージを与えても撃破に結びつく頻度は低めで、相手の残りHPを削り切る役割は味方に依存しやすい結果でした。`);
    if (survival >= 0.75) strengths.push(`今回${summary.count}戦を通じた本人の生存率は${labPercent(survival)}。平均行動回数は1試合あたり${avgActions.toFixed(2)}回で、倒されずに複数回行動しやすい耐久性が見られます。`);
    else if (survival < 0.4) weaknesses.push(`本人の生存率は${labPercent(survival)}、平均被ダメージは1試合あたり${labFormatNumber(avgTaken)}です。早期に倒されて行動機会を失う試合が多く、耐久力や味方の保護を弱点として確認できます。`);
    if (avgHealing >= 250 || avgShield >= 300 || avgSupport >= 1.0) strengths.push(`支援面では、平均回復量${labFormatNumber(avgHealing)}、平均シールド付与量${labFormatNumber(avgShield)}、味方への支援効果${avgSupport.toFixed(2)}回／試合を記録しました。味方の生存や継戦能力を支える働きが確認できます。`);
    if (avgControl >= 0.7) strengths.push(`敵への妨害効果は平均${avgControl.toFixed(2)}回／試合。状態異常・弱体などを通じ、相手の行動や火力を抑える貢献が見られます。`);
    if (avgSkills < 0.35 && (Array.isArray(card.skills) ? card.skills.length : 0) > 0) weaknesses.push(`スキル行動は平均${avgSkills.toFixed(2)}回／試合でした。設定スキルの発動頻度が低く、APコスト・発動条件・行動順などの影響でスキル性能を活かし切れていない可能性があります。`);
    if (avgTaken > Math.max(1, avgDmg) * 1.7 && survival < 0.65) weaknesses.push(`平均被ダメージ${labFormatNumber(avgTaken)}が平均与ダメージ${labFormatNumber(avgDmg)}を大きく上回っています。攻撃と耐久の交換効率が悪く、相手の攻撃を受ける前に行動する工夫や保護役との連携が課題です。`);
    if (avgHealing < 1 && avgShield < 1 && avgSupport < 0.25 && avgControl < 0.25 && labCardHasPositiveSupportSkill(card)) {
      weaknesses.push(`味方を支える効果を持っていますが、今回の${summary.count}戦では回復・シールド・有利な強化などの実測貢献が少なめでした。対象指定、発動条件、必要AP、行動順と味方の残HPを確認する余地があります。`);
    }
    if (!strengths.length) strengths.push(`平均与ダメージ${labFormatNumber(avgDmg)}、平均行動回数${avgActions.toFixed(2)}回、生存率${labPercent(survival)}という結果でした。今回のデータでは突出した強みを断定できないため、これらの実績値を基準に判断するのが適切です。`);
    if (!weaknesses.length) weaknesses.push(`今回の${summary.count}戦では明確な致命的弱点は数値上確認できませんでした。ただし平均被ダメージ${labFormatNumber(avgTaken)}、平均スキル行動${avgSkills.toFixed(2)}回、生存率${labPercent(survival)}などの指標を、他カードと比較すると改善点を見つけやすくなります。`);
    return { strengths: strengths.slice(0, 6), weaknesses: weaknesses.slice(0, 6) };
  }

  function labMetricCard(label, value, note = '') {
    return `<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><div class="text-[10px] text-slate-400">${labEsc(label)}</div><div class="text-xl sm:text-2xl font-black text-white mt-1">${labEsc(value)}</div>${note ? `<div class="text-[10px] text-slate-500 mt-1">${labEsc(note)}</div>` : ''}</div>`;
  }

  function labRenderReport(card, results, summary) {
    const report = document.getElementById('performance-lab-report');
    const progress = document.getElementById('performance-lab-progress-panel');
    if (!report) return;
    const copy = labBuildEvaluationText(card, summary);
    const img = typeof getCardImage === 'function' ? getCardImage(card) : card.img;
    const imgHtml = img ? `<img src="${labEsc(img)}" alt="${labEsc(card.name)}" class="w-20 h-28 sm:w-24 sm:h-32 rounded-lg border border-violet-500/50 object-cover bg-slate-950" onerror="this.style.display='none'">` : `<div class="w-20 h-28 sm:w-24 sm:h-32 flex items-center justify-center rounded-lg border border-violet-500/50 bg-slate-950 text-3xl">⚔️</div>`;
    const valueHtml = summary.value == null
      ? `<div class="text-2xl sm:text-3xl font-black text-amber-200">金額評価対象外</div><p class="text-xs text-slate-400 mt-1">推定金額帯は★3〜★5に設定されています。戦闘性能の結果は下記に表示します。</p>`
      : `<div class="text-3xl sm:text-4xl font-black text-amber-200">${labFormatYen(summary.value)}</div><div class="text-xs sm:text-sm text-slate-300 mt-2">参考範囲：${labFormatYen(summary.interval.min)}〜${labFormatYen(summary.interval.max)}</div><p class="text-[10px] text-slate-400 mt-2">勝率30%以下・40%・50%・60%・70%以上の指定基準点を、区間ごとに直線補間して算出。</p>`;
    const skillRows = (Array.isArray(card?.skills) ? card.skills : [])
      .map((skill, index) => ({ skill, index }))
      .filter(({ skill }) => skill?.type === 'active')
      .map(({ skill, index }) => {
        const key = labSkillUsageKey(index, skill);
        const usage = summary.skillUsage?.[key] || { plannedUses: 0, executedUses: 0, apDeltaTotal: 0, cost: Math.max(0, Number(skill?.cost) || 0), name: skill?.name || `スキル${index + 1}` };
        const apPerUse = usage.executedUses ? usage.apDeltaTotal / usage.executedUses : 0;
        const note = usage.plannedUses > usage.executedUses
          ? `AI予約${usage.plannedUses}回のうち実行${usage.executedUses}回。行動前に倒された可能性があります。`
          : usage.plannedUses === 0
            ? 'AIの行動計画では一度も選択されませんでした。'
            : 'AIが選択し、実際の行動として実行されました。';
        return `<tr class="border-t border-slate-800"><td class="px-3 py-2 text-slate-100 font-bold">${labEsc(skill?.name || `スキル${index + 1}`)}</td><td class="px-3 py-2 text-right">${usage.plannedUses}</td><td class="px-3 py-2 text-right font-black text-cyan-200">${usage.executedUses}</td><td class="px-3 py-2 text-right">${usage.cost} AP</td><td class="px-3 py-2 text-right">${usage.executedUses ? `${apPerUse >= 0 ? '+' : ''}${apPerUse.toFixed(1)} AP` : '—'}</td><td class="px-3 py-2 text-[10px] text-slate-400">${labEsc(note)}</td></tr>`;
      }).join('');
    const skillDiagnosticsHtml = skillRows
      ? `<section class="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4"><h4 class="text-base font-black text-cyan-200 mb-2">AIのスキル選択・実行診断</h4><p class="text-xs text-slate-400 mb-3">「AI予約」はAIが行動計画で選択した回数、「実行」は実際にキャラが行動した回数です。AP変化はスキル実行中のAP差分で、効果がAP+10なら通常は+10前後として観測されます。</p><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead class="bg-slate-950 text-slate-400"><tr><th class="px-3 py-2">スキル</th><th class="px-3 py-2 text-right">AI予約</th><th class="px-3 py-2 text-right">実行</th><th class="px-3 py-2 text-right">消費AP</th><th class="px-3 py-2 text-right">実行時AP変化／回</th><th class="px-3 py-2">判定</th></tr></thead><tbody>${skillRows}</tbody></table></div><p class="text-[10px] text-slate-500 mt-2">「AI予約0回」なら最高設定AIがそのスキルを行動計画に採用していません。「予約あり・実行少なめ」なら行動前に戦闘不能になった可能性があります。AP獲得効果があるのにAP変化が見られない場合は、スキルの追加効果設定や対象設定も確認してください。</p></section>`
      : `<section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-base font-black text-cyan-200 mb-2">AIのスキル選択・実行診断</h4><p class="text-xs text-slate-400">このキャラには能動スキルが登録されていません。パッシブ効果は通常のスキル行動回数には含めません。</p></section>`;
    const applyValueButton = summary.value == null ? '' : `<button type="button" data-card-id="${labEsc(card.id)}" data-card-value="${summary.value}" onclick="applyPerformanceLabValue(this.dataset.cardId, Number(this.dataset.cardValue), this)" class="mt-4 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-black text-white">推定価値を実際の価値に反映</button>`;
    report.innerHTML = `
      <section class="rounded-2xl border border-violet-500/50 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950 p-4 sm:p-6 shadow-xl">
        <div class="flex flex-wrap items-center gap-4">${imgHtml}<div class="min-w-0 flex-1"><div class="text-[10px] tracking-widest font-black text-violet-300">性能検証レポート</div><h3 class="text-xl sm:text-2xl font-black text-white mt-1">${labEsc(card.name || '名称未設定')}</h3><div class="text-amber-300 font-black mt-1">${'★'.repeat(summary.stars)}${'☆'.repeat(5 - summary.stars)}</div><div class="text-xs text-slate-400 mt-2">登録済みキャラのみ／マジックなし／最高ランクAI同士の${summary.count}戦集計</div></div></div>
        <div class="mt-5 rounded-xl border border-amber-500/30 bg-black/30 p-4"><div class="text-[10px] font-black text-amber-300">推定カード価値</div><div class="mt-1">${valueHtml}</div>${applyValueButton}<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">${labMetricCard('総合評価スコア', `${summary.combinedScore.toFixed(1)} / 100`, '絶対評価＋実測勝率')}${labMetricCard('本人が参加した試合の勝率', labPercent(summary.winRate), '勝利数 ÷ 全試合数（引き分けは勝利に含めない）')}${labMetricCard('本人の生存率', labPercent(summary.survivalRate), `${summary.wins}勝 ${summary.draws}分 ${summary.losses}敗（${summary.count}戦）`)}${labMetricCard('評価の信頼度', summary.confidence, `${summary.uniqueEnemyRosters}種類の敵編成／登録対象${summary.sameRankCount}枚`)}</div></div>
      </section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-base font-black text-cyan-200 mb-3">本人の実戦貢献（1試合あたり平均）</h4><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${labMetricCard('与ダメージ', labFormatNumber(summary.averageDamageDealt), `チーム総ダメージの${(summary.damageShare * 100).toFixed(1)}%`)}${labMetricCard('撃破数', summary.averageKills.toFixed(2), '体／試合')}${labMetricCard('行動回数', summary.averageActions.toFixed(2), '回／試合')}${labMetricCard('スキル行動', summary.averageSkills.toFixed(2), '回／試合')}${labMetricCard('被ダメージ', labFormatNumber(summary.averageDamageTaken), '1試合あたり平均')}${labMetricCard('回復量', labFormatNumber(summary.averageHealing), '1試合あたり平均')}${labMetricCard('シールド付与量', labFormatNumber(summary.averageShield), '1試合あたり平均')}${labMetricCard('支援効果', summary.averageSupport.toFixed(2), '回／試合')}${labMetricCard('妨害効果', summary.averageControl.toFixed(2), '回／試合')}${labMetricCard('生存時HP割合', labPercent(summary.averageHpRatio), '試合終了時点の平均')}${labMetricCard('試合ターン数', summary.averageTurns.toFixed(2), 'ターン／試合')}${labMetricCard('受けたダメージ合計', labFormatNumber(summary.totalTarget.damageTaken), `参考：${summary.count}戦の合計`)}</div><p class="text-[10px] text-slate-500 mt-3">ダメージ・回復・シールドは戦闘中に実際に処理された数値です。支援／妨害回数は効果処理の観測数であり、すべてが勝敗を決めたことを意味するものではありません。</p></section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-base font-black text-violet-200 mb-2">登場位置の統計（編成された${summary.count}戦）</h4><p class="text-xs text-slate-400 mb-3">「先陣」は出撃枠（最初の4体）を指します。控えは5枚目の1枠のみです。試合中の交代・登場前に倒されたかどうかとは区別した、編成時点の配置割合です。</p><div class="grid grid-cols-2 gap-2">${labMetricCard('先発4枚', `${summary.appearancePositions.active}戦（${labPercent(summary.appearancePositionRates.active)}）`, '最初から場に出る4体のいずれか')}${labMetricCard('控え1枚', `${summary.appearancePositions.reserve1}戦（${labPercent(summary.appearancePositionRates.reserve1)}）`, '5枚目の控えとして配置')}</div></section>
      ${skillDiagnosticsHtml}
      <section class="grid grid-cols-1 md:grid-cols-2 gap-3"><div class="rounded-xl border border-emerald-800/60 bg-slate-900 p-4"><h4 class="text-base font-black text-emerald-300 mb-3">強いところ・実際の貢献</h4><ul class="space-y-3">${copy.strengths.map(text => `<li class="text-sm leading-relaxed text-slate-200 flex gap-2"><span class="text-emerald-300">＋</span><span>${labEsc(text)}</span></li>`).join('')}</ul></div><div class="rounded-xl border border-rose-800/60 bg-slate-900 p-4"><h4 class="text-base font-black text-rose-300 mb-3">弱いところ・改善できそうな点</h4><ul class="space-y-3">${copy.weaknesses.map(text => `<li class="text-sm leading-relaxed text-slate-200 flex gap-2"><span class="text-rose-300">−</span><span>${labEsc(text)}</span></li>`).join('')}</ul></div></section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-sm font-black text-slate-200">今回の検証条件</h4><p class="text-xs leading-relaxed text-slate-400 mt-2">合計${summary.count}戦。検証対象のランクに合わせ、作成カード一覧に登録済みの★3〜★5キャラのみでチームをランダム編成します。★5カードを検証する場合は、双方とも★5を2体・★4を3体に固定します。★3・★4カードは同ランク5体で編成します。マジックカードは一切使用しません。双方の戦術AIは最高設定です。結果は一時表示のみで、キャンペーンデータや通常戦績は変更しません。</p></section>
      <div class="flex flex-wrap gap-2"><button type="button" onclick="rerunPerformanceLab()" class="px-4 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-black">同じカードを再検証</button><button type="button" onclick="resetPerformanceLabReport()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold">別のカードを選ぶ</button></div>`;
    report.classList.remove('hidden');
    progress?.classList.add('hidden');
  }

  function labRenderInterrupted(done, card) {
    const report = document.getElementById('performance-lab-report');
    const progress = document.getElementById('performance-lab-progress-panel');
    if (!report) return;
    report.innerHTML = `<section class="rounded-xl border border-amber-500/40 bg-slate-900 p-4 sm:p-6"><h3 class="text-xl font-black text-amber-200">検証を中断しました</h3><p class="text-sm text-slate-300 mt-2">${labEsc(card?.name || '選択カード')}：${done} / ${LAB_TOTAL_BATTLES} 戦まで完了しました。中断したため、推定価値と総合評価は算出していません。</p><button type="button" onclick="resetPerformanceLabReport()" class="mt-4 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold">別のカードを選ぶ</button></section>`;
    report.classList.remove('hidden');
    progress?.classList.add('hidden');
  }

  function renderPerformanceLabCardPicker() {
    const list = document.getElementById('performance-lab-card-list');
    const countEl = document.getElementById('performance-lab-card-count');
    if (!list) return;
    const query = String(document.getElementById('performance-lab-search')?.value || '').trim().toLocaleLowerCase('ja');
    const units = labAllUnits().filter(card => labStars(card) >= 3 && (!query || String(card.name || '').toLocaleLowerCase('ja').includes(query))).sort((a, b) => labStars(b) - labStars(a) || String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
    if (countEl) countEl.textContent = `${units.length} 枚`;
    list.innerHTML = '';
    if (!units.length) {
      list.innerHTML = `<div class="col-span-full rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-400">検証対象にできる★3〜★5の作成キャラカードがありません。カード作成一覧に登録してください。</div>`;
      return;
    }
    for (const card of units) {
      const wrap = document.createElement('div');
      wrap.className = 'min-w-0 rounded-xl border border-slate-700 bg-slate-950 p-2 flex flex-col gap-2 hover:border-violet-400 transition';
      const img = typeof getCardImage === 'function' ? getCardImage(card) : card.img;
      const cardHtml = getCardHTML({ id: card.id, cardType: 'unit', name: card.name, mainAttr: card.mainAttr, subAttrs: card.subAttrs || [], hp: card.stats?.hp || 0, atk: card.stats?.atk || 0, prio: card.stats?.priority ?? 0, rank: labStars(card), img, desc: card.desc });
      wrap.innerHTML = `<div class="pointer-events-none">${cardHtml}</div><div class="px-1"><div class="text-sm font-black text-slate-100 truncate">${labEsc(card.name || '名称未設定')}</div><div class="text-[10px] text-amber-300 font-black mt-1">${'★'.repeat(labStars(card))}${'☆'.repeat(5 - labStars(card))}</div><div class="text-[10px] text-slate-400 mt-1">HP ${labEsc(card.stats?.hp ?? 0)} / 攻撃 ${labEsc(card.stats?.atk ?? 0)}</div></div><button type="button" data-performance-lab-pick="${labEsc(card.id)}" class="w-full py-2.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-black">このカードを検証</button>`;
      const button = wrap.querySelector('[data-performance-lab-pick]');
      button?.addEventListener('click', () => runPerformanceLab(String(card.id)));
      list.appendChild(wrap);
    }
  }

  function labNewBatchCardStats(card) {
    return {
      card,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      opponentRosters: new Set()
    };
  }

  function labRecordBatchAppearance(stats, winner, side, opponentRosterKey) {
    if (!stats) return;
    stats.games++;
    if (winner === 'draw') stats.draws++;
    else if (winner === side) stats.wins++;
    else stats.losses++;
    if (opponentRosterKey) stats.opponentRosters.add(opponentRosterKey);
  }

  function labBatchSummary(card, stats, sameRankCount) {
    const count = stats.games;
    const winRate = count ? stats.wins / count : 0;
    const winPointRate = count ? (stats.wins + stats.draws * 0.5) / count : 0;
    const stars = labStars(card);
    const range = LAB_VALUE_RANGES[stars] || null;
    let value = null;
    let interval = null;
    let confidence = 'データなし';
    if (range && count > 0) {
      value = labEstimateValue(stars, winRate);
      const uniqueEnemyRosters = stats.opponentRosters.size;
      confidence = uniqueEnemyRosters >= 30 && sameRankCount >= 8 ? '比較的高い' : uniqueEnemyRosters >= 10 && sameRankCount >= 4 ? '標準' : '限定的';
      const confidenceFactor = confidence === '比較的高い' ? 0.06 : confidence === '標準' ? 0.12 : 0.22;
      const margin = Math.round((range.max - range.min) * confidenceFactor / 10_000) * 10_000;
      interval = { min: Math.max(range.min, value - margin), max: Math.min(range.max, value + margin) };
    }
    return {
      stars, wins: stats.wins, draws: stats.draws, losses: stats.losses,
      winRate, winPointRate, count, value, interval, confidence,
      uniqueEnemyRosters: stats.opponentRosters.size, sameRankCount
    };
  }

  function labSetBatchProgress(totalBattles, rank, candidates, statsById) {
    const goal = candidates.length * LAB_TOTAL_BATTLES;
    const credited = candidates.reduce((sum, card) => sum + Math.min(LAB_TOTAL_BATTLES, statsById.get(String(card.id))?.games || 0), 0);
    const completed = candidates.filter(card => (statsById.get(String(card.id))?.games || 0) >= LAB_TOTAL_BATTLES).length;
    const minimum = candidates.length ? Math.min(...candidates.map(card => statsById.get(String(card.id))?.games || 0)) : 0;
    const pct = goal > 0 ? Math.round(credited / goal * 100) : 0;
    const bar = document.getElementById('performance-lab-progress-bar');
    const count = document.getElementById('performance-lab-progress-count');
    const percent = document.getElementById('performance-lab-progress-percent');
    const title = document.getElementById('performance-lab-progress-title');
    const description = document.getElementById('performance-lab-progress-description');
    if (bar) bar.style.width = `${pct}%`;
    if (count) count.textContent = `実施 ${totalBattles.toLocaleString('ja-JP')} 戦　・　${LAB_TOTAL_BATTLES}戦到達 ${completed} / ${candidates.length} 枚`;
    if (percent) percent.textContent = `${pct}%`;
    if (title) title.textContent = `★${rank} 一括評価中（${completed} / ${candidates.length} 枚が${LAB_TOTAL_BATTLES}戦到達）`;
    if (description) description.textContent = `試合に参加した対象キャラの回数をまとめて加算しています。現在の最少参加数：${minimum} / ${LAB_TOTAL_BATTLES}戦。全員が設定回数以上になると終了します。`;
    const details = document.getElementById('performance-lab-tier-progress');
    if (details) details.innerHTML = `<div class="rounded-lg border border-violet-400 bg-violet-950/50 p-3 col-span-3"><div class="text-xs font-black text-violet-200">ランク内一括評価</div><div class="text-lg font-black text-white mt-1">${completed} / ${candidates.length} 枚が${LAB_TOTAL_BATTLES}戦到達</div><div class="text-xs text-slate-300 mt-1">実施対戦数 ${totalBattles.toLocaleString('ja-JP')} 戦　・　最少参加数 ${minimum} / ${LAB_TOTAL_BATTLES}戦</div></div>`;
  }

  function labRenderBatchReport(rank, candidates, statsById, complete, totalBattles) {
    const report = document.getElementById('performance-lab-report');
    const progress = document.getElementById('performance-lab-progress-panel');
    if (!report) return;
    const sameRankCount = candidates.length;
    const entries = candidates.map(card => ({
      card,
      summary: labBatchSummary(card, statsById.get(String(card.id)) || labNewBatchCardStats(card), sameRankCount)
    }));
    const ordered = [...entries].sort((a, b) => {
      if (!a.summary.count && b.summary.count) return 1;
      if (a.summary.count && !b.summary.count) return -1;
      return b.summary.winRate - a.summary.winRate
        || b.summary.winPointRate - a.summary.winPointRate
        || b.summary.count - a.summary.count
        || String(a.card.name || '').localeCompare(String(b.card.name || ''), 'ja');
    });
    const completedCount = entries.filter(entry => entry.summary.count >= LAB_TOTAL_BATTLES).length;
    const rows = ordered.map((entry, index) => {
      const summary = entry.summary;
      const rankMarks = `${'★'.repeat(rank)}${'☆'.repeat(5 - rank)}`;
      const value = summary.value == null ? '—' : labFormatYen(summary.value);
      const applyButton = complete && summary.value != null
        ? `<button type="button" data-card-id="${labEsc(entry.card.id)}" data-card-value="${summary.value}" onclick="applyPerformanceLabValue(this.dataset.cardId, Number(this.dataset.cardValue), this)" class="mt-1 px-2 py-1 rounded bg-amber-700 hover:bg-amber-600 text-[10px] font-black text-white whitespace-nowrap">実際の価値に反映</button>`
        : '';
      const winRate = summary.count ? labPercent(summary.winRate) : '—';
      const participationStatus = summary.count >= LAB_TOTAL_BATTLES
        ? `<span class="text-emerald-300">${LAB_TOTAL_BATTLES}戦到達</span>`
        : `<span class="text-amber-300">${summary.count} / ${LAB_TOTAL_BATTLES}</span>`;
      return `<tr class="border-t border-slate-800"><td class="px-3 py-3 text-center font-black text-slate-300">${index + 1}</td><td class="px-3 py-3"><div class="font-black text-slate-100">${labEsc(entry.card.name || '名称未設定')}</div><div class="text-[10px] text-amber-300 mt-1">${rankMarks}</div><div class="text-[10px] mt-1">${participationStatus}</div></td><td class="px-3 py-3 text-right text-xs text-slate-300 whitespace-nowrap">${summary.count.toLocaleString('ja-JP')}</td><td class="px-3 py-3 text-right font-black text-cyan-200 whitespace-nowrap">${winRate}</td><td class="px-3 py-3 text-right text-xs text-slate-300 whitespace-nowrap">${summary.wins}勝 ${summary.draws}分 ${summary.losses}敗</td><td class="px-3 py-3 text-right text-xs text-amber-200 whitespace-nowrap">${value}<div>${applyButton}</div></td></tr>`;
    }).join('');
    const status = complete
      ? `<div class="rounded-lg border border-emerald-700/50 bg-emerald-950/20 p-3 text-sm text-emerald-200">評価完了：対象${entries.length}枚すべての参加試合数が${LAB_TOTAL_BATTLES}回以上になりました。合計${totalBattles.toLocaleString('ja-JP')}戦を実行しました。最後の対戦で設定回数を超えたキャラも、その実数のまま表示しています。</div>`
      : `<div class="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">一括評価は中断されました。${completedCount} / ${entries.length}枚が${LAB_TOTAL_BATTLES}回以上に到達しています。実施${totalBattles.toLocaleString('ja-JP')}戦。未到達カードの勝率は途中経過なので参考値です。</div>`;
    const playedAppearances = entries.reduce((sum, entry) => sum + entry.summary.count, 0);
    labLastCompleteBatchValues = complete
      ? entries.filter(entry => entry.summary.value != null && Number.isFinite(Number(entry.summary.value)) && Number(entry.summary.value) > 0)
          .map(entry => ({ cardId: String(entry.card.id), name: String(entry.card.name || '名称未設定'), value: Math.round(Number(entry.summary.value) / 10000) * 10000 }))
      : null;
    const bulkApplyButton = complete && labLastCompleteBatchValues?.length
      ? `<button type="button" data-lab-bulk-apply onclick="applyPerformanceLabBatchValues(this)" class="px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm font-black text-white">一括で価値を実際の価値に反映（${labLastCompleteBatchValues.length}枚）</button><p class="text-[10px] text-slate-400 mt-2">ボタンを押した後の確認で承認すると、今回評価した全カードの市場価値をまとめて上書きします。</p>`
      : '';
    report.innerHTML = `
      <section class="rounded-2xl border border-violet-500/50 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950 p-4 sm:p-6 shadow-xl">
        <div class="text-[10px] font-black tracking-widest text-violet-300">BATCH PERFORMANCE RANKING</div>
        <h3 class="text-xl sm:text-2xl font-black text-white mt-1">★${rank}キャラ 一括評価ランキング</h3>
        <p class="text-xs text-slate-300 mt-2">ランク帯のランダム対戦を共通で実施し、各対戦のチームに参加した対象キャラの試合数・勝敗を個別に加算します。全キャラが${LAB_TOTAL_BATTLES}回以上参加した時点で終了します。★3・★4は同ランク5体、★5は★5を2体＋★4を3体の編成です。両陣営でカードIDが重複した編成は無効とし、試合数・勝敗を一切加算せず再抽選します。登録済み作成カードのみを使い、マジックは使いません。</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">${labMetricCard('評価対象', `${entries.length} 枚`, '選択ランクの作成キャラ')}${labMetricCard('実施対戦数', labFormatNumber(totalBattles), '共有した戦闘シミュレーション数')}${labMetricCard(`${LAB_TOTAL_BATTLES}回到達`, `${completedCount} / ${entries.length} 枚`, `参加回数合計 ${labFormatNumber(playedAppearances)}`)}</div>
      </section>
      ${status}
      ${bulkApplyButton ? `<section class="rounded-xl border border-amber-500/40 bg-amber-950/10 p-3 sm:p-4">${bulkApplyButton}</section>` : ''}
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-2 sm:p-4"><div class="flex flex-wrap justify-between items-end gap-2 px-1 pb-3"><h4 class="text-base font-black text-cyan-200">勝率ランキング</h4><p class="text-[10px] text-slate-400">勝率順。同率時は勝ち点率、参加回数、名前順で整列</p></div><div class="overflow-x-auto"><table class="w-full text-left text-xs"><thead class="bg-slate-950 text-[10px] text-slate-400"><tr><th class="px-3 py-3 text-center">順位</th><th class="px-3 py-3">キャラ</th><th class="px-3 py-3 text-right">参加試合数</th><th class="px-3 py-3 text-right">勝率</th><th class="px-3 py-3 text-right">戦績</th><th class="px-3 py-3 text-right">推定価値／操作</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="px-3 py-8 text-center text-slate-400">まだ参加したキャラがありません。</td></tr>`}</tbody></table></div><p class="text-[10px] text-slate-500 mt-3">参加試合数は、そのキャラが所属した有効な対戦での出場回数です。両陣営のカードIDに重複がある編成は無効試合として再抽選し、試合数・勝敗には加算しません。勝率＝勝利数 ÷ 出場回数。引き分けは勝利数に含めません。推定価値はランク別の指定基準（勝率30%以下・40%・50%・60%・70%以上）を区間ごとに直線補間して算出します。</p></section>
      <div class="flex flex-wrap gap-2"><button type="button" onclick="resetPerformanceLabReport()" class="px-4 py-3 bg-violet-700 hover:bg-violet-600 rounded-xl text-sm font-black">別のランク・カードを評価</button><button type="button" onclick="switchView('deck')" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold">作成カード一覧へ</button></div>`;
    report.dataset.batchRank = String(rank);
    report.classList.remove('hidden');
    progress?.classList.add('hidden');
  }

  function labPickLeastTested(candidates, statsById, count, excludeIds = []) {
    const excluded = new Set(excludeIds.map(String));
    const randomized = labShuffle((Array.isArray(candidates) ? candidates : []).filter(card => !excluded.has(String(card.id))));
    randomized.sort((a, b) => (statsById.get(String(a.id))?.games || 0) - (statsById.get(String(b.id))?.games || 0));
    return randomized.slice(0, Math.max(0, count));
  }

  function labRostersHaveDuplicate(playerRoster, enemyRoster) {
    const playerIds = (Array.isArray(playerRoster) ? playerRoster : []).map(card => String(card?.id));
    const enemyIds = (Array.isArray(enemyRoster) ? enemyRoster : []).map(card => String(card?.id));
    const allIds = [...playerIds, ...enemyIds];
    // A valid matchup has five cards per team and every card ID occurs only once
    // across both teams (as well as within either individual roster).
    return playerIds.length !== 5 || enemyIds.length !== 5 || new Set(allIds).size !== allIds.length;
  }

  function labBuildBatchRoster(rank, candidates, allUnits, statsById, excludeForThisSide = []) {
    const excluded = new Set(excludeForThisSide.map(String));
    if (rank === 5) {
      const aces = labPickLeastTested(candidates, statsById, 2, [...excluded]);
      if (aces.length !== 2) throw new Error('★5一括評価では、両陣営に重複なしで配置するため★5カードが合計4枚以上必要です。');
      const aceIds = aces.map(c=>String(c.id));
      const star4 = allUnits.filter(card => labStars(card) === 4 && !excluded.has(String(card.id)) && !aceIds.includes(String(card.id)));
      if (star4.length < 3) throw new Error('★5一括評価で両陣営に★4を3体ずつ配置するため、★4カードが合計6枚以上必要です。');
      const fillers = labPickLeastTested(star4, statsById, 3, [...excluded, ...aceIds]);
      if (fillers.length !== 3) throw new Error('★5一括評価の★4補充カードを重複なしで選べませんでした。');
      return labArrangeRoster([...aces, ...fillers], aces[0]);
    }
    const roster = labPickLeastTested(candidates, statsById, 5, [...excluded]);
    if (roster.length !== 5) {
      throw new Error(`★${rank}一括評価で両陣営に重複なしで編成するには、同ランクの作成キャラカードが10枚以上必要です。現在は${candidates.length}枚です。`);
    }
    return labArrangeRoster(roster);
  }

  async function runPerformanceLabBatch() {
    if (labRunning) return;
    labReadBattleCount();
    const rank = Number(document.getElementById('performance-lab-batch-rank')?.value || 3);
    if (![3, 4, 5].includes(rank)) {
      alert('★3・★4・★5から評価ランクを選択してください。');
      return;
    }
    const allUnits = labAllUnits();
    const candidates = allUnits.filter(card => labStars(card) === rank)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
    if (!candidates.length) {
      alert(`作成カード一覧に評価対象の★${rank}キャラカードがありません。`);
      return;
    }
    // Strictly require enough distinct authored cards to make two disjoint rosters.
    // A batch with a card on both sides is invalid and must never contribute statistics.
    if (rank === 5) {
      const star4Count = allUnits.filter(card => labStars(card) === 4).length;
      if (candidates.length < 4) {
        alert('★5一括評価では同じカードを両陣営に入れないため、作成カード一覧に★5キャラカードが4枚以上必要です。');
        return;
      }
      if (star4Count < 6) {
        alert(`★5一括評価では両陣営に★4を3体ずつ配置するため、作成カード一覧に★4キャラカードが6枚以上必要です。現在は${star4Count}枚です。`);
        return;
      }
    } else if (candidates.length < 10) {
      alert(`★${rank}一括評価では同じカードを両陣営に入れないため、同ランクの作成キャラカードが10枚以上必要です。現在は${candidates.length}枚です。`);
      return;
    }

    const statsById = new Map(candidates.map(card => [String(card.id), labNewBatchCardStats(card)]));
    labLastCompleteBatchValues = null;
    labRunning = true;
    labCancelRequested = false;
    const previousRunLabFlag = window.__performanceLabRunning;
    window.__performanceLabRunning = true;
    labLockNavigation(true);
    const picker = document.getElementById('performance-lab-picker-panel');
    const progress = document.getElementById('performance-lab-progress-panel');
    const report = document.getElementById('performance-lab-report');
    picker?.classList.add('hidden');
    progress?.classList.remove('hidden');
    report?.classList.add('hidden');
    if (report) report.innerHTML = '';
    const cancelButton = document.getElementById('performance-lab-cancel');
    if (cancelButton) { cancelButton.disabled = false; cancelButton.textContent = '一括評価を中断'; }

    const sameRankCount = candidates.length;
    let totalBattles = 0;
    let rejectedLineups = 0;
    const maxRejectedLineups = 100;
    const slotsPerBattle = rank === 5 ? Math.min(4, candidates.length) : Math.min(10, candidates.length);
    const maxBatchBattles = Math.ceil(LAB_TOTAL_BATTLES * candidates.length / Math.max(1, slotsPerBattle)) + Math.max(10, Math.ceil(LAB_TOTAL_BATTLES * 0.02));
    const allReachedTarget = () => candidates.every(card => (statsById.get(String(card.id))?.games || 0) >= LAB_TOTAL_BATTLES);
    try {
      labSetBatchProgress(totalBattles, rank, candidates, statsById);
      await labYieldToBrowser();
      while (!allReachedTarget() && totalBattles < maxBatchBattles) {
        if (labCancelRequested) {
          labRenderBatchReport(rank, candidates, statsById, false, totalBattles);
          return;
        }

        // Build two disjoint five-card teams. If a collision is ever produced, discard
        // the lineup completely and draw again without starting/counting a battle.
        let playerRoster = null;
        let enemyRoster = null;
        let acceptedLineup = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          playerRoster = labBuildBatchRoster(rank, candidates, allUnits, statsById, []);
          const playerIds = playerRoster.map(card => String(card.id));
          enemyRoster = labBuildBatchRoster(rank, candidates, allUnits, statsById, playerIds);
          if (!labRostersHaveDuplicate(playerRoster, enemyRoster)) {
            acceptedLineup = true;
            break;
          }
          rejectedLineups++;
          if (rejectedLineups >= maxRejectedLineups) {
            throw new Error('両陣営でカードが重複しない編成を再抽選できませんでした。カード一覧を確認してください。');
          }
        }
        if (!acceptedLineup) {
          rejectedLineups++;
          if (rejectedLineups >= maxRejectedLineups) {
            throw new Error('両陣営でカードが重複しない編成を再抽選できませんでした。カード一覧を確認してください。');
          }
          continue;
        }

        const focalCard = playerRoster[0];
        const row = await labPlayBattle(focalCard, 'random', totalBattles, playerRoster, enemyRoster, []);
        // Final defense: even if an unexpected engine/integration change returns a
        // duplicated lineup, do not count it and retry the match.
        if (labRostersHaveDuplicate(row.playerRosterIds.map(id => ({ id })), row.enemyRosterIds.map(id => ({ id })))) {
          rejectedLineups++;
          if (rejectedLineups >= maxRejectedLineups) {
            throw new Error('対戦結果に陣営間のカード重複が検出されました。重複のない対戦を確保できず、集計を中断しました。');
          }
          continue;
        }

        totalBattles++;
        const playerRosterKey = row.playerRosterKey || row.playerRosterIds.map(String).sort().join('|');
        const enemyRosterKey = row.enemyRosterKey || row.enemyRosterIds.map(String).sort().join('|');
        // Only validated, disjoint lineups can contribute to a character's sample count.
        for (const cardId of row.playerRosterIds) {
          const stats = statsById.get(String(cardId));
          if (stats) labRecordBatchAppearance(stats, row.winner, 'player', enemyRosterKey);
        }
        for (const cardId of row.enemyRosterIds) {
          const stats = statsById.get(String(cardId));
          if (stats) labRecordBatchAppearance(stats, row.winner, 'enemy', playerRosterKey);
        }

        labSetBatchProgress(totalBattles, rank, candidates, statsById);
        await labYieldToBrowser();
      }
      if (!allReachedTarget()) {
        throw new Error(`安全上限${maxBatchBattles}戦に達しましたが、全カードの${LAB_TOTAL_BATTLES}戦到達を確認できませんでした。集計を中断しました。`);
      }
      labRenderBatchReport(rank, candidates, statsById, true, totalBattles);
    } catch (error) {
      console.error('[Performance Lab] Batch verification failed:', error);
      if (report) {
        report.innerHTML = `<section class="rounded-xl border border-rose-500/40 bg-slate-900 p-4"><h3 class="text-lg font-black text-rose-300">一括評価を完了できませんでした</h3><p class="text-sm text-slate-300 mt-2">${labEsc(error?.message || String(error))}</p><p class="text-xs text-slate-500 mt-2">カードやキャンペーンデータは保存・変更していません。登録カードの編成条件とカード設定を確認してください。</p><button type="button" onclick="resetPerformanceLabReport()" class="mt-4 px-4 py-3 bg-slate-800 rounded-lg text-sm font-bold">評価画面に戻る</button></section>`;
        report.classList.remove('hidden');
      }
      progress?.classList.add('hidden');
    } finally {
      labRunning = false;
      labCancelRequested = false;
      window.__performanceLabRunning = previousRunLabFlag;
      labLockNavigation(false);
      if (cancelButton) { cancelButton.disabled = false; cancelButton.textContent = '検証を中断'; }
      if (picker && !report?.classList.contains('hidden')) picker.classList.add('hidden');
      if (picker && report?.classList.contains('hidden')) picker.classList.remove('hidden');
    }
  }

  function resetPerformanceLabReport() {
    labCancelRequested = false;
    labLastCompleteBatchValues = null;
    const report = document.getElementById('performance-lab-report');
    const progress = document.getElementById('performance-lab-progress-panel');
    report?.classList.add('hidden');
    if (report) report.innerHTML = '';
    progress?.classList.add('hidden');
    document.getElementById('performance-lab-picker-panel')?.classList.remove('hidden');
    renderPerformanceLabCardPicker();
  }

  function labLockNavigation(locked) {
    if (locked) {
      if (labNavigationState.length) return;
      const buttons = Array.from(document.querySelectorAll('header nav button, #view-performance-lab > div:first-child button'));
      labNavigationState = buttons.map(button => ({
        button,
        disabled: !!button.disabled,
        ariaDisabled: button.getAttribute('aria-disabled'),
        title: button.getAttribute('title')
      }));
      buttons.forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
        button.setAttribute('title', '性能検証中は画面移動できません。中断してから移動してください。');
        button.classList.add('opacity-50', 'cursor-not-allowed');
      });
      return;
    }
    for (const item of labNavigationState) {
      if (!item.button) continue;
      item.button.disabled = item.disabled;
      if (item.ariaDisabled == null) item.button.removeAttribute('aria-disabled');
      else item.button.setAttribute('aria-disabled', item.ariaDisabled);
      if (item.title == null) item.button.removeAttribute('title');
      else item.button.setAttribute('title', item.title);
      item.button.classList.remove('opacity-50', 'cursor-not-allowed');
    }
    labNavigationState = [];
  }

  async function runPerformanceLab(cardId) {
    if (labRunning) return;
    labLastCompleteBatchValues = null;
    labReadBattleCount();
    const targetCard = labAllUnits().find(card => String(card.id) === String(cardId));
    if (!targetCard) {
      alert('検証対象のキャラカードが見つかりません。作成カード一覧を開き直してください。');
      return;
    }
    const allUnits = labAllUnits();
    const targetStars = labStars(targetCard);
    const sameRankCount = allUnits.filter(card => labStars(card) === targetStars).length;
    try {
      const preflightPlayer = labBuildPlayerRoster(targetCard, allUnits);
      labBuildEnemyRoster(targetCard, allUnits, preflightPlayer.map(c=>String(c.id)));
    } catch (error) {
      alert(error.message || String(error));
      return;
    }

    labRunning = true;
    labCancelRequested = false;
    const previousRunLabFlag = window.__performanceLabRunning;
    window.__performanceLabRunning = true;
    labLockNavigation(true);
    const picker = document.getElementById('performance-lab-picker-panel');
    const progress = document.getElementById('performance-lab-progress-panel');
    const report = document.getElementById('performance-lab-report');
    picker?.classList.add('hidden');
    progress?.classList.remove('hidden');
    report?.classList.add('hidden');
    if (report) report.innerHTML = '';
    const cancelButton = document.getElementById('performance-lab-cancel');
    if (cancelButton) { cancelButton.disabled = false; cancelButton.textContent = '検証を中断'; }

    const magicPool = []; // The lab intentionally excludes all magic cards.
    const results = [];
    const uniqueRosters = new Set();
    let done = 0;
    try {
      // Preflight once, then run the configured number of randomized registered-card team battles.
      const preflightPlayer = labBuildPlayerRoster(targetCard, allUnits);
      labBuildEnemyRoster(targetCard, allUnits, preflightPlayer.map(c=>String(c.id)));
      labSetProgress(done, targetCard);
      await labYieldToBrowser();
      for (let i = 0; i < LAB_TOTAL_BATTLES; i++) {
        if (labCancelRequested) {
          labRenderInterrupted(done, targetCard);
          return;
        }
        let playerRoster = null, enemyRoster = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          playerRoster = labBuildPlayerRoster(targetCard, allUnits);
          enemyRoster = labBuildEnemyRoster(targetCard, allUnits, playerRoster.map(c=>String(c.id)));
          if (!labRostersHaveDuplicate(playerRoster, enemyRoster)) break;
          playerRoster = null; enemyRoster = null;
        }
        if (!playerRoster || !enemyRoster) throw new Error('カード重複のない検証チームを作成できませんでした。★5・★4の登録カード数を確認してください。');
        const row = await labPlayBattle(targetCard, 'random', i, playerRoster, enemyRoster, magicPool);
        results.push(row);
        uniqueRosters.add(row.opponentRosterKey);
        done++;
        labSetProgress(done, targetCard);
        await labYieldToBrowser();
      }
      const summary = labScoreAndValue(targetCard, results, uniqueRosters.size, sameRankCount);
      labRenderReport(targetCard, results, summary);
      window.__lastPerformanceLabReport = null; // Deliberately do not retain even a global copy after rendering.
    } catch (error) {
      console.error('[Performance Lab] Verification failed:', error);
      if (report) {
        report.innerHTML = `<section class="rounded-xl border border-rose-500/40 bg-slate-900 p-4"><h3 class="text-lg font-black text-rose-300">検証を完了できませんでした</h3><p class="text-sm text-slate-300 mt-2">${labEsc(error?.message || String(error))}</p><p class="text-xs text-slate-500 mt-2">カードやキャンペーンデータは保存・変更していません。登録カードの編成条件を確認して、再度お試しください。</p><button type="button" onclick="resetPerformanceLabReport()" class="mt-4 px-4 py-3 bg-slate-800 rounded-lg text-sm font-bold">カード選択に戻る</button></section>`;
        report.classList.remove('hidden');
      }
      progress?.classList.add('hidden');
    } finally {
      labRunning = false;
      labCancelRequested = false;
      window.__performanceLabRunning = previousRunLabFlag;
      labLockNavigation(false);
      if (cancelButton) { cancelButton.disabled = false; cancelButton.textContent = '検証を中断'; }
      if (picker && !report?.classList.contains('hidden')) picker.classList.add('hidden');
      if (picker && report?.classList.contains('hidden')) picker.classList.remove('hidden');
    }
  }

  async function applyPerformanceLabBatchValues(button = null) {
    const report = document.getElementById('performance-lab-report');
    const reportRank = report?.dataset?.batchRank;
    const items = Array.isArray(labLastCompleteBatchValues) ? labLastCompleteBatchValues : [];
    if (!report || report.classList.contains('hidden') || reportRank == null || !items.length) {
      alert('一括反映できる完了済み評価がありません。ランクの一括評価を最後まで完了してください。');
      return;
    }

    const currentCards = Array.isArray(allCards) ? allCards : [];
    const byId = new Map(currentCards.filter(card => card && (card.cardType || 'unit') === 'unit' && !card.campaignInstance)
      .map(card => [String(card.id), card]));
    const applicable = items.map(item => ({ item, card: byId.get(String(item.cardId)) }))
      .filter(entry => entry.card && Number.isFinite(Number(entry.item.value)) && Number(entry.item.value) > 0);
    const missingCount = items.length - applicable.length;
    if (!applicable.length) {
      alert('反映できる作成キャラカードが見つかりません。作成カード一覧を開き直してから再度お試しください。');
      return;
    }
    const previewLines = applicable.slice(0, 6).map(({ item, card }) =>
      `・${String(card.name || item.name || '名称未設定')}：${labFormatYen(Math.max(0, Number(card.value) || 0))} → ${labFormatYen(item.value)}`);
    if (applicable.length > 6) previewLines.push(`・ほか${applicable.length - 6}枚`);
    const promptText = `★${reportRank}の一括評価結果を、実際の市場価値に反映します。

対象カード：${applicable.length}枚${missingCount ? `（見つからないカード${missingCount}枚は除外）` : ''}

${previewLines.join('\n')}

対象カードの現在の価値を推定価値でまとめて上書きします。実行しますか？`;
    if (!confirm(promptText)) return;

    if (button) { button.disabled = true; button.textContent = 'まとめて反映中…'; }
    let applied = 0;
    try {
      for (const { item, card } of applicable) {
        card.value = Math.round(Number(item.value) / 10000) * 10000;
        await saveToStore('cards', card);
        applied++;
      }
      allCards = await getAllFromStore('cards');
      renderPerformanceLabCardPicker();
      if (typeof renderDeckList === 'function') renderDeckList();
      if (button) {
        button.textContent = '一括反映済み';
        button.disabled = true;
        button.classList.remove('bg-amber-600', 'hover:bg-amber-500');
        button.classList.add('bg-emerald-700');
      }
      alert(`${applied}枚のキャラカードの市場価値を、推定価値に更新しました。`);
    } catch (error) {
      console.error('[Performance Lab] Failed to apply batch estimated values:', error);
      try { allCards = await getAllFromStore('cards'); } catch (_) {}
      if (typeof renderDeckList === 'function') renderDeckList();
      if (button) { button.disabled = false; button.textContent = `一括で価値を実際の価値に反映（${items.length}枚）`; }
      alert(`一括反映中に保存エラーが発生しました。${applied}枚は保存済みです。再確認してから残りを反映してください。\n${error?.message || error}`);
    }
  }

  async function applyPerformanceLabValue(cardId, value, button = null) {
    const numericValue = Math.round(Number(value) / 10000) * 10000;
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alert('反映する推定価値が不正です。');
      return;
    }
    const card = (Array.isArray(allCards) ? allCards : []).find(item => String(item.id) === String(cardId));
    if (!card || card.cardType !== 'unit' || card.campaignInstance) {
      alert('作成キャラカードが見つからないため、価値を反映できません。作成カード一覧を開き直して再度検証してください。');
      return;
    }
    const oldValue = Math.max(0, Number(card.value) || 0);
    const promptText = `「${card.name || '名称未設定'}」の実際の市場価値を変更します。

現在の価値：${labFormatYen(oldValue)}
反映する推定価値：${labFormatYen(numericValue)}

カードの価値を上書きしますか？`;
    if (!confirm(promptText)) return;
    if (button) { button.disabled = true; button.textContent = '反映中…'; }
    try {
      card.value = numericValue;
      await saveToStore('cards', card);
      allCards = await getAllFromStore('cards');
      renderPerformanceLabCardPicker();
      if (typeof renderDeckList === 'function') renderDeckList();
      if (button) { button.textContent = '反映済み'; button.disabled = true; button.classList.remove('bg-amber-600', 'hover:bg-amber-500'); button.classList.add('bg-emerald-700'); }
      alert(`「${card.name || '名称未設定'}」の価値を${labFormatYen(numericValue)}に更新しました。`);
    } catch (error) {
      console.error('[Performance Lab] Failed to apply estimated value:', error);
      if (button) { button.disabled = false; button.textContent = '推定価値を実際の価値に反映'; }
      alert(`価値を保存できませんでした。保存データは確認し、再度お試しください。
${error?.message || error}`);
    }
  }

  function cancelPerformanceLab() {
    if (!labRunning) return;
    labCancelRequested = true;
    const button = document.getElementById('performance-lab-cancel');
    if (button) { button.disabled = true; button.textContent = '現在の対戦終了後に中断…'; }
  }

  function rerunPerformanceLab() {
    const report = document.getElementById('performance-lab-report');
    const title = report?.querySelector('h3');
    const picked = labAllUnits().find(card => String(card.name || '') === String(title?.textContent || ''));
    // Names are not unique; prefer a data ID saved on the report. Older report markup is handled by reopening the picker.
    const cardId = report?.dataset?.cardId || picked?.id;
    if (cardId != null) runPerformanceLab(String(cardId));
    else resetPerformanceLabReport();
  }

  // Remember the selected ID only in the currently rendered report (not in storage).
  const labRenderReportOriginal = labRenderReport;
  labRenderReport = function (card, results, summary) {
    labRenderReportOriginal(card, results, summary);
    const report = document.getElementById('performance-lab-report');
    if (report) report.dataset.cardId = String(card.id);
  };

  labOriginalSwitchView = switchView;
  switchView = function (viewId) {
    if (labRunning && viewId !== 'performance-lab') return;
    labOriginalSwitchView.call(this, viewId);
    if (viewId === 'performance-lab' && !labRunning) renderPerformanceLabCardPicker();
  };

  // Expose only the click handlers needed by inline HTML. Test results stay in memory; card value is saved only after explicit confirmation.
  window.performanceLabCanTestCard = function (card) {
    return !!card && labAllUnits().some(template => String(template.id) === String(card.id));
  };
  window.renderPerformanceLabCardPicker = renderPerformanceLabCardPicker;
  window.runPerformanceLab = runPerformanceLab;
  window.runPerformanceLabBatch = runPerformanceLabBatch;
  window.cancelPerformanceLab = cancelPerformanceLab;
  window.resetPerformanceLabReport = resetPerformanceLabReport;
  window.rerunPerformanceLab = rerunPerformanceLab;
  window.applyPerformanceLabValue = applyPerformanceLabValue;
  window.applyPerformanceLabBatchValues = applyPerformanceLabBatchValues;
})();
