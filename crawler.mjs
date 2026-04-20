import fs from 'node:fs/promises';
import { load } from 'cheerio';

const LANGUAGES = [
  { code: 'ko', name: '한국어',   base: 'https://dioreclinic.com' },
  { code: 'en', name: 'English',  base: 'https://en.dioreclinic.com' },
  { code: 'jp', name: '日本語',    base: 'https://jp.dioreclinic.com' },
  { code: 'cn', name: '中文',      base: 'https://cn.dioreclinic.com' },
  { code: 'th', name: 'ไทย',      base: 'https://thai.dioreclinic.com' },
];

const PAGES = {
  event:   { idx: 'c685117779db8e', mvwiz: 'c685117779db8e/column_6859018812128' },
  regular: { idx: 'c6833bcd49498d', mvwiz: 'c6833bcd49498d/column_6853cf3052e70' },
};

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 DioreCSBot/1.0 (+github-actions)',
      'Accept': 'text/html,*/*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function parseItems(html) {
  const $ = load(html);
  const items = [];
  $('.prodlstgu2 > div').each((_, el) => {
    const $el = $(el);
    const title = $el.find('.rc2_title').first().text().trim();
    const price = $el.find('.rc2_price').first().text().trim().replace(/\s+/g, ' ');
    const onclick = $el.find('.rc2_more span').attr('onclick') || '';
    const idMatch = onclick.match(/_id=([a-z0-9]+)/i);
    items.push({ title, price, groupId: idMatch ? idMatch[1] : null });
  });
  return items;
}

function buildUrl(base, page, { exec, category, id }) {
  const params = new URLSearchParams({
    _simpleApps: 'etc/cart_resv2',
    _dbpath: '',
    mvwizhistory_id: '',
    mvwiz: page.mvwiz,
    _get: `{"idx":"${page.idx}"}`,
    exec,
    _ajaxpage: 'true',
  });
  if (category) params.set('category', category);
  if (id) params.set('_id', id);
  return `${base}/index.php?${params.toString()}`;
}

async function getCategories(lang, pageType) {
  const page = PAGES[pageType];
  // 메인 URL은 JS 렌더링이라 카테고리가 없음. AJAX 베이스 엔드포인트(exec 없음)에
  // #main_ct_lstd > div 형태로 카테고리가 서버-렌더되어 들어있음.
  const params = new URLSearchParams({
    _simpleApps: 'etc/cart_resv2',
    _dbpath: '',
    mvwizhistory_id: '',
    mvwiz: page.mvwiz,
    _get: `{"idx":"${page.idx}"}`,
    _ajaxpage: 'true',
  });
  const html = await fetchHTML(`${lang.base}/index.php?${params.toString()}`);
  const $ = load(html);
  // 각 카테고리는 표시 라벨과 별도의 API 키를 가질 수 있음 (예: 일본어 "時短パス" → API key "FAST TRACK").
  // onclick 내 jframe 호출의 category 파라미터에서 실제 API 키를 추출.
  return $('#main_ct_lstd > div').map((_, el) => {
    const onclick = $(el).attr('onclick') || '';
    const display = $(el).text().trim().replace(/\s+/g, ' ');
    const m = onclick.match(/jframe\([^,]*?[?&]category=([^&']+)[^']*','cartresv2lst_dsp/);
    const apiKey = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : display;
    return { apiKey, display };
  }).get().filter(c => c.apiKey && c.display);
}

async function crawlLanguage(lang) {
  const result = { name: lang.name, event: [], regular: [] };
  for (const pageType of ['event', 'regular']) {
    const page = PAGES[pageType];
    const categories = await getCategories(lang, pageType);
    console.log(`  [${lang.code}/${pageType}] ${categories.length}개 카테고리`);
    for (const cat of categories) {
      const listHtml = await fetchHTML(buildUrl(lang.base, page, { exec: 'prod_lst', category: cat.apiKey }));
      const groups = parseItems(listHtml);
      for (const g of groups) {
        if (!g.groupId) continue;
        const viewHtml = await fetchHTML(buildUrl(lang.base, page, { exec: 'prod_view', id: g.groupId }));
        const items = parseItems(viewHtml).filter(i => i.price && !/부터$|\+$/.test(i.price));
        result[pageType].push({
          category: cat.display,
          group: g.title,
          groupPriceFrom: g.price,
          items: items.map(i => ({ name: i.title, price: i.price })),
        });
        await new Promise(r => setTimeout(r, 120));
      }
    }
  }
  return result;
}

async function main() {
  const data = { updated_at: new Date().toISOString(), languages: {} };

  for (const lang of LANGUAGES) {
    console.log(`\n=== ${lang.name} (${lang.code}) ===`);
    try {
      data.languages[lang.code] = await crawlLanguage(lang);
      const r = data.languages[lang.code];
      const total = r.event.reduce((s, g) => s + g.items.length, 0) + r.regular.reduce((s, g) => s + g.items.length, 0);
      console.log(`  → event ${r.event.length}그룹, regular ${r.regular.length}그룹, 총 ${total}개 시술`);
    } catch (e) {
      console.error(`  ✗ ${lang.code} 실패: ${e.message}`);
      data.languages[lang.code] = { name: lang.name, event: [], regular: [], error: e.message };
    }
  }

  const json = JSON.stringify(data, null, 2);
  await fs.writeFile('prices.json', json);
  console.log(`\nprices.json 저장 (${(json.length / 1024).toFixed(1)}KB)`);

  const html = await fs.readFile('index.html', 'utf8');
  const updated = html.replace(
    /(<script id="embedded-data" type="application\/json">)[\s\S]*?(<\/script>)/,
    `$1\n${json}\n$2`
  );
  if (updated === html) throw new Error('index.html의 embedded-data 블록을 찾지 못했습니다');
  await fs.writeFile('index.html', updated);
  console.log('index.html embedded data 업데이트 완료');
}

main().catch(e => { console.error(e); process.exit(1); });
