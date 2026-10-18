/* 「已登入的裝置」清單用的小圖示：瀏覽器（Chrome、Safari…）和系統（Windows、蘋果、Android）各畫成它們自己的樣子 */

const svg = (inner, size = 20) => `<svg class="dev-logo" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

const BROWSERS = {
  Chrome: svg('<path d="M12 12 1.61 6A12 12 0 0 1 22.39 6Z" fill="#EA4335"/><path d="M12 12 22.39 6A12 12 0 0 1 12 24Z" fill="#FBBC05"/><path d="M12 12 12 24A12 12 0 0 1 1.61 6Z" fill="#34A853"/><circle cx="12" cy="12" r="5.2" fill="#fff"/><circle cx="12" cy="12" r="3.8" fill="#4285F4"/>'),
  Safari: svg('<circle cx="12" cy="12" r="11" fill="#1B9CF2"/><circle cx="12" cy="12" r="9.2" fill="none" stroke="#fff" stroke-width="1" opacity=".85"/><path d="M12 12 7 17l3.5-6.5L17 7Z" fill="#fff"/><path d="M12 12 17 7l-3.5 6.5L7 17Z" fill="#FF3B30"/><circle cx="12" cy="12" r="1" fill="#fff"/>'),
  Edge: svg('<circle cx="12" cy="12" r="11" fill="#0F8FD9"/><path d="M4.6 14.2c0-4.600 3.700-8 8.100-7.600 3.300.3 5.700 2.700 5.700 5.600H9.800c.1 2.700 3.500 3.100 5.400 1.600l2.900 2.200c-1.700 2.200-4.200 3.200-6.900 3-3.900-.3-6.300-2.900-6.300-4.800Z" fill="#fff" opacity=".95"/><path d="M4.600 14.200C3.900 9 8 5.700 12 5.700c-4 .5-6.500 4-5.400 8.700Z" fill="#35D399"/>'),
  Firefox: svg('<circle cx="12" cy="12" r="11" fill="#FF7139"/><circle cx="12" cy="12" r="6.200" fill="#7542E5"/><path d="M4 9c2-4.500 8.500-6 12-2.200C13 6 8 8 7 12.500Z" fill="#FFCB3C"/>'),
  Other: svg('<circle cx="12" cy="12" r="10" fill="none" stroke="#5B4234" stroke-width="2"/><path d="M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20" fill="none" stroke="#5B4234" stroke-width="1.600"/>'),
};

const SYSTEMS = {
  Windows: svg('<path d="M2 4.400 10.400 3.200v8H2zM11.600 3 22 1.500V11.200H11.600zM2 12.800h8.400v8L2 19.600zM11.600 12.800H22v9.700l-10.400-1.500z" fill="#00A4EF"/>'),
  Apple: svg('<path d="M16.400 12.700c0-2.500 2-3.700 2.100-3.800-1.200-1.700-3-1.900-3.600-2-1.500-.2-3 .9-3.800.9s-2-.9-3.200-.9c-1.700 0-3.200 1-4.100 2.400-1.700 3-.4 7.400 1.300 9.800.8 1.200 1.800 2.500 3.100 2.500 1.200 0 1.700-.8 3.200-.8s1.900.8 3.200.8 2.200-1.200 3-2.400c.9-1.400 1.300-2.700 1.300-2.800 0 0-2.500-1-2.500-3.700ZM14 5.300c.7-.8 1.100-2 1-3.100-1 0-2.200.7-2.900 1.500-.6.700-1.200 1.900-1 3 1.100.1 2.200-.6 2.900-1.400Z" fill="#1D1D1F"/>'),
  Android: svg('<path d="M5 15.500a7 7 0 0 1 14 0Z" fill="#3DDC84"/><path d="M8 7.500 6.600 5.200M16 7.500l1.400-2.300" stroke="#3DDC84" stroke-width="1.300" stroke-linecap="round"/><circle cx="9.200" cy="12" r=".9" fill="#fff"/><circle cx="14.800" cy="12" r=".9" fill="#fff"/><rect x="5" y="16.200" width="14" height="4" rx="1.500" fill="#3DDC84"/>'),
  Other: svg('<rect x="6" y="2.500" width="12" height="19" rx="3" fill="none" stroke="#5B4234" stroke-width="2"/><circle cx="12" cy="18.500" r="1" fill="#5B4234"/>'),
};

/* 名字長這樣：「Chrome · Windows」「Safari · iPhone」 */
export function deviceIconsHtml(name) {
  const [b = '', o = ''] = String(name || '').split('·').map((s) => s.trim());
  const browser = BROWSERS[b] || BROWSERS.Other;
  const system = /Windows/.test(o) ? SYSTEMS.Windows : /iPhone|iPad|Mac|iOS/.test(o) ? SYSTEMS.Apple : /Android/.test(o) ? SYSTEMS.Android : SYSTEMS.Other;
  return `<span class="dev-logos">${browser}${system}</span>`;
}
