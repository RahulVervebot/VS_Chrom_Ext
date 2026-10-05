const SCHEMA_VERSION = '1.0';
const ANALYSIS_VERSION = '1.0';

function isCompatibleSchema(v) {
  return typeof v === 'string' && v.split('.')[0] === SCHEMA_VERSION.split('.')[0];
}

module.exports = { SCHEMA_VERSION, ANALYSIS_VERSION, isCompatibleSchema };
