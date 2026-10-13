import { COLLAGE_THEME, drawCollage } from './share-art-collage.js';
import { NOTEBOOK_THEME, drawNotebook, LIBRARY_THEME, drawLibrary } from './share-art-study.js';
import { REPORT_THEME, drawReport } from './share-art-report.js';

// Theme paint and composition remain independent of the application state.
const definitions = [
  { id: 'study-notebook', kind: 'study', name: '自习室笔记页', theme: NOTEBOOK_THEME, draw: drawNotebook, contentSized: true },
  { id: 'study-library', kind: 'study', name: '图书借阅卡', theme: LIBRARY_THEME, draw: drawLibrary, contentSized: true },
  { id: 'life-collage', kind: 'life', name: '一天生活拼贴', theme: COLLAGE_THEME, draw: drawCollage, contentSized: true },
  { id: 'life-report', kind: 'life', name: '月末生活月报', theme: REPORT_THEME, draw: drawReport, contentSized: true },
];
export const SHARE_THEMES_B = Object.freeze(Object.fromEntries(definitions.map(item => [item.id, Object.freeze({...item.theme})])));
export const SHARE_LAYOUTS_B = Object.freeze(definitions.map(({theme, ...layout}) => Object.freeze({...layout, themeId: layout.id})));
