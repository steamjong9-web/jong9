const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// 캐시 (메모리 저장소)
let mealCache = {};
let eventCache = {};

// NEIS API에서 데이터 가져오기 (백그라운드)
async function fetchMealData(ymd) {
  try {
    const response = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: {
        KEY: 'e318646576d84d90b4d146e47a11d1b7',
        Type: 'json',
        ATPT_OFCDC_SC_CODE: 'S10',
        SD_SCHUL_CODE: '9091064',
        MLSV_YMD: ymd
      },
      timeout: 5000
    });

    const meals = response.data?.mealServiceDietInfo?.[1]?.row || [];
    mealCache[ymd] = meals;
    return meals;
  } catch (error) {
    console.error('NEIS 급식 오류:', error.message);
    return [];
  }
}

async function fetchEventData(from, to) {
  try {
    const response = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: {
        KEY: 'e318646576d84d90b4d146e47a11d1b7',
        Type: 'json',
        ATPT_OFCDC_SC_CODE: 'S10',
        SD_SCHUL_CODE: '9091064',
        AA_FROM_YMD: from,
        AA_TO_YMD: to
      },
      timeout: 5000
    });

    const events = response.data?.SchoolSchedule?.[1]?.row || [];
    const cacheKey = `${from}_${to}`;
    eventCache[cacheKey] = events;
    return events;
  } catch (error) {
    console.error('NEIS 일정 오류:', error.message);
    return [];
  }
}

app.get('/', (req, res) => {
  res.send('구산중 챗봇 정상 작동');
});

// 급식 조회 - 캐시 사용
app.post('/meal', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    const dateParam = params.date || '오늘';

    let ymd;
    if (dateParam === '내일') ymd = getYmd(1);
    else if (dateParam === '어제') ymd = getYmd(-1);
    else ymd = getYmd(0);

    // 캐시가 있으면 즉시 반환
    let meals = mealCache[ymd] || [];
    
    let text = '급식 정보가 없습니다.';
    if (meals.length > 0) {
      text = meals
        .map(m => `【${m.MMEAL_SC_NM}】\n${m.DDISH_NM.replace(/<br\/>/g, '\n')}`)
        .join('\n\n');
    }

    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text }
        }]
      }
    });

    // 백그라운드에서 최신 데이터 갱신
    if (!mealCache[ymd]) {
      fetchMealData(ymd);
    }

  } catch (error) {
    console.error('오류:', error.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text: '요청 처리 중 오류가 발생했습니다.' }
        }]
      }
    });
  }
});

// 학사일정 조회 - 캐시 사용
app.post('/event', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    const eventKeyword = params.eventKeyword || params.행사명 || '';

    if (!eventKeyword || eventKeyword.trim() === '') {
      res.json({
        version: '2.0',
        template: {
          outputs: [{
            simpleText: { text: '행사명을 알려주세요.\n예) 졸업식, 체육대회' }
          }]
        }
      });
      return;
    }

    const from = getYmd(0);
    const to = getYmd(240);
    const cacheKey = `${from}_${to}`;

    // 캐시 확인
    let events = eventCache[cacheKey] || [];
    let matched = events.filter(e => 
      (e.EVENT_NM || '').toLowerCase().includes(eventKeyword.toLowerCase())
    );

    let text = `'${eventKeyword}' 관련 일정이 없습니다.`;
    if (matched.length > 0) {
      text = matched.map(e => `${e.EVENT_NM}: ${e.EVENT_STRTDATE}`).join('\n');
    }

    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text }
        }]
      }
    });

    // 백그라운드에서 최신 데이터 갱신
    if (!eventCache[cacheKey]) {
      fetchEventData(from, to);
    }

  } catch (error) {
    console.error('오류:', error.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text: '요청 처리 중 오류가 발생했습니다.' }
        }]
      }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`포트 ${PORT}에서 서버 실행 중`));

