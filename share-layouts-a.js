import { STRAWBERRY_THEME, drawStrawberry } from './share-art-strawberry.js';
import { BADGES_THEME, drawBadges } from './share-art-badges.js';
import { CAFE_THEME, drawCafe, TICKET_THEME, drawTicket } from './share-art-tickets.js';

// Each composition consumes the same read-only, privacy-filtered share content.
const definitions = [
  { id: 'meal-strawberry', kind: 'meal', name: '草莓牛奶手账', theme: STRAWBERRY_THEME, draw: drawStrawberry, contentSized: true },
  { id: 'meal-cafe', kind: 'meal', name: '奶油早餐店菜单', theme: CAFE_THEME, draw: drawCafe, contentSized: true },
  { id: 'exercise-ticket', kind: 'exercise', name: '暴走小票', theme: TICKET_THEME, draw: drawTicket, contentSized: true },
  { id: 'exercise-badges', kind: 'exercise', name: '活力徽章板', theme: BADGES_THEME, draw: drawBadges, contentSized: true },
];
export const SHARE_THEMES_A = Object.freeze(Object.fromEntries(definitions.map(item => [item.id, Object.freeze({...item.theme})])));
export const SHARE_LAYOUTS_A = Object.freeze(definitions.map(({theme, ...layout}) => Object.freeze({...layout, themeId: layout.id})));
