#!/usr/bin/env node
'use strict';

const { runCli } = require('../dist-cli/cli/main.js');
const { version } = require('../package.json');

runCli(process.argv.slice(2), version).then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(`portkill: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
