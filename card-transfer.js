/* 都道府県カード戦争 v1.0.70 — カード画像込みの端末間移行 */
'use strict';
const CARD_TRANSFER_FORMAT = 'prefecture-card-war-image-transfer';
const CARD_TRANSFER_FORMAT_VERSION = 1;
const CARD_TRANSFER_MAX_FILE_BYTES = 200 * 1024 * 1024;
const CARD_TRANSFER_MAX_CARDS = 5000;
const CARD_TRANSFER_MAX_IMAGE_CHARS = 16 * 1024 * 1024;
const CARD_TRANSFER_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

function cardTransferStatus(message) {
  const node = document.getElementById('card-transfer-status');
  if (node) node.textContent = String(message || '');
}
function cardTransferIsCustom(card) {
  return !!(card && !card.campaignInstance && ['unit','magic'].includes(card.cardType || 'unit') &&
    !String(card.systemKey || '').startsWith('builtin:'));
}
async function cardTransferReady() {
  if (!window.__cardBattleAppReady) await cardBattleAppReadyPromise;
  if (!db || !window.__cardBattleAppReady) throw new Error(window.__cardBattleAppInitError || 'カードの保存先を開けませんでした。');
  if (typeof campaignState !== 'undefined' && campaignState?.turnProcessing) {
    throw new Error('キャンペーンのターン処理中はカードの移行ができません。処理が終了してからお試しください。');
  }
}
function cardTransferSetBusy(busy) {
  for (const id of ['export-card-transfer-btn','import-card-transfer-btn','card-transfer-conflict']) {
    const node = document.getElementById(id);
    if (node) node.disabled = !!busy;
  }
}
function cardTransferReadBlobAsDataUrl(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(reader.error || new Error('画像を読み取れませんでした。'));
    reader.readAsDataURL(blob);
  });
}
function cardTransferValidateImage(image, name) {
  if (typeof image !== 'string' || image.length > CARD_TRANSFER_MAX_IMAGE_CHARS ||
    !CARD_TRANSFER_DATA_IMAGE_RE.test(image)) {
    throw new Error(`「${name}」の画像は転送できるPNG/JPEG/WebP/GIF/AVIFデータではありません。カード画像を設定し直してからお試しください。`);
  }
  return image;
}
async function cardTransferPortableImage(card) {
  const values = [card.image,card.img,card.imageUrl];
  const original = values.find(value => (typeof value === 'string' && value.length > 0) ||
    (typeof Blob !== 'undefined' && value instanceof Blob));
  if (!original) return null;
  const dataUrl = typeof Blob !== 'undefined' && original instanceof Blob
    ? await cardTransferReadBlobAsDataUrl(original) : original;
  return cardTransferValidateImage(dataUrl, String(card.name || '名称未設定'));
}
function cardTransferDownload(json, filename) {
  const url = URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function exportCardsWithImages() {
  cardTransferSetBusy(true);
  cardTransferStatus('画像付きカードを準備しています…');
  try {
    await cardTransferReady();
    const saved = (await getAllFromStore('cards')).filter(cardTransferIsCustom);
    if (!saved.length) { cardTransferStatus('書き出せる自作カードがありません。'); return; }
    if (saved.length > CARD_TRANSFER_MAX_CARDS) throw new Error('カード枚数が多すぎます。');
    const cards = [];
    let imageCount = 0;
    for (const original of saved) {
      // スキル・サブ属性・役割・ランク・価値を含む、IndexedDBのカード原本を保持する。
      const card = {...original, cardType: original.cardType || 'unit'};
      const image = await cardTransferPortableImage(original);
      delete card.img;
      delete card.imageUrl;
      if (image) { card.image = image; imageCount++; }
      else delete card.image;
      cards.push(card);
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const payload = {
      format: CARD_TRANSFER_FORMAT,
      formatVersion: CARD_TRANSFER_FORMAT_VERSION,
      gameVersion: '1.0.70',
      exportedAt: now.toISOString(),
      imagesIncluded: true,
      counts: {
        characterCards: cards.filter(c=>c.cardType==='unit').length,
        magicCards: cards.filter(c=>c.cardType==='magic').length,
        cardsWithImages: imageCount
      },
      scope: 'custom-card-templates-only',
      cards
    };
    const json = JSON.stringify(payload);
    if (new Blob([json]).size > CARD_TRANSFER_MAX_FILE_BYTES) throw new Error('ファイルが200MBを超えます。画像サイズを減らしてください。');
    cardTransferDownload(json,`prefecture-cards-with-images-${stamp}.json`);
    cardTransferStatus(`書き出し完了：キャラ${payload.counts.characterCards}枚、マジック${payload.counts.magicCards}枚（画像あり${imageCount}枚）。ファイルを別端末へ送ってください。`);
  } catch(err) {
    console.error('[CardTransfer] export failed',err);
    cardTransferStatus(`書き出し失敗：${String(err?.message || err)}`);
    alert(`画像付きカードの書き出しに失敗しました。\n${String(err?.message || err)}`);
  } finally { cardTransferSetBusy(false); }
}
function openCardTransferFilePicker() {
  const input = document.getElementById('card-transfer-file');
  if (!input) return;
  input.value = '';
  input.click();
}
function cardTransferValidatePayload(payload) {
  if (payload?.format !== CARD_TRANSFER_FORMAT || payload?.formatVersion !== CARD_TRANSFER_FORMAT_VERSION || !Array.isArray(payload.cards)) {
    if(payload?.format === 'prefecture-card-war-card-data')
      throw new Error('選択したのは検証用JSON（画像なし）です。スマホ側の「画像付きで書き出し」を使ってください。');
    throw new Error('画像付きカード移行ファイルではありません。対応形式のJSONを選んでください。');
  }
  if (!payload.cards.length || payload.cards.length > CARD_TRANSFER_MAX_CARDS) throw new Error('カード枚数が不正です。');
  const ids = new Set();
  const result=[];
  for (const raw of payload.cards) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('カードデータが不正です。');
    if (!cardTransferIsCustom(raw)) throw new Error('標準カードやキャンペーンコピーを含むため取り込めません。');
    if (typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128) throw new Error('カードIDが不正です。');
    if (ids.has(raw.id)) throw new Error('同じIDのカードがファイル内に重複しています。');
    ids.add(raw.id);
    if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 256) throw new Error('カード名が不正です。');
    const card = {...raw,cardType:raw.cardType||'unit'};
    // 永続セーブやイベント情報に結びつくフィールドは移動させない。
    delete card.campaignInstance;
    delete card.templateId;
    delete card.copyException;
    if (card.cardType === 'unit') {
      const stats=card.stats;
      if (!stats || typeof stats !== 'object' ||
        !Number.isFinite(Number(stats.hp)) || Number(stats.hp)<=0 || Number(stats.hp)>1000000 ||
        !Number.isFinite(Number(stats.atk)) || Number(stats.atk)<0 ||
        !Array.isArray(card.skills) || card.skills.length>5) throw new Error(`「${card.name}」のキャラ能力／スキルデータが不正です。`);
    } else if (!card.effect || typeof card.effect !== 'object' || Array.isArray(card.effect)) {
      throw new Error(`「${card.name}」のマジック効果データが不正です。`);
    }
    const image = card.image ?? card.img ?? card.imageUrl;
    if (image != null && image !== '') card.image = cardTransferValidateImage(image,card.name);
    else delete card.image;
    delete card.img;
    delete card.imageUrl;
    result.push(card);
  }
  return result;
}
function cardTransferMakePlan(cards,existingCards,mode) {
  const existing = new Map(existingCards.map(c=>[String(c.id),c]));
  const occupied = new Set(existing.keys());
  const planned=[];
  const stats={newCount:0,duplicateCount:0,replacedCount:0,skippedCount:0};
  for (const source of cards) {
    const previous=existing.get(String(source.id));
    if (previous && mode==='skip') {stats.skippedCount++;continue;}
    if (previous && mode==='replace') {
      if (previous.campaignInstance || String(previous.systemKey||'').startsWith('builtin:') ||
          (previous.cardType||'unit') !== source.cardType) {
        throw new Error(`「${source.name}」は標準カード／別種別の同IDカードと衝突するため、上書きできません。スキップか別カードとして追加を選んでください。`);
      }
      planned.push({...source});stats.replacedCount++;continue;
    }
    const card={...source};
    if (!isUuidCardId(card.id) || occupied.has(card.id)) {
      do { card.id=generateCardId(); } while (occupied.has(card.id));
      stats.duplicateCount++;
    } else stats.newCount++;
    occupied.add(card.id);
    planned.push(card);
  }
  return {planned,stats};
}
function cardTransferWriteBatch(cards) {
  if (!cards.length) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const tx = db.transaction('cards','readwrite');
    const store = tx.objectStore('cards');
    for (const card of cards) store.put(card);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('カード保存に失敗しました。'));
    tx.onabort=()=>reject(tx.error||new Error('カード保存が中断されました。'));
  });
}
async function importCardsWithImages(event) {
  const input = event?.target || document.getElementById('card-transfer-file');
  const file = input?.files?.[0];
  if (!file) return;
  cardTransferSetBusy(true);
  cardTransferStatus('カードファイルを確認しています…');
  let wroteCards = false;
  try {
    await cardTransferReady();
    if (file.size > CARD_TRANSFER_MAX_FILE_BYTES) throw new Error('200MBを超えるファイルは読み込めません。');
    const cards = cardTransferValidatePayload(JSON.parse(await file.text()));
    const mode=document.getElementById('card-transfer-conflict')?.value||'skip';
    if(!['skip','replace','copy'].includes(mode)) throw new Error('重複時の取り込み方法が不正です。');
    const existing = await getAllFromStore('cards');
    const {planned,stats}=cardTransferMakePlan(cards,existing,mode);
    const unitCount=planned.filter(c=>c.cardType==='unit').length;
    const magicCount=planned.filter(c=>c.cardType==='magic').length;
    const imageCount=planned.filter(c=>!!c.image).length;
    const preview=`読み込み元：${file.name}\nファイル内：${cards.length}枚\n\n保存するキャラ：${unitCount}枚\n保存するマジック：${magicCount}枚\nそのうち画像あり：${imageCount}枚\n既存の同IDをスキップ：${stats.skippedCount}枚\n同IDを上書き：${stats.replacedCount}枚\n新IDを振って追加：${stats.duplicateCount}枚\n\nキャンペーンの進行・所持金・デッキは移行されません。\n\nこの内容で保存しますか？`;
    if (!planned.length) {cardTransferStatus('追加対象はありません。同じIDのカードはすべてスキップしました。');return;}
    if (!confirm(preview)) {cardTransferStatus('読み込みをキャンセルしました。カードは変更していません。');return;}
    // 保存直前に競合を再チェック。削除は行わず、書き込みは単一トランザクション。
    await cardTransferReady();
    const latest = await getAllFromStore('cards');
    if (latest.length!==existing.length || latest.some(c=>!existing.some(x=>String(x.id)===String(c.id))))
      throw new Error('確認中にカード一覧が変更されました。もう一度読み込みを行ってください。');
    await cardTransferWriteBatch(planned);
    wroteCards = true;
    allCards=(await getAllFromStore('cards')).map(normalizeBattleCard);
    if (typeof prefAfterTemplateSave === 'function') {
      // 開始済みキャンペーンには新しい★3以上のキャラをガチャ候補として登録する。
      await prefAfterTemplateSave(new Set(),'unit');
    }
    refreshAttributeDatalist();
    renderDeckList();
    cardTransferStatus(`読み込み完了：キャラ${unitCount}枚、マジック${magicCount}枚（画像あり${imageCount}枚）。同IDスキップ${stats.skippedCount}枚。`);
    alert(`画像付きカードの読み込みが完了しました。\nキャラ：${unitCount}枚\nマジック：${magicCount}枚\n画像あり：${imageCount}枚\n\nカード一覧から確認してください。`);
  } catch(err) {
    console.error('[CardTransfer] import failed',err);
    cardTransferStatus(`${wroteCards?'カードの保存は完了しましたが、画面・キャンペーンへの反映でエラーが起きました':'読み込み失敗'}：${String(err?.message||err)}`);
    alert(`${wroteCards?'カードは保存済みです。画面を再読込して確認してください。':'カードの読み込みに失敗しました。'}\n${String(err?.message||err)}\n\n既存カードを削除する処理は行っていません。`);
  } finally { cardTransferSetBusy(false); if(input)input.value=''; }
}
