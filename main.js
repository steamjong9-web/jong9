const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
app.use(express.json());

// 날짜 유틸
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}${mm}${dd}`;
}

// NEIS 급식
async function getMeal({ key, edu, school, ymd }) {
  try {
    const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: { KEY: key, Type: 'json', ATPT_OFCDC_SC_CODE: edu, SD_SCHUL_CODE: school, MLSV_YMD: ymd }
    });
    const rows = r.data.mealServiceDietInfo?.[1]?.row || [];
    if (!rows.length) return '급식 정보가 없습니다.';
    return rows.map(x => `${x.MMEAL_SC_NM}: ${x.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n');
  } catch {
    return '급식 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// NEIS 학사일정(행사)
function normalize(s=''){return s.toLowerCase().replace(/\s/g,'');}
async function getSchedule({ key, edu, school, keyword }) {
  const fromDate = getYmd(0);
  const toDate = getYmd(240);
  const synonyms = [keyword, keyword?.replace('식',''), '졸업', '졸업식', '입학', '입학식', '체육대회', '학예회', '기말', '중간'].filter(Boolean);

  async function query(fromYmd, toYmd) {
    const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: { KEY: key, Type: 'json', ATPT_OFCDC_SC_CODE: edu, SD_SCHUL_CODE: school, AA_FROM_YMD: fromYmd, AA_TO_YMD: toYmd }
    });
    return r.data?.SchoolSchedule?.[1]?.row || [];
  }

  try {
    let rows = await query(fromDate, toDate);
    let matched = rows.filter(e=>{
      const nm = normalize(e.EVENT_NM || '');
      return synonyms.some(k=>nm.includes(normalize(k || '')));
    });

    // 없으면 범위 확대(올해 전체)
    if (!matched.length) {
      const yearStart = `${new Date().getFullYear()}0101`;
      const yearEnd   = `${new Date().getFullYear()}1231`;
      rows = await query(yearStart, yearEnd);
      matched = rows.filter(e=>{
        const nm = normalize(e.EVENT_NM || '');
        return synonyms.some(k=>nm.includes(normalize(k || '')));
      });
    }

    if (!matched.length) return `${keyword || '요청한'} 관련 학사일정이 없습니다.`;
    return matched.map(e=>{
      const s = e.EVENT_STRTDATE;
      const t = e.EVENT_ENDDATE && e.EVENT_ENDDATE !== e.EVENT_STRTDATE ? ` ~ ${e.EVENT_ENDDATE}` : '';
      return `${e.EVENT_NM} : ${s}${t}`;
    }).join('\n');
  } catch {
    return '학사일정 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// 컴시간알리미 시간표(예시 파서: 실제 학교 구조에 맞게 수정 필요)
async function getTimetable({ schulCode, grade, ban, ymd }) {
  try {
    const url = 'https://comci.net:4082/st';
    const r = await axios.get(url, { params: { schulCode, grade, class: ban, week: ymd } });
    const $ = cheerio.load(r.data);
    const rows = [];
    $('table tr').each((i, tr)=>{
      const cols=[]; $(tr).find('td,th').each((_,td)=>cols.push($(td).text().trim()));
      if (cols.length) rows.push(cols);
    });
    if (!rows.length) return '시간표를 불러오지 못했습니다. (구조 확인 필요)';
    // 예시: 1~7교시 월요일 열을 읽음. 실제 인덱스는 페이지 구조로 조정 필요.
    const dayCol = 1;
    const lines=[];
    for (let p=1;p<=7;p++){
      const row = rows[p] || [];
      lines.push(`${p}교시: ${row[dayCol] || '-'}`);
    }
    return lines.join('\n');
  } catch {
    return '시간표 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

app.get('/', (_req, res) => res.send('OK'));

app.post('/skill', async (req, res) => {
  const params = req.body.action?.params || {};
  console.log('params:', JSON.stringify(params));

  // 고정/입력 파라미터 수신
  const intent = params.intent || ''; // meal | event | timetable
  const dateParam = params.date || '오늘';
  const eventKeyword = params.eventKeyword || params.행사명 || '';
  const grade = params.grade || params.학년 || '';
  const ban = params.class || params.반 || '';

  const ymd = dateParam==='내일' ? getYmd(1)
           : dateParam==='어제' ? getYmd(-1)
           : /^\d{8}$/.test(dateParam) ? dateParam
           : getYmd(0);

  const NEIS_KEY = process.env.NEIS_KEY;
  const EDU = 'S10';        // 교육청 코드(예: 경남)
  const SCHOOL = '9091064'; // 표준학교코드(실제 학교 코드로 교체)
  let text = '';

  if (intent === 'meal') {
    text = await getMeal({ key: NEIS_KEY, edu: EDU, school: SCHOOL, ymd });
  } else if (intent === 'event') {
    if (!eventKeyword) text = '행사명을 알려주세요. 예) 졸업식, 체육대회';
    else text = await getSchedule({ key: NEIS_KEY, edu: EDU, school: SCHOOL, keyword: eventKeyword });
  } else if (intent === 'timetable') {
    if (!grade || !ban) text = '학년과 반을 알려주세요. 예) 2학년 3반';
    else text = await getTimetable({ schulCode: 'YOUR_COMCI_SCHOOL_CODE', grade, ban, ymd });
  } else {
    // 의도 미설정 시 기본: 오늘 급식
    const meal = await getMeal({ key: NEIS_KEY, edu: EDU, school: SCHOOL, ymd });
    text = meal;
  }

  res.json({ version: "2.0", template: { outputs: [{ simpleText: { text } }] } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));
