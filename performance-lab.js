/*
 * 都道府県カード戦争 v1.0.19 - カード性能検証ラボ
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

  const LAB_TOTAL_PER_TIER = 30;
  const LAB_TIERS = [
    { key: 'weak', label: '弱い相手', short: '弱い', weight: 0.15 },
    { key: 'standard', label: '標準の相手', short: '標準', weight: 0.55 },
    { key: 'strong', label: '強い相手', short: '強い', weight: 0.30 }
  ];
  const LAB_VALUE_RANGES = {
    3: { min: 1_000_000, max: 30_000_000 },
    4: { min: 30_000_000, max: 150_000_000 },
    5: { min: 150_000_000, max: 500_000_000 }
  };

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
    // Do not accumulate a huge battle-log DOM tree during 90 automated fights.
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
    // Campaign instances are runtime copies of an authored template (owned, listed, gacha, etc.).
    // The lab picker must show each created/authored card only once, never those campaign copies.
    return labUniqueCards((allCards || []).filter(card => !card.campaignInstance && (card.cardType || 'unit') === 'unit'));
  }

  function labAllMagics() {
    // Use authored magic templates only so campaign copies do not bias the shared candidate pool.
    return labUniqueCards((allCards || []).filter(card => !card.campaignInstance && card.cardType === 'magic'));
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

  function labRotate(items, startIndex) {
    if (!items.length) return [];
    const start = ((Math.floor(startIndex) % items.length) + items.length) % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
  }

  function labTierPool(sameRankCards, level) {
    const sorted = [...sameRankCards].sort(labComparator);
    if (sorted.length <= 1) return sorted;
    // With a small library, keep weak/strong pools distinct where possible instead of silently using the same pool.
    if (sorted.length === 2) {
      if (level === 'weak') return sorted.slice(0, 1);
      if (level === 'strong') return sorted.slice(1);
      return sorted;
    }
    if (sorted.length === 3) {
      if (level === 'weak') return sorted.slice(0, 2);
      if (level === 'strong') return sorted.slice(1);
      return sorted;
    }
    if (level === 'weak') return sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.55)));
    if (level === 'strong') return sorted.slice(Math.min(sorted.length - 1, Math.floor(sorted.length * 0.45)));
    const lo = Math.floor(sorted.length * 0.15);
    const hi = Math.max(lo + 1, Math.ceil(sorted.length * 0.85));
    return sorted.slice(lo, hi);
  }

  function labAddAllowed(team, card, targetStars) {
    if (!card || team.some(existing => String(existing.id) === String(card.id))) return false;
    const star5Count = team.filter(existing => labStars(existing) === 5).length;
    if (labStars(card) === 5 && star5Count >= 1) return false;
    return team.length < 5;
  }

  function labFillRoster(team, allUnits, preferred, targetStars, iteration) {
    const preferredOrdered = labRotate([...preferred], iteration).concat(allUnits.filter(c => !preferred.some(p => String(p.id) === String(c.id))));
    for (const card of preferredOrdered) {
      if (team.length >= 5) break;
      if (labAddAllowed(team, card, targetStars)) team.push(card);
    }
    return team;
  }

  function labBuildPlayerRoster(targetCard, allUnits, iteration) {
    const targetStars = labStars(targetCard);
    const team = [targetCard];
    const otherSameRank = allUnits.filter(card => String(card.id) !== String(targetCard.id) && labStars(card) === targetStars).sort(labComparator);
    // Fill from same-rank registered cards first, rotating the order to avoid relying on one fixed partner.
    const balancedSameRank = labRotate(otherSameRank, iteration * 2);
    labFillRoster(team, allUnits, balancedSameRank, targetStars, iteration);
    if (team.length < 3) {
      throw new Error(`検証対象が★${targetStars}のため、★5は1チーム1枚までの制限を守ると出撃3体を編成できません。カード作成一覧に、編成できる別のキャラカードをあと${3 - team.length}枚以上登録してください。`);
    }
    return team;
  }

  function labBuildEnemyRoster(targetCard, allUnits, level, iteration) {
    const targetStars = labStars(targetCard);
    const targetId = String(targetCard.id);
    const sameRank = allUnits.filter(card => labStars(card) === targetStars).sort(labComparator);
    const opponents = sameRank.filter(card => String(card.id) !== targetId);
    if (!opponents.length) {
      throw new Error(`★${targetStars}の検証には、評価対象とは別の★${targetStars}キャラカードが最低1枚必要です。同じカードのコピーを対戦相手として水増しせず、作成カード一覧へ同ランクのカードを登録してください。`);
    }
    const tierCandidates = labRotate(labTierPool(opponents, level), iteration);
    const team = [];
    const addCandidates = candidates => {
      for (const card of candidates) {
        if (team.length >= 5) break;
        if (String(card.id) === targetId) continue;
        if (labAddAllowed(team, card, targetStars)) team.push(card);
      }
    };
    // First allocate the chosen strength tier; these slots are first in the deck and therefore fielded.
    addCandidates(tierCandidates);
    // If the tier subset is too small for a full roster, use other registered cards of the same rank before any other rank.
    addCandidates(labRotate(opponents.filter(card => !tierCandidates.some(chosen => String(chosen.id) === String(card.id))), iteration + 1));
    // ★5's one-card roster cap makes lower-rank fillers necessary; never create synthetic cards or mirror the selected target.
    const fillers = allUnits.filter(card => String(card.id) !== targetId && !team.some(chosen => String(chosen.id) === String(card.id)))
      .sort((a, b) => Math.abs(labStars(a) - targetStars) - Math.abs(labStars(b) - targetStars) || (level === 'strong' ? labComparator(b, a) : level === 'weak' ? labComparator(a, b) : labComparator(a, b)));
    addCandidates(fillers);
    if (team.length < 3) {
      throw new Error(`登録済みカードと★5制限の条件では「${level === 'weak' ? '弱い' : level === 'standard' ? '標準' : '強い'}相手」の出撃3体を編成できません。架空カードは使用しません。登録済みの別キャラカードを追加してください。`);
    }
    return team.slice(0, 5);
  }

  function labChooseMagicPool() {
    const all = labAllMagics().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
    if (all.length <= 10) return all;
    // A stable, evenly-spaced sample from the registered library; the exact same ten cards go to both teams.
    const chosen = [];
    for (let i = 0; i < 10; i++) chosen.push(all[Math.round(i * (all.length - 1) / 9)]);
    return labUniqueCards(chosen);
  }

  function labFreshMetrics(targetCardId) {
    const side = () => ({ damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, shieldAbsorbed: 0, supportEffects: 0, controlEffects: 0, actions: 0, activeSkills: 0, magicUses: 0, hpReductionEffects: 0 });
    return {
      targetCardId: String(targetCardId),
      sides: { player: side(), enemy: side() },
      target: { actions: 0, activeSkills: 0, damageDealt: 0, damageTaken: 0, kills: 0, healing: 0, shieldGranted: 0, supportEffects: 0, controlEffects: 0, utilityEffects: 0, hpReductionEffects: 0 },
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
    if (/失敗|不発|効果を受けない|対象なし|条件未達/.test(resultText)) return;

    const sourceSide = source?.side || 'player';
    const targetSide = target?.side || (target?.__playerTarget ? (target.__playerTarget === 'opp' ? (sourceSide === 'player' ? 'enemy' : 'player') : sourceSide) : null);
    const isHeal = type === 'heal_fixed' || type === 'heal_max_hp_ratio';
    const isShield = type === 'shield';
    const isFriendly = targetSide === sourceSide;
    const controlTypes = new Set(['status_apply', 'skill_block', 'heal_block', 'damage_taken_ratio', 'mod_atk_ratio', 'mod_atk_val', 'mod_speed', 'clear_buffs', 'clear_random_buffs']);
    const isControl = !isFriendly && controlTypes.has(type);
    const isSupport = isFriendly && (isHeal || isShield || !/^dmg_/.test(type));

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

  const labOriginalExecuteUnitAction = executeUnitAction;
  executeUnitAction = async function (unit, ...args) {
    if (!labCurrentMatch) return labOriginalExecuteUnitAction.call(this, unit, ...args);
    const action = unit?.reservedAction || {};
    const side = unit?.side;
    const targetIsCard = side === 'player' && String(unit?.cardId) === labCurrentMatch.targetCardId;
    if (side && labCurrentMatch.sides[side]) labCurrentMatch.sides[side].actions++;
    if (targetIsCard) {
      labCurrentMatch.target.actions++;
      if (action.type === 'skill') labCurrentMatch.target.activeSkills++;
    }
    if (side && labCurrentMatch.sides[side] && action.type === 'skill') labCurrentMatch.sides[side].activeSkills++;
    const previousActor = labActiveActor;
    const previousSource = labActiveSource;
    labActiveActor = unit;
    labActiveSource = unit;
    try {
      return await labOriginalExecuteUnitAction.call(this, unit, ...args);
    } finally {
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

  function labSetProgress(done, levelKey, selectedCard) {
    const pct = Math.round(done / 90 * 100);
    const bar = document.getElementById('performance-lab-progress-bar');
    const count = document.getElementById('performance-lab-progress-count');
    const percent = document.getElementById('performance-lab-progress-percent');
    const title = document.getElementById('performance-lab-progress-title');
    const description = document.getElementById('performance-lab-progress-description');
    if (bar) bar.style.width = `${pct}%`;
    if (count) count.textContent = `${done} / 90 戦`;
    if (percent) percent.textContent = `${pct}%`;
    if (title) title.textContent = `${selectedCard.name || '選択カード'} を検証中…`;
    const tier = LAB_TIERS.find(item => item.key === levelKey);
    if (description) description.textContent = `${tier?.label || '対戦'}：30戦のうち${done % 30 || (done && done % 30 === 0 ? 30 : 0)}戦目まで完了。双方ともAI思考は最高ランクです。`;
    const el = document.getElementById('performance-lab-tier-progress');
    if (el) {
      el.innerHTML = LAB_TIERS.map(item => {
        const active = item.key === levelKey;
        const finishedCount = item.key === 'weak' ? Math.min(30, done) : item.key === 'standard' ? Math.max(0, Math.min(30, done - 30)) : Math.max(0, Math.min(30, done - 60));
        return `<div class="rounded-lg border ${active ? 'border-violet-400 bg-violet-950/50' : 'border-slate-700 bg-slate-950'} p-2"><div class="text-[10px] font-black ${active ? 'text-violet-200' : 'text-slate-400'}">${item.label}</div><div class="text-sm font-black text-white mt-1">${finishedCount} / 30</div></div>`;
      }).join('');
    }
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
    const magicIds = magicPool.map(card => card.id);
    const match = labFreshMetrics(targetCard.id);
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
        playerDeck: { id: `lab_player_${Date.now()}_${iteration}`, name: '検証チーム', unitIds: playerIds, magicIds },
        enemyDeck: { id: `lab_enemy_${Date.now()}_${iteration}`, name: '比較チーム', unitIds: enemyIds, magicIds },
        playerActive: playerIds.slice(0, 3),
        playerReserve: playerIds.slice(3, 5),
        enemyActive: enemyIds.slice(0, 3),
        enemyReserve: enemyIds.slice(3, 5),
        playerName: '検証チーム',
        enemyName: `${level === 'weak' ? '弱い' : level === 'standard' ? '標準' : '強い'}相手AI`,
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
        opponentRosterKey: match.opponentRosterKey
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
    const tierSummary = {};
    for (const tier of LAB_TIERS) {
      const rows = results.filter(row => row.level === tier.key);
      const wins = rows.filter(row => row.winner === 'player').length;
      const draws = rows.filter(row => row.winner === 'draw').length;
      const losses = rows.filter(row => row.winner === 'enemy').length;
      tierSummary[tier.key] = { total: rows.length, wins, draws, losses, rate: rows.length ? (wins + draws * 0.5) / rows.length : 0 };
    }
    const count = results.length || 1;
    const wins = results.filter(row => row.winner === 'player').length;
    const draws = results.filter(row => row.winner === 'draw').length;
    const losses = results.filter(row => row.winner === 'enemy').length;
    const weightedWin = LAB_TIERS.reduce((sum, tier) => sum + (tierSummary[tier.key].rate || 0) * tier.weight, 0);
    const standardRate = tierSummary.standard.rate || 0;
    const totalTarget = labNewTotals();
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
    const rates = LAB_TIERS.map(tier => tierSummary[tier.key].rate || 0);
    const spread = Math.max(...rates) - Math.min(...rates);
    const stabilityScore = labClamp(1 - spread * 0.55, 0.35, 1);
    const absoluteScore = labClamp(weightedWin * 65 + activityScore * 20 + survivalRate * 10 + stabilityScore * 5, 0, 100);
    // Relative component is observed performance against registered same-star rosters in the standard tier.
    const relativeScore = labClamp(standardRate * 100, 0, 100);
    const combinedScore = labClamp(absoluteScore * 0.70 + relativeScore * 0.30, 0, 100);
    const stars = labStars(targetCard);
    const range = LAB_VALUE_RANGES[stars] || null;
    const value = range ? Math.round((range.min + (range.max - range.min) * combinedScore / 100) / 10_000) * 10_000 : null;
    const confidence = sameRankCount >= 8 && uniqueEnemyRosters >= 12 ? '比較的高い' : sameRankCount >= 4 && uniqueEnemyRosters >= 4 ? '標準' : '限定的';
    const confidenceFactor = confidence === '比較的高い' ? 0.06 : confidence === '標準' ? 0.12 : 0.22;
    const margin = range ? Math.round((range.max - range.min) * confidenceFactor / 10_000) * 10_000 : null;
    const interval = range && value != null ? { min: Math.max(range.min, value - margin), max: Math.min(range.max, value + margin) } : null;
    return {
      stars, tierSummary, wins, draws, losses, weightedWin, standardRate, totalTarget, totalPlayer, totalEnemy,
      survivalRate, averageHpRatio: targetHpRatio / count, averageTurns: turnTotal / count,
      damageShare, offenseScore: offenseScore * 100, supportScore: supportScore * 100, activityScore: activityScore * 100,
      stabilityScore: stabilityScore * 100, absoluteScore, relativeScore, combinedScore, range, value, interval,
      confidence, count, uniqueEnemyRosters, sameRankCount
    };
  }

  function labBuildEvaluationText(card, summary) {
    const strengths = [];
    const weaknesses = [];
    const weakRate = summary.tierSummary.weak.rate;
    const standardRate = summary.tierSummary.standard.rate;
    const strongRate = summary.tierSummary.strong.rate;
    const damageShare = summary.damageShare;
    const survive = summary.survivalRate;
    const supportEach = (summary.totalTarget.supportEffects + summary.totalTarget.controlEffects) / Math.max(1, summary.count);
    if (standardRate >= 0.65) strengths.push(`標準相手への勝ち点率は${labPercent(standardRate)}。同ランク帯の編成に対して、チームの勝ち筋を作りやすい結果です。`);
    else if (standardRate >= 0.5) strengths.push(`標準相手への勝ち点率は${labPercent(standardRate)}。同ランク帯では平均的〜やや優位な結果です。`);
    if (damageShare >= 0.30) strengths.push(`チーム総ダメージの約${(damageShare * 100).toFixed(1)}%を担当しており、主力アタッカーとしての貢献が見られます。`);
    if (supportEach >= 1.25 || summary.totalTarget.healing / Math.max(1, summary.count) >= 500 || summary.totalTarget.shieldGranted / Math.max(1, summary.count) >= 600) strengths.push('回復・盾・バフ・妨害などの支援効果が実戦で発生しており、味方への貢献が見られます。');
    if (survive >= 0.72) strengths.push(`90戦中の生存率は${labPercent(survive)}。複数ターンにわたり性能を発揮しやすい傾向です。`);
    if (strongRate >= 0.5) strengths.push(`強い相手にも勝ち点率${labPercent(strongRate)}を記録し、上位編成への対応力があります。`);
    if (!strengths.length) strengths.push('現時点では突出した長所を特定できません。対戦ログ上の発動スキルと支援実績も合わせて確認してください。');

    if (standardRate < 0.4) weaknesses.push(`標準相手への勝ち点率は${labPercent(standardRate)}で、同ランク帯の編成に対して苦戦しています。`);
    if (strongRate < 0.25) weaknesses.push(`強い相手への勝ち点率は${labPercent(strongRate)}。強い編成に対する対策や味方との組み合わせが課題です。`);
    if (survive < 0.42) weaknesses.push(`生存率は${labPercent(survive)}と低めです。耐久支援、挑発、盾、行動阻害対策などで守る余地があります。`);
    if (damageShare < 0.10 && supportEach < 0.5 && summary.totalTarget.healing / Math.max(1, summary.count) < 150) weaknesses.push('本人の直接ダメージと観測できた支援効果がどちらも少なく、役割を発揮できていない可能性があります。');
    if (weakRate >= 0.75 && strongRate < 0.35) weaknesses.push('弱い相手には強い一方、対戦相手の強さが上がると勝ち点率が大きく低下しています。');
    if (summary.sameRankCount < 4) weaknesses.push('登録済みの同ランク帯カードが少ないため、相対評価の比較母数が限られています。');
    if (!weaknesses.length) weaknesses.push('今回の検証では明確な致命的弱点は検出されませんでした。ただし、90戦の結果だけで全ての相性を網羅できるわけではありません。');

    return { strengths: strengths.slice(0, 4), weaknesses: weaknesses.slice(0, 4) };
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
      : `<div class="text-3xl sm:text-4xl font-black text-amber-200">${labFormatYen(summary.value)}</div><div class="text-xs sm:text-sm text-slate-300 mt-2">参考範囲：${labFormatYen(summary.interval.min)}〜${labFormatYen(summary.interval.max)}</div>`;
    const tierCards = LAB_TIERS.map(tier => {
      const t = summary.tierSummary[tier.key];
      const width = Math.round(t.rate * 100);
      return `<div class="rounded-xl border border-slate-700 bg-slate-950 p-3"><div class="flex items-center justify-between gap-2"><div class="text-xs font-black text-white">${tier.label}</div><div class="text-sm font-black text-cyan-200">${labPercent(t.rate)}</div></div><div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2"><div class="h-full bg-gradient-to-r from-violet-600 to-cyan-400" style="width:${width}%"></div></div><div class="grid grid-cols-3 gap-1 mt-2 text-[10px] text-slate-400"><span>勝 ${t.wins}</span><span>分 ${t.draws}</span><span>敗 ${t.losses}</span></div></div>`;
    }).join('');
    report.innerHTML = `
      <section class="rounded-2xl border border-violet-500/50 bg-gradient-to-br from-slate-900 via-slate-950 to-violet-950 p-4 sm:p-6 shadow-xl">
        <div class="flex flex-wrap items-center gap-4">${imgHtml}<div class="min-w-0 flex-1"><div class="text-[10px] tracking-widest font-black text-violet-300">性能検証レポート</div><h3 class="text-xl sm:text-2xl font-black text-white mt-1">${labEsc(card.name || '名称未設定')}</h3><div class="text-amber-300 font-black mt-1">${'★'.repeat(summary.stars)}${'☆'.repeat(5 - summary.stars)}</div><div class="text-xs text-slate-400 mt-2">実戦エンジンによる${summary.count}戦の集計／検証結果は一時表示のみ</div></div></div>
        <div class="mt-5 rounded-xl border border-amber-500/30 bg-black/30 p-4"><div class="text-[10px] font-black text-amber-300">推定カード価値</div><div class="mt-1">${valueHtml}</div><div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">${labMetricCard('総合評価スコア', `${summary.combinedScore.toFixed(1)} / 100`, '絶対評価＋同ランク対戦実績')}${labMetricCard('標準相手の勝ち点率', labPercent(summary.standardRate), '勝利1点・引き分け0.5点')}${labMetricCard('生存率', labPercent(summary.survivalRate), `${summary.wins}勝 ${summary.draws}分 ${summary.losses}敗（全90戦）`)}${labMetricCard('評価の信頼度', summary.confidence, `${summary.uniqueEnemyRosters}種類の相手編成／同ランク登録${summary.sameRankCount}枚`)}</div></div>
      </section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-base font-black text-cyan-200 mb-3">対戦相手の強さ別成績</h4><div class="grid grid-cols-1 md:grid-cols-3 gap-3">${tierCards}</div><div class="text-[10px] text-slate-500 mt-3">弱い・標準・強い相手を各30戦。双方とも戦闘AIの思考ランクは最高設定です。</div></section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-base font-black text-cyan-200 mb-3">本人の実戦貢献</h4><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${labMetricCard('本人の与ダメージ', labFormatNumber(summary.totalTarget.damageDealt), `チーム総ダメージの${(summary.damageShare * 100).toFixed(1)}%`)}${labMetricCard('撃破数', labFormatNumber(summary.totalTarget.kills), '本人が関与した撃破')}${labMetricCard('スキル行動', labFormatNumber(summary.totalTarget.activeSkills), `通常行動を含む行動 ${labFormatNumber(summary.totalTarget.actions)}回`)}${labMetricCard('受けたダメージ', labFormatNumber(summary.totalTarget.damageTaken), `平均生存HP ${labPercent(summary.averageHpRatio)}`)}${labMetricCard('本人の回復量', labFormatNumber(summary.totalTarget.healing), '本人が発動した効果による実回復')}${labMetricCard('付与シールド量', labFormatNumber(summary.totalTarget.shieldGranted), '本人が実際に付与した量')}${labMetricCard('支援効果', labFormatNumber(summary.totalTarget.supportEffects), '味方への回復・強化など')}${labMetricCard('妨害効果', labFormatNumber(summary.totalTarget.controlEffects), '敵への状態異常・弱体など')}</div><p class="text-[10px] text-slate-500 mt-3">ダメージ・回復・シールドは戦闘中に実際に処理された数値です。支援／妨害回数は効果処理の観測数であり、全てが勝敗を決めたことを意味するものではありません。</p></section>
      <section class="grid grid-cols-1 md:grid-cols-2 gap-3"><div class="rounded-xl border border-emerald-800/60 bg-slate-900 p-4"><h4 class="text-base font-black text-emerald-300 mb-3">強いところ</h4><ul class="space-y-2">${copy.strengths.map(text => `<li class="text-sm leading-relaxed text-slate-200 flex gap-2"><span class="text-emerald-300">＋</span><span>${labEsc(text)}</span></li>`).join('')}</ul></div><div class="rounded-xl border border-rose-800/60 bg-slate-900 p-4"><h4 class="text-base font-black text-rose-300 mb-3">弱いところ・注意点</h4><ul class="space-y-2">${copy.weaknesses.map(text => `<li class="text-sm leading-relaxed text-slate-200 flex gap-2"><span class="text-rose-300">−</span><span>${labEsc(text)}</span></li>`).join('')}</ul></div></section>
      <section class="rounded-xl border border-slate-800 bg-slate-900 p-4"><h4 class="text-sm font-black text-slate-200">評価の読み方</h4><p class="text-xs leading-relaxed text-slate-400 mt-2">絶対評価は弱い・標準・強い相手への戦績、本人の貢献、生存率を組み合わせています。相対評価は登録済みの同ランクカードで構成した相手への実測成績です。相手のカード種類が少ないときや同ランク登録数が少ないときは、信頼度を下げて表示します。マジックは各試合で両チームに同一の候補プールを渡し、キャラ以外の条件が片側だけ有利にならないようにしています。</p></section>
      <div class="flex flex-wrap gap-2"><button type="button" onclick="rerunPerformanceLab()" class="px-4 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-black">同じカードを再検証</button><button type="button" onclick="resetPerformanceLabReport()" class="px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold">別のカードを選ぶ</button></div>`;
    report.classList.remove('hidden');
    progress?.classList.add('hidden');
  }

  function labRenderInterrupted(done, card) {
    const report = document.getElementById('performance-lab-report');
    const progress = document.getElementById('performance-lab-progress-panel');
    if (!report) return;
    report.innerHTML = `<section class="rounded-xl border border-amber-500/40 bg-slate-900 p-4 sm:p-6"><h3 class="text-xl font-black text-amber-200">検証を中断しました</h3><p class="text-sm text-slate-300 mt-2">${labEsc(card?.name || '選択カード')}：${done} / 90 戦まで完了しました。中断したため、推定価値と総合評価は算出していません。</p><button type="button" onclick="resetPerformanceLabReport()" class="mt-4 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold">別のカードを選ぶ</button></section>`;
    report.classList.remove('hidden');
    progress?.classList.add('hidden');
  }

  function renderPerformanceLabCardPicker() {
    const list = document.getElementById('performance-lab-card-list');
    const countEl = document.getElementById('performance-lab-card-count');
    if (!list) return;
    const query = String(document.getElementById('performance-lab-search')?.value || '').trim().toLocaleLowerCase('ja');
    const units = labAllUnits().filter(card => !query || String(card.name || '').toLocaleLowerCase('ja').includes(query)).sort((a, b) => labStars(b) - labStars(a) || String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
    if (countEl) countEl.textContent = `${units.length} 枚`;
    list.innerHTML = '';
    if (!units.length) {
      list.innerHTML = `<div class="col-span-full rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-400">キャラカードがありません。カード作成画面でキャラカードを登録してください。</div>`;
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

  function resetPerformanceLabReport() {
    labCancelRequested = false;
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
    const targetCard = labAllUnits().find(card => String(card.id) === String(cardId));
    if (!targetCard) {
      alert('検証対象のキャラカードが見つかりません。作成カード一覧を開き直してください。');
      return;
    }
    const allUnits = labAllUnits();
    if (allUnits.length < 3) {
      alert('検証には登録済みのキャラカードが最低3枚必要です。カード作成一覧にキャラカードを登録してください。');
      return;
    }
    const targetStars = labStars(targetCard);
    const sameRankCount = allUnits.filter(card => labStars(card) === targetStars).length;
    if (sameRankCount < 2) {
      alert(`★${targetStars}の検証には、選択したカードとは別の★${targetStars}キャラカードが必要です。作成カード一覧に同ランクのカードをもう1枚以上登録してください。`);
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

    const magicPool = labChooseMagicPool();
    const results = [];
    const uniqueRosters = new Set();
    let done = 0;
    try {
      // Preflight each roster category before starting a 90-battle run.
      for (const tier of LAB_TIERS) {
        labBuildPlayerRoster(targetCard, allUnits, 0);
        labBuildEnemyRoster(targetCard, allUnits, tier.key, 0);
      }
      labSetProgress(done, 'weak', targetCard);
      await labYieldToBrowser();
      for (const tier of LAB_TIERS) {
        for (let i = 0; i < LAB_TOTAL_PER_TIER; i++) {
          if (labCancelRequested) {
            labRenderInterrupted(done, targetCard);
            return;
          }
          const iteration = (tier.key === 'weak' ? 0 : tier.key === 'standard' ? 30 : 60) + i;
          const playerRoster = labBuildPlayerRoster(targetCard, allUnits, iteration);
          const enemyRoster = labBuildEnemyRoster(targetCard, allUnits, tier.key, i);
          const row = await labPlayBattle(targetCard, tier.key, i, playerRoster, enemyRoster, magicPool);
          results.push(row);
          uniqueRosters.add(row.opponentRosterKey);
          done++;
          labSetProgress(done, tier.key, targetCard);
          await labYieldToBrowser();
        }
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

  // Expose only the click handlers needed by inline HTML. Nothing is written to the database.
  window.renderPerformanceLabCardPicker = renderPerformanceLabCardPicker;
  window.runPerformanceLab = runPerformanceLab;
  window.cancelPerformanceLab = cancelPerformanceLab;
  window.resetPerformanceLabReport = resetPerformanceLabReport;
  window.rerunPerformanceLab = rerunPerformanceLab;
})();
