/* 設定。這個檔案會提交到 GitHub，只放可以公開的資訊。
   階段二才需要填 Project URL 與 Publishable key（絕對不要放 Secret key、資料庫密碼、站長密碼）。 */
export const config = {
  /* 'mock'＝階段一示範版；階段二改成 'supabase' */
  backend: new URLSearchParams(location.search).get('backend') === 'mock' ? 'mock' : 'supabase', // 網址加上 ?backend=mock 可以回到示範模式

  supabase: {
    url: 'https://whzwvcnlnrxepdskaxwk.supabase.co',
    publishableKey: 'sb_publishable_vIDArMcpgH_fOmTfIuwPuA_mu4O-jiL',
  },

  /* 「好多人」房間固定的編號 */
  groupRoomId: 'group',

  /* 各種上限 */
  limits: {
    nicknameMax: 20,
    messageMax: 2000,
    messageLoadCount: 50,
    cooldownSeconds: 0.5,
    secretCooldownSeconds: 0.5,
    imagesPerMessage: 10,
    imageMaxBytesIn: 10 * 1024 * 1024,   // 相簿選的原檔上限（會自動縮小）
    imageMaxEdge: 1280,
    avatarSize: 256,
    avatarMaxBytesIn: 10 * 1024 * 1024,
    fileMaxBytes: 50 * 1024 * 1024,
    videoMaxSeconds: 5 * 60,
    voiceMaxSeconds: 60,
    draftsMax: 5,
    dmCodeLengths: [4, 6],
    codeWrongMax: 5,
  },

  /* 檔案自動過期（天）；設為公告的訊息不過期 */
  expireDays: { group: 1, dm: 3 },

  /* 階段一示範用 */
  demo: {
    ownerReplyDelayMs: [2500, 4500],
    residentChatterMs: [18000, 40000],
  },

  /* 保留字：暱稱不能用 */
  reservedNames: ['系統', 'admin', 'administrator', '縵', 'mm', 'system'],
};
