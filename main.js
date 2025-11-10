const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const NEIS_KEY = 'e318646576d84d90b4d146e47a11d1b7';
const EDU = 'S10';
const SCHOOL = '9091064';

// 캐시 (메모리)
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
  const month = ymd.substring(4, 6);
  const day = ymd.substring(6, 8);
  return `${month}월 ${day}일`;
}

// 백그라운드에서 계속 데이터 갱신 (비동기)
async function updateCache() {
  try {
    // 급식 로드
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

    // 학사일정 로드
    if (cache.events.length === 0) {
      try {
        const from = getYmd(0);
        const to = getYmd(240);
        const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
          params: {
            KEY: NEIS_KEY,
            Type: 'json',
            ATPT_OFCDC_SC_CODE: EDU,
            SD_SCHUL_CODE: SCHOOL,
            AA_FROM_YMD: from,
            AA_TO_YMD: to
          },
          timeout: 2000
        });
        cache.events = r.data?.SchoolSchedule?.[1]?.row || [];
      } catch (e) {
        console.error('학사일정 갱신 실패');
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

    let ymd = getYmd(0);
    let dateLabel = '오늘';

    if (dateParam === '내일') {
      ymd = getYmd(1);
      dateLabel = '내일';
    } else if (dateParam === '어제') {
      ymd = getYmd(-1);
      dateLabel = '어제';
    } else if (dateParam === '3일뒤' || dateParam === '3일후') {
      ymd = getYmd(3);
      dateLabel = '3일 뒤';
    } else if (dateParam === '일주일뒤' || dateParam === '일주일후') {
      ymd = getYmd(7);
      dateLabel = '일주일 뒤';
    }

    const meals = cache.meals[ymd] || [];
    let text = '로딩 중입니다.';

    if (meals.length > 0) {
      text = meals
        .map(m => `【${m.MMEAL_SC_NM}】\n${m.DDISH_NM.replace(/<br\/>/g, '\n')}`)
        .join('\n\n');
      text = `[${dateLabel} ${formatDate(ymd)}]\n\n${text}`;
    } else if (Object.keys(cache.meals).length > 0) {
      text = `${dateLabel}의 급식 정보가 없습니다.`;
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
      res.json({
        version: '2.0',
        template: { outputs: [{ simpleText: { text: '행사명을 말씀해주세요.' } }] }
      });
      return;
    }

    let text = '로딩 중입니다.';

    if (cache.events.length > 0) {
      const matched = cache.events.filter(e => 
        (e.EVENT_NM || '').toLowerCase().includes(eventKeyword)
      );

      if (matched.length > 0) {
        text = matched
          .map(e => `${e.EVENT_NM}: ${formatDate(e.EVENT_STRTDATE)}`)
          .join('\n');
      } else {
        text = `'${eventKeyword}' 관련 일정이 없습니다.`;
      }
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
  
  // 백그라운드 갱신: 시작 후 2초, 5초, 10초, 그 후 5분마다
  setTimeout(() => updateCache(), 2000);
  setTimeout(() => updateCache(), 5000);
  setTimeout(() => updateCache(), 10000);
  setInterval(() => updateCache(), 5 * 60 * 1000);
});
