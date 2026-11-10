'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { eventDurationMinutes, eventEndMs, eventIsFinished, eventCanAcceptBookings } = require('../event-lifecycle');
const ev = {status:'published',date:'2026-11-09',time:'13:00',duration:'2,5 heures'};
test('French and English durations work with hours and minutes',()=>{
  for(const [text,expected] of [['2,5 heures',150],['2.5 hours',150],['2 h 30',150],['2h30',150],['150 minutes',150],['2:30',150],['2 heures',120],['90 min',90],['',120]]) assert.equal(eventDurationMinutes(text),expected,text);
});
test('Ottawa winter timezone uses EST correctly',()=>{
  assert.equal(new Date(eventEndMs(ev)).toISOString(),'2026-11-09T20:30:00.000Z');
  assert.equal(eventCanAcceptBookings(ev,Date.parse('2026-11-09T20:29:59Z')),true);
  assert.equal(eventIsFinished(ev,Date.parse('2026-11-09T20:30:00Z')),true);
});
test('Ottawa summer timezone uses EDT correctly',()=>{
  const summer={...ev,date:'2026-07-10'};
  assert.equal(new Date(eventEndMs(summer)).toISOString(),'2026-07-10T19:30:00.000Z');
});
test('A finished or cancelled event is not bookable, old records remain untouched',()=>{
  assert.equal(eventCanAcceptBookings(ev,Date.parse('2026-11-10T10:00:00Z')),false);
  assert.equal(eventCanAcceptBookings({...ev,status:'cancelled'},Date.parse('2026-11-09T19:00:00Z')),false);
  assert.equal(eventCanAcceptBookings({...ev,status:'draft'},Date.parse('2026-11-09T19:00:00Z')),false);
  assert.equal(eventCanAcceptBookings({...ev,date:'not a date'},Date.parse('2026-11-09T19:00:00Z')),false);
  assert.equal(ev.status,'published');
});
test('the date must be valid and the time within 24 hours',()=>{
 assert.ok(Number.isNaN(eventEndMs({...ev,date:'2026-02-30'})));
 assert.ok(Number.isNaN(eventEndMs({...ev,time:'25:00'})));
});
