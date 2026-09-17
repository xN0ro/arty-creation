'use strict';

// Render is configured to start `node server.js`.
// Keep the original application untouched in core-server.js while loading
// the Studio + commerce extensions around it.
const Module = require('module');
const fs = require('fs');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;
const originalReadFileSync = fs.readFileSync;
const corePath = path.join(__dirname, 'core-server.js');

Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === './server' && parent && path.basename(parent.filename || '') === 'app-server.js') {
    return corePath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// app-server compiles the preserved core as an extension module. The original
// server only listens when it is the process main module, so make that one
// startup guard unconditional in the source string passed to the compiler.
fs.readFileSync = function(file, ...args) {
  const value = originalReadFileSync.call(this, file, ...args);
  if (path.resolve(String(file)) !== path.resolve(corePath) || typeof value !== 'string') return value;
  return value.replace(
    "if (require.main === module) app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));",
    "app.listen(PORT, () => console.log(`Arty! server → http://localhost:${PORT}`));"
  );
};

require('./app-server');
