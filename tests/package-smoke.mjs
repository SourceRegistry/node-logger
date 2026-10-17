import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Logger as ESMLogger} from '@sourceregistry/node-logger';

const require = createRequire(import.meta.url);
const {Logger: CommonJSLogger} = require('@sourceregistry/node-logger');
assert.equal(typeof ESMLogger, 'function');
assert.equal(typeof CommonJSLogger, 'function');
