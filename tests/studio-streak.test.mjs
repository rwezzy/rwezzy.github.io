import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStreak, mountStreak } from '../js/studio-streak.js';

test('streak starts at 414 on November 15 and changes at New York midnight', () => {
  assert.equal(calculateStreak(new Date('2026-11-15T05:00:00Z')), 414);
  assert.equal(calculateStreak(new Date('2026-11-16T04:59:59Z')), 414);
  assert.equal(calculateStreak(new Date('2026-11-16T05:00:00Z')), 415);
});

test('streak catches up after absent days and does not fall below its anchor', () => {
  assert.equal(calculateStreak(new Date('2026-11-25T17:00:00Z')), 424);
  assert.equal(calculateStreak(new Date('2026-10-01T00:00:00Z')), 414);
});

test('23-hour spring daylight saving day counts as one calendar day', () => {
  assert.equal(calculateStreak(new Date('2027-03-14T05:00:00Z')), 533);
  assert.equal(calculateStreak(new Date('2027-03-15T03:59:59Z')), 533);
  assert.equal(calculateStreak(new Date('2027-03-15T04:00:00Z')), 534);
});

test('25-hour autumn daylight saving day counts as one calendar day', () => {
  assert.equal(calculateStreak(new Date('2027-11-07T04:00:00Z')), 771);
  assert.equal(calculateStreak(new Date('2027-11-08T04:59:59Z')), 771);
  assert.equal(calculateStreak(new Date('2027-11-08T05:00:00Z')), 772);
});

test('leap day is included in the daily counter', () => {
  assert.equal(calculateStreak(new Date('2028-02-29T05:00:00Z')), 885);
  assert.equal(calculateStreak(new Date('2028-03-01T05:00:00Z')), 886);
});

test('mounted counter refreshes on timer and wake events, and cleanup detaches them', () => {
  const win = new EventTarget();
  const doc = new EventTarget();
  let tick, cleared;
  win.setInterval = (callback, delay) => {
    tick = callback;
    assert.equal(delay, 60_000);
    return 7;
  };
  win.clearInterval = id => { cleared = id; };
  doc.defaultView = win;
  doc.hidden = false;
  const element = { ownerDocument: doc, textContent: 'stale' };
  const cleanup = mountStreak(element);
  const expected = String(calculateStreak());
  assert.equal(element.textContent, expected);
  for (const wake of [tick, () => win.dispatchEvent(new Event('focus')), () => doc.dispatchEvent(new Event('visibilitychange'))]) {
    element.textContent = 'stale';
    wake();
    assert.equal(element.textContent, expected);
  }
  cleanup();
  assert.equal(cleared, 7);
  element.textContent = 'detached';
  win.dispatchEvent(new Event('focus'));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(element.textContent, 'detached');
});
