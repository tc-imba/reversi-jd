import format from 'string-format';
import _ from 'lodash';
import shellQuote from 'shell-quote';

const utils = {};

utils.formatDeep = (value, fmt) => _.cloneDeepWith(value, val => {
  if (typeof val === 'string') {
    return format(val, fmt);
  }
});

utils.parseArgs = (args) => {
  const escape = (process.platform === 'win32') ? '^' : '\\';
  return shellQuote.parse(args, {}, { escape });
};

export default utils;
