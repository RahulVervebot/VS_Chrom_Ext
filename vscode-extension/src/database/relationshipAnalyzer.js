// ORM-level relationships. SQL/Prisma/migration FKs are produced by schemaAnalyzer.
const { lineIndex, lineAt } = require('../utils/text');
const { analyzeGoModels } = require('../analyzer/goSupport');
const { findPythonModels } = require('../analyzer/pythonSupport');
const { analyzeJpa } = require('../analyzer/jvmSupport');
const { analyzeEfEntities } = require('../analyzer/dotnetSupport');
const { analyzeRailsModels } = require('../analyzer/rubySupport');

function analyzeOrmRelationships(content, language, file, entities) {
  const starts = lineIndex(content);
  const rels = [];
  let m;
  if (['javascript', 'typescript'].includes(language)) {
    const seq = /(\w+)\.(hasMany|hasOne|belongsTo|belongsToMany)\(\s*(\w+)/g;
    while ((m = seq.exec(content))) {
      const type = { hasMany: 'one-to-many', hasOne: 'one-to-one', belongsTo: 'many-to-one', belongsToMany: 'many-to-many' }[m[2]];
      rels.push({ from: m[1], to: m[3], type, via: `${m[1]}.${m[2]}(${m[3]})`, file, line: lineAt(starts, m.index), source: 'sequelize-association' });
    }
    const typeorm = /@(OneToMany|ManyToOne|OneToOne|ManyToMany)\(\s*\(\)\s*=>\s*(\w+)[^)]*\)[\s\S]{0,120}?(\w+)\s*[!?]?\s*:/g;
    for (const e of entities.filter((x) => x.source === 'typeorm')) {
      const region = content.split('\n').slice(e.line - 1, e.endLine).join('\n');
      while ((m = typeorm.exec(region))) {
        const type = { OneToMany: 'one-to-many', ManyToOne: 'many-to-one', OneToOne: 'one-to-one', ManyToMany: 'many-to-many' }[m[1]];
        rels.push({ from: e.name, to: m[2], type, via: `${e.name}.${m[3]}`, file, line: e.line, source: 'typeorm-relation' });
      }
    }
    for (const e of entities.filter((x) => x.source === 'mongoose')) {
      const region = content.split('\n').slice(e.line - 1, e.endLine).join('\n');
      for (const r of region.matchAll(/(\w+)\s*:\s*\{?\s*\[?\s*\{?[^}]*?ref\s*:\s*['"](\w+)['"]/g)) {
        rels.push({ from: e.name, to: r[2], type: /\[\s*\{?[^\]]*ref/.test(r[0]) ? 'one-to-many' : 'many-to-one', via: `${e.name}.${r[1]}`, file, line: e.line, source: 'mongoose-ref' });
      }
    }
  } else if (language === 'php') {
    const re = /public\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+\$this->(hasMany|hasOne|belongsTo|belongsToMany)\(\s*(\w+)::class/g;
    while ((m = re.exec(content))) {
      const owner = entities.find((e) => e.line <= lineAt(starts, m.index) && e.endLine >= lineAt(starts, m.index));
      if (!owner) continue;
      const type = { hasMany: 'one-to-many', hasOne: 'one-to-one', belongsTo: 'many-to-one', belongsToMany: 'many-to-many' }[m[2]];
      rels.push({ from: owner.name, to: m[3], type, via: `${owner.name}::${m[1]}()`, file, line: lineAt(starts, m.index), source: 'eloquent-relation' });
    }
  } else if (language === 'java' || language === 'kotlin') {
    rels.push(...analyzeJpa(content, starts, file, language).relationships);
  } else if (language === 'csharp') {
    rels.push(...analyzeEfEntities(content, starts, file).relationships);
  } else if (language === 'ruby') {
    if (/<\s*(ApplicationRecord|ActiveRecord::Base|\w+Record)\b/.test(content)) rels.push(...analyzeRailsModels(content, starts, file).relationships);
  } else if (language === 'go') {
    rels.push(...analyzeGoModels(content, starts, file).relationships);
  } else if (language === 'python') {
    for (const mdl of findPythonModels(content, starts, file)) for (const r of mdl.relations) rels.push({ from: mdl.name, to: r.to, type: r.type, via: `${mdl.name}.${r.via}`, file, line: r.line, source: `${mdl.kind}-relation` });
  }
  return rels;
}

module.exports = { analyzeOrmRelationships };
