// Stable IDs are the only sticker data stored in a diary or backup.
// The original eight IDs and their attribution stay unchanged across upgrades.
export const STICKER_GROUPS = Object.freeze([
  { id: 'food', name: '吃饭', caption: '把小滋味收好' },
  { id: 'study', name: '学习', caption: '一点点小收获' },
  { id: 'motion', name: '运动', caption: '给生活充点电' },
  { id: 'mood', name: '心情', caption: '今天的心情小表情' },
  { id: 'life', name: '生活', caption: '平凡的小事也可爱' },
  { id: 'decor', name: '装饰', caption: '给手账添点小点缀' },
].map(group => Object.freeze(group)));

const original = (id, name, category, file) => ({ id, name, category, file, credit: '机智定食原创贴纸' });
const reused = (id, name, category, file) => ({ ...original(id, name, category, `../${file}`), src: `./assets/${file}`, source: `./assets/${file}` });
export const STICKERS = Object.freeze([
  { id: 'milk', name: '草莓奶盒', category: 'food', file: 'milk.svg', credit: '机智定食原创插画', source: './assets/milk-carton.svg' },
  { id: 'strawberry', name: '草莓', category: 'food', file: 'strawberry.svg', credit: 'OpenMoji contributors · CC BY-SA 4.0', source: 'https://openmoji.org/', license: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  original('book', '小书本', 'study', 'book.svg'),
  original('shoe', '运动鞋', 'motion', 'shoe.svg'),
  original('star', '小星星', 'decor', 'star.svg'),
  original('heart', '心心', 'mood', 'heart.svg'),
  original('bow', '蝴蝶结', 'decor', 'bow.svg'),
  original('fork', '小餐具', 'food', 'fork.svg'),
  reused('food-croissant', '可颂早餐', 'food', 'share-art/strawberry-croissant.svg'),
  reused('food-bento', '小便当', 'food', 'share-art/strawberry-bento.svg'),
  reused('food-pudding', '草莓布丁', 'food', 'share-art/strawberry-pudding.svg'),
  reused('study-pencil', '小铅笔', 'study', 'share-art/study-pencil.svg'),
  original('study-backpack', '上学小书包', 'study', 'study-backpack.svg'),
  original('motion-dumbbell', '举个小哑铃', 'motion', 'motion-dumbbell.svg'),
  reused('motion-route', '散步路牌', 'motion', 'share-art/ticket-signpost.svg'),
  original('mood-sleepy', '睡个好觉', 'mood', 'mood-sleepy.svg'),
  original('mood-happy', '开心一点', 'mood', 'mood-happy.svg'),
  original('mood-cat', '小猫陪你', 'mood', 'mood-cat.svg'),
  original('life-brush', '画画时间', 'life', 'life-brush.svg'),
  original('life-headphones', '听首喜欢的歌', 'life', 'life-headphones.svg'),
  original('life-shopping', '买点小东西', 'life', 'life-shopping.svg'),
  original('life-broom', '收拾小房间', 'life', 'life-broom.svg'),
  original('life-laundry', '洗好小衣服', 'life', 'life-laundry.svg'),
  reused('life-camera', '收藏一张照片', 'life', 'share-art/collage-camera.svg'),
  reused('life-fridge', '小冰箱补货', 'life', 'notebook-ui/little-fridge.svg'),
  reused('decor-flower', '小花开啦', 'decor', 'share-art/collage-flower.svg'),
  reused('decor-stamp', '草莓小邮票', 'decor', 'share-art/strawberry-stamp.svg'),
  reused('decor-letter', '寄一封心心信', 'decor', 'share-art/badges-envelope.svg'),
].map(sticker => Object.freeze({ ...sticker, src: sticker.src || `./assets/stickers/${sticker.file}` })));
export const STICKER_IDS = Object.freeze(STICKERS.map(sticker => sticker.id));
export const getSticker = id => STICKERS.find(sticker => sticker.id === id) || null;
export const stickerById = getSticker;
export const stickerPath = id => getSticker(id)?.src || null;
