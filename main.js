const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const NEIS_KEY = 'e318646576d84d90b4d146e47a11d1b7';
const EDU = 'S10';
const SCHOOL = '9091064';

// 캐시
let cache = {
  meals: {},
  events: []
};

function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ymd) {
  const year = parseInt(ymd.substring(0, 4));
  const month = ymd.substring(4, 6);
  const day = ymd.substring(6, 8);
  
  // YYYYMMDD를 Date 객체로 변환
  const date = new Date(year, parseInt(month) - 1, parseInt(day));
  
  // 요일 배열
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayOfWeek[date.getDay()];
  
  return `${month}월 ${day}일 (${dayName})`;
}

function getYmdWithDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayOfWeek[d.getDay()];
  return { ymd, dayName };
}

// 학사일정 데이터 (하드코딩)
const schoolEvents = [
  { name: '시업식', date: '20250304' },
  { name: '입학식', date: '20250304' },
  { name: '학교교육설명회', date: '20250320' },
  { name: '과학의 날 행사', date: '20250326' },
  { name: '1회고사', date: '20250422' },
  { name: '간부수련회', date: '20250424' },
  { name: '개교기념일', date: '20250501' },
  { name: '진로체험', date: '20250515' },
  { name: '체육한마당', date: '20250522' },
  { name: '학부모 공개수업', date: '20250528' },
  { name: '2회고사', date: '20250623' },
  { name: '여름방학식', date: '20250718' },
  { name: '개학식', date: '20250812' },
  { name: '현장체험', date: '20250922' },
  { name: '진로진학설명회', date: '20250925' },
  { name: '독서의 날 행사', date: '20251001' },
  { name: '동료교사 공개수업', date: '20251010' },
  { name: '2학기고사', date: '20251120' },
  { name: '진로특강', date: '20251211' },
  { name: '구산축제', date: '20251231' },
  { name: '졸업식', date: '20260107' },
  { name: '종업식', date: '20260107' }
];

async function updateCache() {
  try {
    const mealDates = [-1, 0, 1, 3, 7];
    for (const offset of mealDates) {
      const ymd = getYmd(offset);
      if (!cache.meals[ymd]) {
        try {
          const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
            params: {
              KEY: NEIS_KEY,
              Type: 'json',
              ATPT_OFCDC_SC_CODE: EDU,
              SD_SCHUL_CODE: SCHOOL,
              MLSV_YMD: ymd
            },
            timeout: 2000
          });
          cache.meals[ymd] = r.data?.mealServiceDietInfo?.[1]?.row || [];
        } catch (e) {
          console.error(`급식 갱신 실패 (${ymd})`);
        }
      }
    }
  } catch (e) {
    console.error('캐시 갱신 오류:', e.message);
  }
}

app.get('/', (req, res) => res.send('OK'));

app.post('/meal', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    let dateParam = params.date || params.날짜 || '';
    dateParam = dateParam.toLowerCase().trim();

    let ymd, dateLabel, dayName;

    if (dateParam === '내일') {
      ({ ymd, dayName } = getYmdWithDay(1));
      dateLabel = '내일';
    } else if (dateParam === '어제') {
      ({ ymd, dayName } = getYmdWithDay(-1));
      dateLabel = '어제';
    } else if (dateParam === '3일뒤' || dateParam === '3일후') {
      ({ ymd, dayName } = getYmdWithDay(3));
      dateLabel = '3일 뒤';
    } else if (dateParam === '일주일뒤' || dateParam === '일주일후') {
      ({ ymd, dayName } = getYmdWithDay(7));
      dateLabel = '일주일 뒤';
    } else {
      ({ ymd, dayName } = getYmdWithDay(0));
      dateLabel = '오늘';
    }

    const meals = cache.meals[ymd] || [];
    let text = '로딩 중입니다.';

    if (meals.length > 0) {
      text = meals
        .map(m => `【${m.MMEAL_SC_NM}】\n${m.DDISH_NM.replace(/<br\/>/g, '\n')}`)
        .join('\n\n');
      text = `[${dateLabel} ${formatDate(ymd)}]\n\n${text}`;
    } else if (Object.keys(cache.meals).length > 0) {
      text = `${dateLabel} (${dayName}요일)의 급식 정보가 없습니다.`;
    }

    res.json({
      version: '2.0',
      template: { outputs: [{ simpleText: { text } }] }
    });
  } catch (e) {
    res.json({
      version: '2.0',
      template: { outputs: [{ simpleText: { text: '오류 발생' } }] }
    });
  }
});

app.post('/event', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    const eventKeyword = (params.eventKeyword || params.행사명 || '').toString().toLowerCase().trim();

    if (!eventKeyword) {
      const eventList = [...new Set(schoolEvents.map(e => e.name))].join(', ');
      res.json({
        version: '2.0',
        template: { 
          outputs: [{ 
            simpleText: { 
              text: `다음 중 궁금한 행사를 말씀해주세요.\n${eventList}` 
            } 
          }] 
        }
      });
      return;
    }

    const matched = schoolEvents.filter(e => 
      e.name.toLowerCase().includes(eventKeyword)
    );

    let text = '없음';
    if (matched.length > 0) {
      text = matched
        .map(e => `${e.name}: ${formatDate(e.date)}`)
        .join('\n');
    } else {
      const eventList = [...new Set(schoolEvents.map(e => e.name))].join(', ');
      text = `'${eventKeyword}'는 없습니다.\n다음 중 선택하세요:\n${eventList}`;
    }

    res.json({
      version: '2.0',
      template: { outputs: [{ simpleText: { text } }] }
    });
  } catch (e) {
    res.json({
      version: '2.0',
      template: { outputs: [{ simpleText: { text: '오류 발생' } }] }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`포트 ${PORT}에서 실행`);
  
  setTimeout(() => updateCache(), 2000);
  setTimeout(() => updateCache(), 5000);
  setTimeout(() => updateCache(), 10000);
  setInterval(() => updateCache(), 5 * 60 * 1000);
});
