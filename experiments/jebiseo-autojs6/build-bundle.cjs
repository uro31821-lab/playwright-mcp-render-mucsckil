'use strict';
const fs = require('node:fs');
const path = require('node:path');

// A single phone-importable file; the generated output is also checked into Git.
const sources = ['core.js', 'autojs-adapter.js', 'journal.js', 'report.js', 'phone-launch.js', 'main.js'];
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, 'profile.example.json'), 'utf8'));
const lines = [
  '// JH 제비서 독립 시험 0.3.0 — AutoJs6에서 실행. JH 운영 미연결.',
  '// Generated with node build-bundle.cjs. Edit source modules, not this file.',
  '(function () {',
  "'use strict';",
  'var __JEBISEO_LAB_PROFILE = ' + JSON.stringify(profile, null, 2) + ';',
  'var factories = {}, loaded = {};',
  'function require(id) {',
  '  if (!Object.prototype.hasOwnProperty.call(factories, id)) throw new Error("MODULE_UNKNOWN");',
  '  if (!Object.prototype.hasOwnProperty.call(loaded, id)) {',
  '    var module = {exports:{}}; loaded[id] = module;',
  '    factories[id](module.exports, module, require);',
  '  }',
  '  return loaded[id].exports;',
  '}'
];
for (const file of sources) {
  lines.push('factories[' + JSON.stringify('./' + file) + '] = function (exports, module, require) {');
  lines.push(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  lines.push('};');
}
lines.push("require('./main.js');", '}());', '');
const out = path.join(__dirname, 'dist', 'jebiseo-independent-test.js');
fs.mkdirSync(path.dirname(out), {recursive:true});
fs.writeFileSync(out, lines.join('\n'));
console.log('Built ' + path.relative(__dirname, out) + ' (' + fs.statSync(out).size + ' bytes)');
