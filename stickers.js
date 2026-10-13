// Stable IDs are the only sticker data stored in a diary or backup.
export const STICKERS = Object.freeze([
  { id: 'milk', name: '草莓奶盒', file: 'milk.svg', credit: '机智定食原创插画', source: './assets/milk-carton.svg' },
  { id: 'strawberry', name: '草莓', file: 'strawberry.svg', credit: 'OpenMoji contributors · CC BY-SA 4.0', source: 'https://openmoji.org/', license: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'book', name: '小书本', file: 'book.svg', credit: '机智定食原创贴纸' },
  { id: 'shoe', name: '运动鞋', file: 'shoe.svg', credit: '机智定食原创贴纸' },
  { id: 'star', name: '小星星', file: 'star.svg', credit: '机智定食原创贴纸' },
  { id: 'heart', name: '心心', file: 'heart.svg', credit: '机智定食原创贴纸' },
  { id: 'bow', name: '蝴蝶结', file: 'bow.svg', credit: '机智定食原创贴纸' },
  { id: 'fork', name: '小餐具', file: 'fork.svg', credit: '机智定食原创贴纸' },
].map(sticker => Object.freeze({ ...sticker, src: `./assets/stickers/${sticker.file}` })));
export const STICKER_IDS = Object.freeze(STICKERS.map(sticker => sticker.id));
export const getSticker = id => STICKERS.find(sticker => sticker.id === id) || null;
export const stickerById = getSticker;
export const stickerPath = id => getSticker(id)?.src || null;
