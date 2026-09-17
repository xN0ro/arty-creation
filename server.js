'use strict';

// Render is configured to start `node server.js`.
// Preserve the original application in core-server.js and redirect the
// extension runner's internal ./server resolution to that preserved file.
const Module = require('module');
const path = require('path');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  if (request === './server' && parent && path.basename(parent.filename || '') === 'app-server.js') {
    return path.join(__dirname, 'core-server.js');
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require('./app-server');
