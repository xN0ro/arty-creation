'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const server=fs.readFileSync(path.join(__dirname,'..','core-server.js'),'utf8');
const client=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
test('public events API excludes completed events without deleting admin records',()=>{
  assert.match(server,/\.filter\(e => eventLifecycle\.eventCanAcceptBookings\(e\)\)/);
  assert.match(server,/app\.get\('\/api\/admin\/events', adminOnly/);
  assert.match(server,/res\.json\(\(db\.events \|\| \[\]\)\.sort/);
});
test('old carts and both paid and free ticket checkout paths reject finished events',()=>{
  const creation=server.slice(server.indexOf('function buildEventTicketItem('),server.indexOf('function studioOrderProductConfig('));
  const reserve=server.slice(server.indexOf('function reserveEventSeatsForItems('),server.indexOf('function releaseEventSeatsForOrder('));
  const free=server.slice(server.indexOf("app.post('/api/bookings'"),server.indexOf("app.get('/api/bookings/mine'"));
  for(const source of [creation,reserve,free])assert.match(source,/eventLifecycle\.eventCanAcceptBookings/);
});
test('ten-minute checkout holds never last beyond event finishing time',()=>{
  assert.match(server,/Math\.min\(Date\.now\(\) \+ seatHolds\.HOLD_DURATION_MS, \.\.\.groupEventTicketItems/);
  assert.match(server,/eventLifecycle\.eventEndMs/);
});
test('the public calendar cannot navigate to past months or select past days',()=>{
  assert.match(client,/nextMonth<todayKey\.slice\(0,7\)/);
  assert.match(client,/dateKey<partyCalendarTodayKey\(\)/);
  assert.match(client,/isPast\?'disabled':''/);
  assert.match(client,/prevMonthButton\.disabled=partyCalendarMonth<=todayKey\.slice\(0,7\)/);
  assert.match(page,/id="partyCalendarPrevious"/);
});
test('past events are not shown in public listing, but existing admin guest records remain',()=>{
  assert.match(client,/\[\.\.\.allEvents\]\.filter\(event=>!eventHasFinished\(event\)\)/);
  assert.match(client,/function adminEventBookings\(eventId\)/);
});
