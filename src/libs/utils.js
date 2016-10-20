import format from 'string-format';
import _ from 'lodash';

const utils = {};

utils.formatDeep = (value, fmt) => _.cloneDeepWith(value, val => {
  if (typeof val === 'string') {
    return format(val, fmt);
  }
});

export default utils;
