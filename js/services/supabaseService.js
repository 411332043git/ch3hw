/* 階段二：Supabase 版 ChatService（還沒有做）。
   做法：照 chatService.js 的合約，提供一模一樣的指令與事件，再把 config.js 的 backend 改成 'supabase'。
   階段一不安裝、不連接 Supabase。 */
import { ChatService, ServiceError } from './chatService.js';

export class SupabaseService extends ChatService {
  constructor() {
    super();
    throw new ServiceError('network', '階段二才會接上 Supabase，目前請使用示範模式（config.js 的 backend 保持 mock）');
  }
}
