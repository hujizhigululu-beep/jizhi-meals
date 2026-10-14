const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

/** Render the settings page without reading or changing stored data. */
export function renderSettingsView(options = {}) {
  const {
    ios = false,
    offlineReady = false,
    swUpdateReady = false,
    installPrompt = false,
    backupTime = '',
    locked = false,
    savedRaw = false,
    hasMigrationBackup = false,
    hasV13Backup = false,
    hasV14Backup = false,
    hasV15Backup = false,
    hasAIPhase2Backup = false,
    letterCount = 0,
    mealCount = 0,
    inventoryCount = 0,
    diaryCount = 0,
    dayRecordCount = 0,
    mealTemplateCount = 0,
    studyCategoryCount = 0,
    exerciseCategoryCount = 0
  } = options;

  return `<section class="page settings-page">
    <div class="section-heading"><div><div class="eyebrow">MY PRIVATE LITTLE SPACE</div><h1>我的手账小角落</h1><p class="subheading">给这本小手账，留一点安心的照顾 ♡</p></div></div>

    <p class="ai-test-notice">🍓 AI 测试版 · 独立数据与缓存，请使用测试记录。</p>
    <section class="settings-card"><h3>✉ 草莓邮局 · 第一封来信</h3><p class="settings-group-intro">挑一天，勾选想寄出的日常。四项提示词独立编辑，喜欢的来信再收藏。</p><button class="pill pink" data-page="postoffice">打开草莓邮局 · ${escape(letterCount)} 封收藏</button></section>
    <div id="ai-lab-slot"></div>
    <section class="settings-card settings-group settings-backup" aria-labelledby="settings-backup-title">
      <h3 class="settings-group-title" id="settings-backup-title"><span aria-hidden="true">01</span> 备份与恢复</h3>
      <p class="settings-group-intro">记录存在此浏览器，存一份 JSON 备份更安心。</p>
      <div class="settings-actions"><button class="pill pink" data-action="export">导出 JSON 备份</button><button class="pill" data-action="import">导入 / 恢复</button></div>
      <details class="settings-help settings-backup-help"><summary>备份记录与恢复说明</summary><div class="settings-help-content">
        <p class="backup-status">${backupTime ? `最近发起导出：${escape(backupTime)}<br>请确认文件已经保存。` : '还没有发起过导出，记得偶尔存一份哦。'}</p>
        <p>餐食、库存、日记、学习运动、贴纸、常用餐食模板和快捷类别、邮局提示词和收藏来信都包含在 JSON 备份中，不会每周清空。清理网站数据、卸载浏览器或设备故障可能导致数据丢失，本地保存不能代替备份。请定期将 JSON 存到文件或自己的网盘。</p>
        <p>导入会替换整本手账，确认前会显示内容摘要。不同设备、浏览器和网站地址不会自动同步；切换前先导出，再在新位置导入。</p>
      </div></details>
    </section>

    <section class="settings-card settings-group settings-install" aria-labelledby="settings-install-title">
      <h3 class="settings-group-title" id="settings-install-title"><span aria-hidden="true">02</span> 安装到手机</h3>
      <p id="offline-status" class="settings-install-status">${offlineReady ? '✓ 离线资源已缓存，断网也能打开。' : '离线缓存尚未就绪，请联网等待缓存完成。'}</p>
      ${swUpdateReady ? '<p class="settings-update-status">新版本已准备好。先导出备份，再关闭此网站的所有窗口和主屏幕应用后重新打开。</p>' : ''}
      ${installPrompt ? '<div class="settings-actions"><button class="pill pink" data-action="install">安装到主屏幕</button></div>' : ''}
      <details class="settings-help settings-install-help"><summary>安装与离线说明</summary><div class="settings-help-content">
        <p class="settings-install-hint">${ios ? 'iPhone：Safari 分享菜单 → 添加到主屏幕。' : '可从浏览器菜单选择「安装应用」或「添加到主屏幕」。'}</p>
        <ul><li>安卓：用 Chrome 打开，选择菜单中的「安装应用」或「添加到主屏幕」。</li><li>iPhone：用 Safari 打开，点分享 →「添加到主屏幕」。</li><li>第一次打开需要网络；缓存成功后排餐、库存、备份均可离线操作。</li></ul>
        <p>离线缓存需要通过 HTTPS 地址或本机地址打开并联网完成；安装后首次打开也请等待缓存成功。</p>
        <p>不同设备、浏览器和网站地址不会自动同步。切换前请导出，在新位置导入。iPhone 安装后也请核对记录，必要时重新导入。</p>
      </div></details>
    </section>

    <section class="settings-card settings-group settings-shortcuts" aria-labelledby="settings-shortcuts-title">
      <h3 class="settings-group-title" id="settings-shortcuts-title"><span aria-hidden="true">03</span> 我的常用小纸条</h3>
      <p class="settings-group-intro">把喜欢的搭配和小习惯收好，想用时再选。</p>
      <div class="settings-actions"><button type="button" class="pill" data-action="manage-meal-templates">常吃餐食模板 · ${escape(mealTemplateCount)}</button><button type="button" class="pill" data-action="manage-study-categories">学习快捷类别 · ${escape(studyCategoryCount)}</button><button type="button" class="pill" data-action="manage-exercise-categories">运动快捷类别 · ${escape(exerciseCategoryCount)}</button></div>
      <p class="settings-group-intro">整理模板不会改动已有餐食或库存；类别可以改名或停用，过去的记录仍保留。</p>
    </section>

    <details class="settings-card settings-group settings-details settings-rules">
      <summary class="settings-group-summary"><h3 class="settings-group-title"><span aria-hidden="true">04</span> 手账的小约定</h3><span class="settings-disclosure-mark" aria-hidden="true"></span></summary>
      <div class="settings-group-content"><p>日期跟随设备当地时间，计划和回忆都留在真实的日子里。</p><p>一周从周一开始，跨月、跨年都按真实日期保存。未吃计划可以编辑、删除、复制、移动；已吃记录修改会重新计算用量，删除或撤销会返还全部食材。每餐可以关联多种库存食材，同一种食材只记一次。</p><p>每次数量最多三位小数。食材数量表示份、个、包或克，不计算营养或热量；发现实际用量不同，请在标记已吃前修改。</p><p>每天最多收好 3 枚不同的内置贴纸。快捷纸条和打卡都随心使用，没有必须完成的目标。</p></div>
    </details>

    <section class="settings-card settings-group settings-data" aria-labelledby="settings-data-title">
      <h3 class="settings-group-title" id="settings-data-title"><span aria-hidden="true">05</span> 本地数据管理</h3>
      <div class="settings-data-counts"><span><strong>${escape(mealCount)}</strong> 餐记录</span><span><strong>${escape(inventoryCount)}</strong> 种食材</span><span><strong>${escape(diaryCount)}</strong> 篇日记</span></div>
      <p class="settings-group-intro${locked ? ' settings-data-warning' : ''}">${locked ? '原文件已保护，请先保存原文件再恢复。' : `另有 ${escape(dayRecordCount)} 天学习运动 / 贴纸，都收在当前浏览器里。`}</p>
      ${hasAIPhase2Backup ? '<button class="pill" data-action="ai2-backup">保存 AI 第二期升级前原文</button>' : ''}
      ${savedRaw || hasV15Backup || hasV14Backup || hasV13Backup || hasMigrationBackup ? `<div class="settings-actions settings-backup-actions">${savedRaw ? '<button class="pill" data-action="original">保存当前原文件</button>' : ''}${hasV15Backup ? '<button class="pill" data-action="v15-backup">保存 V1.5 升级前备份</button>' : ''}${hasV14Backup ? '<button class="pill" data-action="v14-backup">保存 V1.4 升级前备份</button>' : ''}${hasV13Backup ? '<button class="pill" data-action="v13-backup">保存 V1.3 升级前备份</button>' : ''}${hasMigrationBackup ? '<button class="pill" data-action="migration-backup">保存 V1 原始备份</button>' : ''}</div>` : ''}
    </section>

    <details class="settings-card settings-group settings-details settings-credits">
      <summary class="settings-group-summary"><h3 class="settings-group-title"><span aria-hidden="true">06</span> 授权与版权</h3><span class="settings-disclosure-mark" aria-hidden="true"></span></summary>
      <div class="settings-group-content credits">食物插画：<a href="https://openmoji.org/" target="_blank" rel="noopener">OpenMoji</a> · <a href="./assets/credits.html" target="_blank" rel="noopener">作者、来源与 CC BY-SA 4.0 授权</a><br>食物插画保留 OpenMoji 官方原图；牛奶纸盒、装订、胶带、导航线稿与其他内置贴纸为本项目原创。</div>
    </details>

    <section class="settings-card settings-danger" aria-labelledby="settings-clear-title">
      <h3 class="settings-group-title" id="settings-clear-title">清空这本手账</h3><p>会删除全部餐食、库存、日记、学习运动、贴纸、常用模板、快捷类别、邮局提示词和收藏来信。这个操作不能撤销，请先导出备份。</p><div class="settings-actions"><button class="pill danger" data-action="clear">清空手账</button></div>
    </section>
    <p class="footer-note">机智定食-ai测试版本 · V1.5.0-ai2.1<br>轻轻记下自己的日常 ♡</p>
  </section>`;
}
