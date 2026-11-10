'use strict';

// All ARTY event dates and times are stored as local venue wall-clock values.
// Most public events take place in Ottawa/Gatineau. Support an explicit IANA
// timezone when an event is hosted elsewhere, without depending on server TZ.
const DEFAULT_TIME_ZONE = 'America/Toronto';
const MINUTES_IN_HOUR = 60;
const DEFAULT_DURATION_MINUTES = 120;

function eventDurationMinutes(input) {
  const raw = String(input || '').trim().toLowerCase().replace(/,/g, '.');
  if (!raw) return DEFAULT_DURATION_MINUTES;
  let hours = 0, minutes = 0;
  const clock = raw.match(/^(\d{1,3}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const h = raw.match(/(\d+(?:\.\d+)?)\s*(?:heures?|hours?|hrs?|h)/);
  if (h) {
    hours = Number(h[1]);
    const suffix = raw.slice(h.index + h[0].length);
    const m = suffix.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)?/);
    if (m) minutes = Number(m[1]);
  } else {
    const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/);
    if (m) minutes = Number(m[1]);
    else if (/^\d+(?:\.\d+)?$/.test(raw)) hours = Number(raw);
    else return DEFAULT_DURATION_MINUTES;
  }
  const total = Math.round(hours * MINUTES_IN_HOUR + minutes);
  return Number.isFinite(total) && total > 0 && total < 1440 ? total : DEFAULT_DURATION_MINUTES;
}

function dateTimeParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(value));
  const out = {};
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value);
  return out;
}

function eventEndMs(event) {
  const dateMatch = String(event?.date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(event?.time || '18:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return NaN;
  const [year, month, day] = dateMatch.slice(1).map(Number);
  const hour = Number(timeMatch[1]), minute = Number(timeMatch[2]);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  if (hour > 23 || minute > 59 || !Number.isFinite(wallTime)) return NaN;
  const check = new Date(wallTime);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
  let timeZone = String(event?.timeZone || DEFAULT_TIME_ZONE);
  try { new Intl.DateTimeFormat('en-US',{timeZone}).format(new Date(wallTime)); }
  catch { timeZone = DEFAULT_TIME_ZONE; }
  let result = wallTime;
  for (let i = 0; i < 4; i++) {
    const actual = dateTimeParts(result,timeZone);
    const actualWall = Date.UTC(actual.year,actual.month-1,actual.day,actual.hour,actual.minute);
    const shift = wallTime - actualWall;
    if (!shift) break;
    result += shift;
  }
  return result + eventDurationMinutes(event?.duration) * 60_000;
}

function eventIsFinished(event, now = Date.now()) {
  const end = eventEndMs(event);
  return !Number.isFinite(end) || now >= end;
}

function eventCanAcceptBookings(event, now = Date.now()) {
  return Boolean(event && (event.status || 'published') === 'published' && !eventIsFinished(event,now));
}

module.exports = { DEFAULT_TIME_ZONE, eventDurationMinutes, eventEndMs, eventIsFinished, eventCanAcceptBookings };
