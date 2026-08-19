// 标签翻译模块测试: 种子词典 + 检测逻辑(不依赖外网)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsTranslation, lookupTranslation, translateBatch, needsJapanese, tagCandidatesFor } from '../src/translate.js';

test('needsTranslation: only kana text', () => {
  assert.equal(needsTranslation('ピンクパイナップル'), true);
  assert.equal(needsTranslation('あまがえる'), true);
  assert.equal(needsTranslation('纯爱'), false);
  assert.equal(needsTranslation('3D'), false);
  assert.equal(needsTranslation('NTR'), false);
  assert.equal(needsTranslation('loli'), false);
});

test('lookupTranslation: seed dictionary hits', () => {
  assert.equal(lookupTranslation('ピンクパイナップル'), '粉红菠萝');
  assert.equal(lookupTranslation('メツブシ'), '梅茨布希');
  assert.equal(lookupTranslation('幽閉サテライト'), '幽闭卫星');
  assert.equal(lookupTranslation('nur（ニュル）'), 'nur（纽鲁）');
  assert.equal(lookupTranslation('纯爱'), '纯爱'); // 无假名 → 原样
});

test('translateBatch: dictionary + passthrough without network dependency', async () => {
  const map = await translateBatch(['ピンクパイナップル', '纯爱', '3D', 'あまがえる', 'fate']);
  assert.equal(map['ピンクパイナップル'], '粉红菠萝');
  assert.equal(map['あまがえる'], '雨蛙');
  assert.equal(map['纯爱'], '纯爱');
  assert.equal(map['3D'], '3D');
  assert.equal(map['fate'], 'fate');
});

test('needsJapanese: chinese terms only', () => {
  assert.equal(needsJapanese('粉红菠萝'), true);
  assert.equal(needsJapanese('壁纸'), true);
  assert.equal(needsJapanese('ピンクパイナップル'), false); // 已是日文
  assert.equal(needsJapanese('fate'), false);
  assert.equal(needsJapanese('NTR'), false);
});

test('tagCandidatesFor: reverse dictionary lookup', () => {
  const cands = tagCandidatesFor('粉红菠萝');
  assert.ok(cands.includes('ピンクパイナップル'), 'seed value reverse lookup');
  const cands2 = tagCandidatesFor('幽闭卫星');
  assert.ok(cands2.includes('幽閉サテライト'), 'seed value reverse lookup 2');
});
