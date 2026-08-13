import fs from 'node:fs';

const items = JSON.parse(fs.readFileSync(new URL('../data/items_full.json', import.meta.url), 'utf8'));

const normalize = (text) => String(text || '')
  .normalize('NFC')
  .toLowerCase()
  .replace(/[^가-힣a-z0-9]/g, '');

const bigrams = (text) => {
  const normalized = normalize(text);
  const result = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
};

const jaccard = (left, right) => {
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const byDomain = Object.groupBy(items, (item) => item.domain);
const exactGroups = Object.values(Object.groupBy(items, (item) => normalize(item.text)))
  .filter((group) => group.length > 1);
const pairs = [];

for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
    const left = items[leftIndex];
    const right = items[rightIndex];
    const similarity = jaccard(bigrams(left.text), bigrams(right.text));
    if (similarity >= 0.35) {
      pairs.push({
        similarity,
        sameDomain: left.domain === right.domain,
        left,
        right,
      });
    }
  }
}
pairs.sort((left, right) => right.similarity - left.similarity);

console.log('# Domain summary');
for (const [domain, domainItems] of Object.entries(byDomain)) {
  const exactDuplicateIds = new Set(
    exactGroups
      .filter((group) => group.some((item) => item.domain === domain))
      .flat()
      .filter((item) => item.domain === domain)
      .map((item) => item.item_id),
  );
  const reverseLike = domainItems.filter((item) => /_R$/.test(item.item_id));
  console.log([
    domain,
    domainItems.length,
    `exact_duplicate_items=${exactDuplicateIds.size}`,
    `id_reverse_items=${reverseLike.length}`,
    `explicit_reverse_items=${domainItems.filter((item) => item.reverse || item.is_reverse).length}`,
  ].join('\t'));
}
console.log('\n# Exact duplicate groups');
for (const group of exactGroups) {
  console.log(`${group.map((item) => item.item_id).join(',')}\t${group[0].text}`);
}

console.log('\n# High similarity pairs');
for (const pair of pairs.slice(0, 150)) {
  console.log([
    pair.similarity.toFixed(3),
    pair.sameDomain ? 'same' : 'cross',
    pair.left.item_id,
    pair.right.item_id,
    pair.left.domain,
    pair.right.domain,
    pair.left.text,
    pair.right.text,
  ].join('\t'));
}
