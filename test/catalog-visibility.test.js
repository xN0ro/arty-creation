'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

test('catalog content is visible even if scroll animation JavaScript fails',()=>{
  assert.match(css,/#page-paintings \.fade-up\{opacity:1;transform:none\}/);
  assert.match(css,/#page-paintings \.stagger-children>\*\{opacity:1;transform:none\}/);
});

test('scroll effects only observe the active route and have a no-observer fallback',()=>{
  assert.match(app,/document\.querySelector\('\.page\.active'\)\|\|document/);
  assert.match(app,/typeof window\.IntersectionObserver!=='function'/);
  assert.match(app,/targets\.forEach\(reveal\)/);
  assert.match(app,/requestAnimationFrame/);
});

test('catalog visibility fix uses cache-busted app and stylesheet assets',()=>{
  assert.match(html,/styles\.css\?v=20260919-catalog-visibility-1/);
  assert.match(html,/app\.js\?v=20260919-catalog-visibility-1/);
});
