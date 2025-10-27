const { readFile, writeFile } = require('fs/promises');
const path = require('path');

const clone = (payload) => JSON.parse(JSON.stringify(payload));

class JsonStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.cache = new Map();
  }

  resolvePath(datasetName) {
    return path.join(this.baseDir, `${datasetName}.json`);
  }

  async read(datasetName) {
    if (this.cache.has(datasetName)) {
      return clone(this.cache.get(datasetName));
    }

    const filePath = this.resolvePath(datasetName);
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    this.cache.set(datasetName, parsed);
    return clone(parsed);
  }

  async write(datasetName, value) {
    const filePath = this.resolvePath(datasetName);
    await writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
    this.cache.set(datasetName, clone(value));
    return clone(value);
  }

  async upsert(datasetName, record, matcher) {
    const data = await this.read(datasetName);

    const index = data.findIndex((item) => matcher(item, record));
    if (index === -1) {
      data.push(record);
    } else {
      data[index] = { ...data[index], ...record };
    }

    await this.write(datasetName, data);
    return record;
  }
}

module.exports = JsonStore;
