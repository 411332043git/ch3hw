/* 表情回應選擇器與 Emoji 面板用的清單：自己整理成資料檔，不依賴外部服務。
   只收錄大多數裝置都已支援的 emoji（避免舊手機顯示成方框）。每個是 [emoji, 中英文關鍵字]。 */

export const QUICK = ['😀', '😂', '🥰', '😍', '😊', '🥺', '😭', '😎', '🤗', '😴', '🎉', '✨', '❤️', '👍', '🙏', '🌸', '🍮', '🐱', '🐶', '🐰', '☕', '🍪', '🌈', '⭐', '🔥', '💪', '🥳', '😋', '🫶', '💤'];

export const CATEGORIES = [
  { id: 'face', label: '表情', items: [
    ['😀', '開心 笑 happy smile'], ['😃', '開心 大笑 smile'], ['😄', '笑 happy'], ['😁', '露齒笑 grin'], ['😆', '大笑 laugh'], ['😅', '汗 苦笑 sweat'],
    ['😂', '笑哭 哈哈 lol joy'], ['🤣', '笑翻 rofl'], ['🙂', '微笑 slight smile'], ['😉', '眨眼 wink'], ['😊', '害羞 微笑 blush'], ['😇', '天使 angel'],
    ['🥰', '愛 喜歡 love'], ['😍', '愛心眼 love eyes'], ['😘', '飛吻 kiss'], ['😗', '親親 kiss'], ['😋', '好吃 yum'], ['😛', '吐舌 tongue'],
    ['😜', '調皮 wink tongue'], ['🤪', '瘋 crazy'], ['🤗', '抱抱 hug'], ['🤭', '偷笑 giggle'], ['🤔', '思考 想 think'], ['😐', '無言 neutral'],
    ['😑', '無表情 expressionless'], ['😶', '沉默 silent'], ['😏', '得意 smirk'], ['😒', '無聊 unamused'], ['🙄', '翻白眼 roll eyes'], ['😬', '尷尬 grimace'],
    ['😌', '放鬆 relieved'], ['😔', '失落 sad pensive'], ['😪', '睏 sleepy'], ['😴', '睡覺 sleep zzz'], ['😷', '口罩 生病 mask'], ['🤒', '發燒 sick'],
    ['🥵', '好熱 hot'], ['🥶', '好冷 cold'], ['🥴', '暈 woozy'], ['😵', '暈眩 dizzy'], ['🤯', '爆炸 驚訝 mind blown'], ['😎', '酷 墨鏡 cool'],
    ['🤓', '書呆子 nerd'], ['🥳', '派對 慶祝 party'], ['😕', '困惑 confused'], ['😟', '擔心 worried'], ['🙁', '難過 frown'], ['😮', '驚訝 surprised'],
    ['😲', '震驚 astonished'], ['🥺', '拜託 可憐 pleading'], ['😦', '失望 frown'], ['😧', '痛苦 anguish'], ['😨', '害怕 fear'], ['😰', '冷汗 anxious'],
    ['😢', '哭 cry'], ['😭', '大哭 sob'], ['😱', '尖叫 scream'], ['😖', '糾結 confounded'], ['😞', '失望 disappointed'], ['😓', '汗 downcast'],
    ['😩', '累 weary'], ['😫', '疲憊 tired'], ['🥱', '哈欠 yawn'], ['😤', '生氣 哼 triumph'], ['😡', '生氣 angry'], ['😠', '憤怒 mad'],
    ['🤬', '罵 swear'], ['😈', '小惡魔 devil'], ['💀', '骷髏 skull'], ['💩', '便便 poop'], ['🤡', '小丑 clown'], ['👻', '鬼 ghost'],
    ['👽', '外星人 alien'], ['🤖', '機器人 robot'],
  ] },
  { id: 'animal', label: '動物', items: [
    ['🐶', '狗 dog'], ['🐱', '貓 cat'], ['🐭', '老鼠 mouse'], ['🐹', '倉鼠 hamster'], ['🐰', '兔子 rabbit'], ['🦊', '狐狸 fox'],
    ['🐻', '熊 bear'], ['🐼', '熊貓 panda'], ['🐨', '無尾熊 koala'], ['🐯', '老虎 tiger'], ['🦁', '獅子 lion'], ['🐮', '牛 cow'],
    ['🐷', '豬 pig'], ['🐸', '青蛙 frog'], ['🐵', '猴子 monkey'], ['🐔', '雞 chicken'], ['🐧', '企鵝 penguin'], ['🐦', '鳥 bird'],
    ['🐤', '小雞 chick'], ['🦆', '鴨 duck'], ['🦉', '貓頭鷹 owl'], ['🦄', '獨角獸 unicorn'], ['🐝', '蜜蜂 bee'], ['🦋', '蝴蝶 butterfly'],
    ['🐌', '蝸牛 snail'], ['🐞', '瓢蟲 ladybug'], ['🐢', '烏龜 turtle'], ['🐙', '章魚 octopus'], ['🦀', '螃蟹 crab'], ['🐠', '熱帶魚 fish'],
    ['🐬', '海豚 dolphin'], ['🐳', '鯨魚 whale'], ['🦈', '鯊魚 shark'], ['🐘', '大象 elephant'], ['🦒', '長頸鹿 giraffe'], ['🐑', '綿羊 sheep'],
    ['🌸', '櫻花 花 flower'], ['🌷', '鬱金香 tulip'], ['🌻', '向日葵 sunflower'], ['🌈', '彩虹 rainbow'], ['⭐', '星星 star'], ['🌙', '月亮 moon'],
    ['☀️', '太陽 sun'], ['☁️', '雲 cloud'], ['🍀', '幸運草 clover'],
  ] },
  { id: 'food', label: '食物', items: [
    ['🍎', '蘋果 apple'], ['🍊', '橘子 orange'], ['🍋', '檸檬 lemon'], ['🍌', '香蕉 banana'], ['🍉', '西瓜 watermelon'], ['🍇', '葡萄 grape'],
    ['🍓', '草莓 strawberry'], ['🍑', '水蜜桃 peach'], ['🍒', '櫻桃 cherry'], ['🥝', '奇異果 kiwi'], ['🍅', '番茄 tomato'], ['🥕', '紅蘿蔔 carrot'],
    ['🌽', '玉米 corn'], ['🍞', '麵包 bread'], ['🥐', '可頌 croissant'], ['🧀', '起司 cheese'], ['🍳', '荷包蛋 egg'], ['🥞', '鬆餅 pancake'],
    ['🍔', '漢堡 burger'], ['🍟', '薯條 fries'], ['🍕', '披薩 pizza'], ['🌭', '熱狗 hotdog'], ['🌮', '塔可 taco'], ['🍜', '麵 拉麵 noodle'],
    ['🍣', '壽司 sushi'], ['🍙', '飯糰 rice ball'], ['🍚', '飯 rice'], ['🍡', '糰子 dango'], ['🍦', '冰淇淋 ice cream'], ['🍧', '剉冰 shaved ice'],
    ['🍩', '甜甜圈 donut'], ['🍪', '餅乾 cookie'], ['🎂', '蛋糕 生日 cake'], ['🍰', '蛋糕 cake'], ['🍮', '布丁 pudding'], ['🍫', '巧克力 chocolate'],
    ['🍬', '糖果 candy'], ['🍭', '棒棒糖 lollipop'], ['☕', '咖啡 coffee'], ['🍵', '茶 tea'], ['🧋', '珍珠奶茶 bubble tea'], ['🥤', '飲料 drink'],
    ['🍺', '啤酒 beer'], ['🍷', '紅酒 wine'],
  ] },
  { id: 'activity', label: '活動', items: [
    ['⚽', '足球 soccer'], ['🏀', '籃球 basketball'], ['🏈', '美式足球 football'], ['⚾', '棒球 baseball'], ['🎾', '網球 tennis'], ['🏐', '排球 volleyball'],
    ['🏓', '桌球 ping pong'], ['🏸', '羽毛球 badminton'], ['🥊', '拳擊 boxing'], ['🎯', '射飛鏢 target'], ['🎮', '遊戲 game'], ['🎲', '骰子 dice'],
    ['🎨', '畫畫 art'], ['🎬', '電影 movie'], ['🎤', '麥克風 唱歌 mic'], ['🎧', '耳機 headphone'], ['🎵', '音樂 music'], ['🎶', '音符 notes'],
    ['🎸', '吉他 guitar'], ['🎹', '鋼琴 piano'], ['🥁', '鼓 drum'], ['🏆', '獎盃 trophy'], ['🥇', '金牌 gold'], ['🎉', '慶祝 party popper'],
    ['🎊', '彩帶 confetti'], ['🎈', '氣球 balloon'], ['🎁', '禮物 gift'], ['🏖️', '海灘 beach'], ['🏕️', '露營 camping'], ['🚴', '騎腳踏車 bike'],
    ['🏊', '游泳 swim'], ['🧘', '瑜珈 yoga'], ['✈️', '飛機 airplane'], ['🚗', '汽車 car'], ['🚌', '公車 bus'], ['🚲', '腳踏車 bicycle'],
  ] },
  { id: 'object', label: '物品', items: [
    ['📱', '手機 phone'], ['💻', '電腦 laptop'], ['⌚', '手錶 watch'], ['📷', '相機 camera'], ['📸', '拍照 camera flash'], ['🎥', '攝影機 video'],
    ['💡', '燈泡 點子 bulb'], ['🔦', '手電筒 flashlight'], ['📚', '書 books'], ['📖', '打開的書 book'], ['✏️', '鉛筆 pencil'], ['📝', '筆記 memo'],
    ['📎', '迴紋針 clip'], ['✂️', '剪刀 scissors'], ['🔑', '鑰匙 key'], ['🔒', '鎖 lock'], ['🛏️', '床 bed'], ['🛁', '浴缸 bath'],
    ['🧸', '泰迪熊 teddy'], ['🎀', '蝴蝶結 ribbon'], ['👑', '皇冠 crown'], ['👗', '洋裝 dress'], ['👕', 'T恤 shirt'], ['👟', '球鞋 sneaker'],
    ['👜', '包包 bag'], ['👓', '眼鏡 glasses'], ['☂️', '雨傘 umbrella'], ['🌂', '傘 umbrella'], ['💰', '錢 money'], ['🛒', '購物車 cart'],
  ] },
  { id: 'symbol', label: '符號', items: [
    ['❤️', '愛心 紅心 heart love'], ['🧡', '橘心 orange heart'], ['💛', '黃心 yellow heart'], ['💚', '綠心 green heart'], ['💙', '藍心 blue heart'], ['💜', '紫心 purple heart'],
    ['🤍', '白心 white heart'], ['🤎', '棕心 brown heart'], ['💖', '閃亮愛心 sparkling heart'], ['💕', '兩顆心 two hearts'], ['💞', '旋轉愛心 revolving hearts'], ['💗', '愛心 growing heart'],
    ['💔', '心碎 broken heart'], ['✨', '閃亮 sparkles'], ['🌟', '星星 glowing star'], ['💫', '暈眩 dizzy star'], ['🔥', '火 fire'], ['💥', '爆炸 boom'],
    ['💯', '一百分 100'], ['✅', '勾勾 check'], ['❌', '叉叉 cross'], ['⭕', '圓圈 circle'], ['❓', '問號 question'], ['❗', '驚嘆號 exclamation'],
    ['👍', '讚 大拇指 thumbs up like'], ['👎', '倒讚 thumbs down'], ['👏', '拍手 clap'], ['🙌', '舉雙手 raise hands'], ['🙏', '拜託 感謝 pray thanks'], ['🤝', '握手 handshake'],
    ['👋', '揮手 wave'], ['🤞', '祈禱 fingers crossed'], ['✌️', '耶 peace'], ['🫶', '比心 heart hands'], ['💪', '加油 肌肉 muscle'], ['👀', '眼睛 eyes'],
    ['💤', '睡 zzz'], ['💭', '想法 thought'], ['💬', '對話 chat'], ['🎵', '音符 note'], ['♻️', '回收 recycle'], ['🔔', '鈴鐺 bell'],
  ] },
];

/* 搜尋：中文或英文關鍵字（不分大小寫） */
export function searchEmoji(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const out = [];
  CATEGORIES.forEach((c) => c.items.forEach(([e, k]) => { if (k.toLowerCase().includes(s) || e === s) out.push(e); }));
  return [...new Set(out)];
}
