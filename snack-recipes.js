// snack-recipes.js
// 加工方式 × 食材 emoji → 零食产物
// 稀有度: common(灰) / rare(蓝) / epic(紫) / legendary(金)

module.exports = {
  // 加工方式列表
  methods: {
    '风干':  { name: '风干', desc: '脱水浓缩风味', time: 7200000 },
    '冷冻':  { name: '冷冻', desc: '锁鲜定型', time: 3600000 },
    '慢烤':  { name: '慢烤', desc: '低温脆化', time: 5400000 },
    '腌制':  { name: '腌制', desc: '入味发酵', time: 10800000 },
    '油炸':  { name: '油炸', desc: '高温酥脆', time: 2700000 },
  },

  // 配方表: 加工方式 → { 食材emoji: { 产物emoji, 名字, 稀有度, buff } }
  recipes: {
    '慢烤': {
      '🍪': { emoji: '🍪', name: '焦糖饼干', rarity: 'common', buff: { type: 'focus', duration: 3600000, value: 0.2, desc: '签到/每日一题 +20% 🍊' } },
      '🥔': { emoji: '🥔', name: '烤薯角', rarity: 'common', buff: { type: 'warm', duration: 1800000, value: 0.1, desc: '1h内戳一戳+1运气' } },
      '🍖': { emoji: '🍖', name: '蜜汁烤肉干', rarity: 'epic', buff: { type: 'lucky', duration: 7200000, value: 0.3, desc: '下次抽奖不空手' } },
    },
    '风干': {
      '🥩': { emoji: '🥩', name: '牛肉干', rarity: 'epic', buff: { type: 'focus', duration: 7200000, value: 0.3, desc: '2h内签到+30% 🍊' } },
      '🐟': { emoji: '🐟', name: '鱼干', rarity: 'common', buff: { type: 'social', duration: 3600000, value: 0.15, desc: '1h内发言+1🍊' } },
      '🍗': { emoji: '🍗', name: '风干鸡腿', rarity: 'rare', buff: { type: 'warm', duration: 5400000, value: 0.2, desc: '1.5h内抽奖+运气' } },
    },
    '冷冻': {
      '🍫': { emoji: '🍫', name: '巧克力脆棒', rarity: 'rare', buff: { type: 'focus', duration: 3600000, value: 0.25, desc: '1h内每日一题+25% 🍊' } },
      '🧋': { emoji: '🧋', name: '奶茶冻', rarity: 'rare', buff: { type: 'lucky', duration: 3600000, value: 0.2, desc: '下次抽奖运气+20%' } },
      '🥤': { emoji: '🥤', name: '冰沙棒', rarity: 'common', buff: { type: 'social', duration: 1800000, value: 0.1, desc: '30min内发言+1🍊' } },
    },
    '腌制': {
      '🥩': { emoji: '🥩', name: '腊肉', rarity: 'legendary', buff: { type: 'lucky', duration: 14400000, value: 0.5, desc: '4h内抽奖必中' } },
      '🐟': { emoji: '🐟', name: '咸鱼', rarity: 'epic', buff: { type: 'social', duration: 7200000, value: 0.3, desc: '2h内发言+2🍊' } },
      '🥒': { emoji: '🥒', name: '酱黄瓜', rarity: 'common', buff: { type: 'warm', duration: 1800000, value: 0.1, desc: '30min内戳一戳+1' } },
    },
    '油炸': {
      '🍗': { emoji: '🍗', name: '鸡米花', rarity: 'rare', buff: { type: 'focus', duration: 3600000, value: 0.2, desc: '1h内签到+20% 🍊' } },
      '🍤': { emoji: '🍤', name: '天妇罗碎', rarity: 'rare', buff: { type: 'lucky', duration: 3600000, value: 0.2, desc: '下次抽奖运气+20%' } },
      '🥔': { emoji: '🥔', name: '薯片', rarity: 'common', buff: { type: 'social', duration: 1800000, value: 0.1, desc: '30min内发言+1🍊' } },
      '🧅': { emoji: '🧅', name: '洋葱圈', rarity: 'common', buff: { type: 'warm', duration: 1800000, value: 0.1, desc: '30min内戳一戳+1' } },
      '🥦': { emoji: '🥦', name: '西兰花脆', rarity: 'epic', buff: { type: 'focus', duration: 5400000, value: 0.35, desc: '1.5h内每日一题+35% 🍊' } },
    },
  },

  // 多料传说配方（需要 ≥2 种食材）
  legendaryCombos: [
    { ingredients: ['🥩','🥩'], method: '慢烤', result: { emoji: '🥩', name: '战斧牛排干', rarity: 'legendary', buff: { type: 'lucky', duration: 21600000, value: 0.6, desc: '6h内抽奖必中+额外奖励' } } },
    { ingredients: ['🍗','🍖'], method: '腌制', result: { emoji: '🍗', name: '秘制肉铺拼盘', rarity: 'legendary', buff: { type: 'share', duration: 7200000, value: 1.0, desc: '2h内分享零食奖励翻倍' } } },
    { ingredients: ['🍫','🥤'], method: '冷冻', result: { emoji: '🍫', name: '巧克力奶昔冰', rarity: 'legendary', buff: { type: 'focus', duration: 10800000, value: 0.5, desc: '3h内所有橘子获取+50%' } } },
  ],

  // 查找配方
  findRecipe(method, ingredientEmoji) {
    if (this.recipes[method] && this.recipes[method][ingredientEmoji]) {
      return this.recipes[method][ingredientEmoji];
    }
    return null;
  },

  // 查找多料传说配方
  findLegendaryCombo(method, ingredientEmojis) {
    const sorted = [...ingredientEmojis].sort();
    for (const combo of this.legendaryCombos) {
      if (combo.method !== method) continue;
      const comboSorted = [...combo.ingredients].sort();
      if (JSON.stringify(sorted) === JSON.stringify(comboSorted)) return combo.result;
    }
    return null;
  },
};
