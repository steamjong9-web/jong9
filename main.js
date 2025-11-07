const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();
app.use(express.json());

// ✅ 김해 구산중학교 NEIS 정보
const NEIS_KEY = process.env.NEIS_KEY;  // 환경변수로 등록해두세요
const EDU = 'S10';                      // 경상남도교육청 코드
const SCHOOL = '9091064';               // 구산중학교 표준코드

// ✅ 날짜 처리 함수
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}${mm}${dd}`;
}

// ✅ 자연어 날짜 파서
function parseDateParam(dateParam = '') {
  if (dateParam.includes('내일')) return getYmd(1);
  if (dateParam.includes('어제')) return getYmd(-1);
  const m = dateParam.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (m) {
    const y = new Date().getFullYear();
    const mm = ('0' + m[1]).slice(-2);
    const dd = ('0' + m[2]).slice(-2);
    return `${y}${mm}${dd}`;
  }
  return getYmd(0);
}

// ✅ 급식 조회 (NEIS)
async function getMeal({ key, edu, school, ymd }) {
  try {
    const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: { KEY: key, Type: 'json', ATPT_OFCDC_SC_CODE: edu, SD_SCHUL_CODE: school, MLSV_YMD: ymd }
    });
    const rows = r.data.mealServiceDietInfo?.[1]?.row || [];
    if (!rows.length) return '급식 정보가 없습니다.';
    return rows.map(x => `🍚 ${x.MMEAL_SC_NM}\n${x.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n');
  } catch (err) {
    console.error('Meal error:', err.message);
    return '급식 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// ✅ 학사일정(행사) 조회
function normalize(s = '') { return s.toLowerCase().replace(/\s/g, ''); }

async function getSchedule({ key, edu, school, keyword }) {
  const fromDate = getYmd(0);
  const toDate = getYmd(240);
  const synonyms = [keyword, keyword?.replace('식', ''), '졸업', '입학', '체육', '시험', '방학', '개학'].filter(Boolean);

  async function query(fromYmd, toYmd) {
    const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: { KEY: key, Type: 'json', ATPT_OFCDC_SC_CODE: edu, SD_SCHUL_CODE: school, AA_FROM_YMD: fromYmd, AA_TO_YMD: toYmd }
    });
    return r.data?.SchoolSchedule?.[1]?.row || [];
  }

  try {
    let rows = await query(fromDate, toDate);
    let matched = rows.filter(e => {
      const nm = normalize(e.EVENT_NM || '');
      return synonyms.some(k => nm.includes(normalize(k || '')));
    });

    if (!matched.length) {
      const yearStart = `${new Date().getFullYear()}0101`;
      const yearEnd = `${new Date().getFullYear()}1231`;
      rows = await query(yearStart, yearEnd);
      matched = rows.filter(e => {
        const nm = normalize(e.EVENT_NM || '');
        return synonyms.some(k => nm.includes(normalize(k || '')));
      });
    }

    if (!matched.length) return `${keyword || '요청한'} 관련 일정이 없습니다.`;

    return matched.map(e => {
      const s = e.EVENT_STRTDATE;
      const t = e.EVENT_ENDDATE && e.EVENT_ENDDATE !== e.EVENT_STRTDATE ? ` ~ ${e.EVENT_ENDDATE}` : '';
      return `📅 ${e.EVENT_NM}: ${s}${t}`;
    }).join('\n');
  } catch (err) {
    console.error('Schedule error:', err.message);
    return '학사일정 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// ✅ 시간표 조회 (컴시간알리미)
async function getTimetable({ schulCode, grade, ban }) {
  try {
    const url = `https://comci.net:4082/st`;
    const r = await axios.get(url, { params: { schulCode, grade, class: ban } });
    const $ = cheerio.load(r.data);

    const rows = [];
    $('table tr').each((i, tr) => {
      const cols = [];
      $(tr).find('td,th').each((_, td) => cols.push($(td).text().trim()));
      if (cols.length) rows.push(cols);
    });

    if (!rows.length) return '시간표를 불러오지 못했습니다. (구조 확인 필요)';
    const lines = [];
    for (let p = 1; p <= 7; p++) {
      const row = rows[p] || [];
      const subj = row[1] || '-';
      lines.push(`${p}교시: ${subj}`);
    }
    return `📘 ${grade}학년 ${ban}반 시간표\n` + lines.join('\n');
  } catch (err) {
    console.error('Timetable error:', err.message);
    return '시간표 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// ✅ 인텐트 자동 인식
function detectIntent(utter) {
  if (utter.includes('급식')) return 'meal';
  if (utter.includes('식단')) return 'meal';
  if (utter.includes('행사')) return 'event';
  if (utter.includes('일정')) return 'event';
  if (utter.includes('시간표')) return 'timetable';
  return '';
}

// ✅ 루트 확인
app.get('/', (_req, res) => res.send('Gusan Middle School Chatbot OK'));

// ✅ 카카오 스킬 엔드포인트
app.post('/skill', async (req, res) => {
  const params = req.body.action?.params || {};
  const utter = req.body.userRequest?.utterance || '';

  // 자동 인텐트 추론
  let intent = params.intent || detectIntent(utter);
  const dateParam = params.date || '';
  const eventKeyword = params.eventKeyword || params.행사명 || '';
  const grade = params.grade || params.학년 || '';
  const ban = params.class || params.반 || '';

  const ymd = parseDateParam(dateParam);
  let text = '';

  if (intent === 'meal') {
    text = await getMeal({ key: NEIS_KEY, edu: EDU, school: SCHOOL, ymd });
  } else if (intent === 'event') {
    if (!eventKeyword) text = '어떤 행사를 알고 싶나요? (예: 졸업식, 체육대회)';
    else text = await getSchedule({ key: NEIS_KEY, edu: EDU, school: SCHOOL, keyword: eventKeyword });
  } else if (intent === 'timetable') {
    if (!grade || !ban) text = '학년과 반을 알려주세요. (예: 2학년 3반)';
    else text = await getTimetable({ schulCode: 'YOUR_COMCI_SCHOOL_CODE', grade, ban });
  } else {
    text = '🔍 "오늘 급식", "졸업식 일정", "2학년 3반 시간표"처럼 물어보세요!';
  }

  res.json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text } }] }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Gusan Chatbot Skill Server started on ${PORT}`));


