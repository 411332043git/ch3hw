/* 站長：一對一對話的選單（置頂、封鎖、解除封鎖、換主題、刪除整個對話）與刪除確認視窗 */
import { store } from '../state/store.js';
import { confirmDialog } from './modal.js';
import { toast, toastError } from './toast.js';
import { themeItem } from './roomTabs.js';

/* 刪除這個人和他的所有訊息：先確認，確定後才真的刪（無法復原，對方不會被通知） */
export async function confirmAndDeleteDm(ctx, roomId, afterDelete) {
  const ok = await confirmDialog({
    chip: '刪除對話', chipClass: 'peach', icon: 'i-trash', iconBg: '#E6D7F5',
    title: '刪除這個人和他的訊息？',
    text: '刪除後，這個人的訊息、圖片和這個對話都會真的刪掉，無法復原。對方不會收到通知，但他的畫面會回到「開啟聊天室」。確定嗎？',
    okText: '確定刪除', okStyle: 'background:#FFC9CE;', cancelText: '先不要',
  });
  if (!ok) return;
  try { await ctx.service.deleteDm({ roomId }); afterDelete && afterDelete(); } catch (e) { toastError(e); }
}

export function ownerDmMenuItems(ctx, roomId, { afterDelete }) {
  const d = store.dms.find((x) => x.roomId === roomId) || {};
  return [
    {
      icon: 'i-pin', text: d.pinned ? '取消置頂' : '置頂這個對話',
      onClick: async () => { try { await ctx.service.pinDm({ roomId, pinned: !d.pinned }); } catch (e) { toastError(e); } },
    },
    d.blocked
      ? { icon: 'i-undo', text: '解除封鎖', onClick: async () => { try { await ctx.service.unblockDm({ roomId }); toast('已解除封鎖', { icon: 'i-check' }); } catch (e) { toastError(e); } } }
      : { icon: 'i-ban', text: '封鎖', onClick: async () => { try { await ctx.service.blockDm({ roomId }); toast('已封鎖', { icon: 'i-check' }); } catch (e) { toastError(e); } } },
    themeItem(ctx),
    { icon: 'i-trash', text: '刪除整個對話', danger: true, onClick: () => confirmAndDeleteDm(ctx, roomId, afterDelete) },
  ];
}
