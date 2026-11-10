'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const start=source.indexOf('function parseCalendarDate(');
const end=source.indexOf('function partyCalendarArrow(',start);
assert.ok(start>=0&&end>start,'calendar navigation functions exist');

function calendarHarness() {
  // Run the real public calendar navigation functions with a render that
  // rechecks state, as renderPartyCalendar does on the live website.
  const run=new Function(`
    let partyCalendarMonth='',partyCalendarSelectedDate='',allEvents=[];
    const eventHasFinished=()=>false;
    let renders=0;
    function renderPartyCalendar(){renders++;ensurePartyCalendarState()}
    ${source.slice(start,end)}
    return {todayKey:partyCalendarTodayKey,ensurePartyCalendarState,changePartyCalendarMonth,showCurrentPartyCalendarMonth,selectPartyCalendarDate,get state(){return {month:partyCalendarMonth,date:partyCalendarSelectedDate,renders}},addEvent(event){allEvents.push(event)}};
  `);
  return run();
}
test('the next-month arrow navigates forward and survives the rerender',()=>{
  const c=calendarHarness();
  const current=c.todayKey().slice(0,7);
  c.showCurrentPartyCalendarMonth();
  const expected=new Date(Number(current.slice(0,4)),Number(current.slice(5,7)),1);
  const expectedKey=String(expected.getFullYear())+'-'+String(expected.getMonth()+1).padStart(2,'0');
  c.changePartyCalendarMonth(1);
  assert.equal(c.state.month,expectedKey);
  c.ensurePartyCalendarState();
  assert.equal(c.state.month,expectedKey,'render must not jump back to current month');
  assert.ok(c.state.renders>0);
});
test('multiple forward clicks and month-year rollover work',()=>{
  const c=calendarHarness();
  c.showCurrentPartyCalendarMonth();
  c.changePartyCalendarMonth(1);
  c.changePartyCalendarMonth(1);
  c.changePartyCalendarMonth(1);
  const start=new Date(Number(c.todayKey().slice(0,4)),Number(c.todayKey().slice(5,7))-1+3,1);
  assert.equal(c.state.month,String(start.getFullYear())+'-'+String(start.getMonth()+1).padStart(2,'0'));
});
test('previous-month arrow still cannot go earlier than this month',()=>{
  const c=calendarHarness();
  const today=c.todayKey();
  c.showCurrentPartyCalendarMonth();
  c.changePartyCalendarMonth(-1);
  assert.equal(c.state.month,today.slice(0,7));
  c.changePartyCalendarMonth(1);
  c.changePartyCalendarMonth(-1);
  assert.equal(c.state.month,today.slice(0,7));
});
test('past dates remain nonselectable and current month is still accessible',()=>{
  const c=calendarHarness();
  c.showCurrentPartyCalendarMonth();
  const initial=c.state;
  c.selectPartyCalendarDate('2020-01-01');
  assert.equal(c.state.month,initial.month);
  assert.equal(c.state.date,initial.date);
  c.changePartyCalendarMonth(1);
  c.showCurrentPartyCalendarMonth();
  assert.equal(c.state.date,c.todayKey());
});
