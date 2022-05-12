const { readFile, writeFile } = require('fs/promises');
const { version } = require('./package.json');
const { join } = require('path');

// Read output file and replace fake variable with constant
readFile(join(__dirname,'dist/bin.js'))
    .then(buf => buf.toString())
    .then(str => str.replace('___VERSION_NUMBER___', `'${version}'`))
    .then(str => writeFile('./dist/bin.js', str, 'utf-8'));
