const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio'); // 시간표 HTML 파싱
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

app.get('/', (req, res) => res.send('OK'));

// 1) 급식 조회
async function getMeal(NEIS_KEY, eduCode, schoolCode, ymd) {
  try {
    const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE: eduCode,
        SD_SCHUL_CODE: schoolCode,
        MLSV_YMD: ymd
      }
    });
    const rows = r.data.mealServiceDietInfo?.[1]?.row || [];
    if (rows.length === 0) return '급식 정보가 없습니다.';
    return rows.map(x => `${x.MMEAL_SC_NM}: ${x.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n');
  } catch (e) {
    return '급식 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// 2) 학사일정(행사) 조회
async function getScheduleByKeyword(NEIS_KEY, eduCode, schoolCode, keyword) {
  const fromDate = getYmd(0);
  const toDate = getYmd(200);
  try {
    const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE: eduCode,
        SD_SCHUL_CODE: schoolCode,
        AA_FROM_YMD: fromDate,
        AA_TO_YMD: toDate
      }
    });
    const rows = r.data?.SchoolSchedule?.[1]?.row || [];
    const kw = (keyword || '').toLowerCase();
    const matched = rows.filter(e => (e.EVENT_NM || '').toLowerCase().includes(kw));
    if (matched.length === 0) return `${keyword} 관련 학사일정이 없습니다.`;
    return matched.map(e => `${e.EVENT_NM} : ${e.EVENT_STRTDATE}${e.EVENT_ENDDATE && e.EVENT_ENDDATE !== e.EVENT_STRTDATE ? ' ~ ' + e.EVENT_ENDDATE : ''}`).join('\n');
  } catch (e) {
    return '학사일정 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

// 3) 시간표(컴시간알리미) 조회
// 주의: 학교별 파라미터가 다를 수 있으니 실제 학교 URL 규칙을 확인하세요.
// 예시: https://comci.net:4082/st?schulCode=XXXX&grade=2&class=3&week=20251107
async function getTimetableFromComci({ schulCode, grade, ban, ymd }) {
  try {
    // 예시 URL 패턴. 실제 학교에 맞게 수정 필요.
    const url = 'https://comci.net:4082/st';
    const r = await axios.get(url, {
      params: {
        schulCode, // 학교 코드
        grade,     // 학년
        class: ban, // 반
        week: ymd   // 기준일(해당 주)
      }
    });
    // HTML 파싱
    const $ = cheerio.load(r.data);
    // 페이지 구조에 맞는 selector를 확인해 수정하세요.
    // 아래는 예시: 테이블의 요일/교시 데이터를 추출
    const rows = [];
    $('table tr').each((i, tr) => {
      const cols = [];
      $(tr).find('td,th').each((_, td) => cols.push($(td).text().trim()));
      if (cols.length) rows.push(cols);
    });
    if (rows.length === 0) return '시간표를 불러오지 못했습니다. (구조 확인 필요)';
    // 간단히 1~7교시를 요약
    const header = rows[0] || [];
    const todayIdx = 1; // 예시: 월요일 열 인덱스. 실제 구조에 맞게 결정 필요.
    const lines = [];
    for (let p = 1; p <= 7; p++) {
      const row = rows[p] || [];
      lines.push(`${p}교시: ${row[todayIdx] || '-'}`);
    }
    return lines.join('\n');
  } catch (e) {
    return '시간표 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

app.post('/skill', async (req, res) => {
  // 공통 설정
  const NEIS_KEY = process.env.NEIS_KEY;
  const ATPT_OFCDC_SC_CODE = 'S10';   // 경남교육청 (예시)
  const SD_SCHUL_CODE = '9091064';    // 구산중학교 (예시) 실제 코드로 변경
  const params = req.body.action?.params || {};

  // 날짜 처리
  const dateParam = params.date || '오늘';
  let ymd;
  if (dateParam === '오늘') ymd = getYmd(0);
  else if (dateParam === '내일') ymd = getYmd(1);
  else if (dateParam === '어제') ymd = getYmd(-1);
  else if (/^\d{8}$/.test(dateParam)) ymd = dateParam;
  else ymd = getYmd(0);

  // 의도 구분: 오픈빌더에서 block 이름이나 추가 파라미터로 구분하는 것을 권장
  // 여기서는 간단히 파라미터 플래그로 구분하는 예시
  const intent = params.intent || ''; // 'meal' | 'event' | 'timetable'
  const eventKeyword = params.행사명 || params.eventKeyword || ''; // 엔티티로 받은 행사명
  const grade = params.grade || params.학년 || '';
  const ban = params.class || params.반 || '';

  let text = '';

  if (intent === 'meal') {
    text = await getMeal(NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE, ymd);
  } else if (intent === 'event') {
    if (!eventKeyword) {
      text = '행사명을 알려주세요. 예) 졸업식, 체육대회';
    } else {
      text = await getScheduleByKeyword(NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE, eventKeyword);
    }
  } else if (intent === 'timetable') {
    if (!grade || !ban) {
      text = '학년과 반을 알려주세요. 예) 2학년 3반';
    } else {
      text = await getTimetableFromComci({
        schulCode: 'YOUR_COMCI_SCHOOL_CODE', // 실제 컴시간알리미 학교 코드 입력
        grade,
        ban,
        ymd
      });
    }
  } else {
    // 기본 응답: 오늘 급식 + 행사 키워드가 있으면 함께
    const meal = await getMeal(NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE, ymd);
    if (eventKeyword) {
      const ev = await getScheduleByKeyword(NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE, eventKeyword);
      text = `${meal}\n\n[행사 안내]\n${ev}`;
    } else {
      text = meal;
    }
  }

  res.json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text } }] }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));
