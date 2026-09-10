'use strict';

// Options are stored on the existing persistent disk; no legacy offers are seeded.
module.exports = function mountEventOptions(app, {readDB, writeDB, adminOnly, I18n}) {
  const {randomUUID} = require('node:crypto');
  const sort = items => [...items].sort((a,b) => a.sortOrder-b.sortOrder || String(a.id).localeCompare(String(b.id)));
  function payload(body, current = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Vérifiez les champs de l’option.');
    const data = {...current, ...body};
    function text(value, max) {
      if (typeof value !== 'string' || value.trim().length > max) throw new Error('Vérifiez les champs de l’option.');
      return value.trim();
    }
    function lines(value) {
      if (!Array.isArray(value) || value.length > 24) throw new Error('Ajoutez au maximum 24 inclusions, une par ligne.');
      return value.map(item => text(item,240)).filter(Boolean);
    }
    const title = text(data.title ?? '',160);
    if (!title) throw new Error('Ajoutez un titre en français.');
    const description = text(data.description ?? '',2000);
    const includes = lines(data.includes ?? []);
    const rawPrice = data.price;
    const price = rawPrice === null || rawPrice === undefined || rawPrice === '' ? null : rawPrice;
    if (price !== null && (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000 || Math.abs(price*100-Math.round(price*100)) > 0.000001)) throw new Error('Indiquez un prix valide avec au maximum deux décimales.');
    const priceUnit = data.priceUnit ?? 'person';
    if (!['person','group'].includes(priceUnit)) throw new Error('Choisissez un prix par personne ou par groupe.');
    const sortOrder = data.sortOrder ?? 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 999999) throw new Error('L’ordre d’affichage doit être un nombre entier positif ou nul.');
    const published = data.published ?? false;
    if (typeof published !== 'boolean') throw new Error('Vérifiez la visibilité de l’option.');
    const english = data.translations?.en ?? {};
    const en = {title:text(english.title ?? '',160),description:text(english.description ?? '',2000),includes:lines(english.includes ?? [])};
    if (published && (!en.title || (description && !en.description) || en.includes.length !== includes.length)) throw new Error('Complétez la version anglaise avant de publier cette option.');
    return {title,description,includes,price:price === null ? null : Math.round(price*100)/100,priceUnit,sortOrder,published,translations:{en}};
  }
  const invalid = (res,error) => res.status(400).json({error:I18n.t(error.message)});
  const missing = res => res.status(404).json({error:I18n.t('Option introuvable.')});
  app.get('/api/event-options', (req,res) => {
    res.set('Cache-Control','no-store');
    res.json(sort(readDB().eventOptions.filter(option => option.published === true)));
  });
  app.get('/api/admin/event-options', adminOnly, (req,res) => {
    res.set('Cache-Control','no-store');
    res.json(sort(readDB().eventOptions));
  });
  app.post('/api/admin/event-options', adminOnly, (req,res) => {
    let data;
    try { data = payload(req.body); } catch(error) { return invalid(res,error); }
    const db = readDB(), now = new Date().toISOString();
    const option = {id:randomUUID(),...data,createdAt:now,updatedAt:now};
    db.eventOptions.push(option);writeDB(db);
    res.status(201).json({success:true,option});
  });
  app.put('/api/admin/event-options/:id', adminOnly, (req,res) => {
    const db = readDB(), index = db.eventOptions.findIndex(option => option.id === req.params.id);
    if (index < 0) return missing(res);
    let data;
    try { data = payload(req.body,db.eventOptions[index]); } catch(error) { return invalid(res,error); }
    db.eventOptions[index] = {...db.eventOptions[index],...data,updatedAt:new Date().toISOString()};
    writeDB(db);res.json({success:true,option:db.eventOptions[index]});
  });
  app.delete('/api/admin/event-options/:id', adminOnly, (req,res) => {
    const db = readDB(), index = db.eventOptions.findIndex(option => option.id === req.params.id);
    if (index < 0) return missing(res);
    db.eventOptions.splice(index,1);writeDB(db);res.json({success:true});
  });
};
