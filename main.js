const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const NEIS_KEY = 'e318646576d84d90b4d146e47a11d1b7';
const EDU = 'S10';
const SCHOOL = '9091064';

let mealData = {};
let eventData = [];

function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ymd) {
  const year = ymd.substring(0, 4);
  const month = ymd.substring(4, 6);
  const day = ymd.substring(6, 8);
  return `${month}월 ${day}일`;
}

async function preloadData() {
  try {
    // 급식: 어제, 오늘, 내일, +3일, +7일 미리 로드
    const dateOffsets = [-1, 0, 1, 3, 7];
    for (const offset of dateOffsets) {
      const ymd = getYmd(offset);
      try {
        const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
          params: {
            KEY: NEIS_KEY,
            Type: 'json',
            ATPT_OFCDC_SC_CODE: EDU,
            SD_SCHUL_CODE: SCHOOL,
            MLSV_YMD: ymd
          },
          timeout: 3000
        });
        mealData[ymd] = r.data?.mealServiceDietInfo?.[1]?.row || [];
        console.log(`급식 로드: ${ymd} (${mealData[ymd].length}개)`);
      } catch (e) {
        console.error(`급식 로드 실패 (${ymd}):`, e.message);
        mealData[ymd] = [];
      }
    }

    // 학사일정 로드
    const from = getYmd(0);
    const to = getYmd(240);
    try {
      const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
        params: {
          KEY: NEIS_KEY,
          Type: 'json',
          ATPT_OFCDC_SC_CODE: EDU,
          SD_SCHUL_CODE: SCHOOL,
          AA_FROM_YMD: from,
          AA_TO_YMD: to
        },
        timeout: 3000
      });
      eventData = r.data?.SchoolSchedule?.[1]?.row || [];
      console.log(`학사일정 로드: ${eventData.length}개`);
    } catch (e) {
      console.error('학사일정 로드 실패:', e.message);
      eventData = [];
    }
  } catch (e) {
    console.error('프리로드 오류:', e.message);
  }
}

app.get('/', (req, res) => res.send('OK'));

// 급식 조회
app.post('/meal', (req, res) => {
  try {
    const body = req.body;
    console.log('Meal 요청:', JSON.stringify(body).substring(0, 200));

    // 파라미터 추출 (여러 방식 지원)
    let dateParam = null;
    
    // 방식 1: action.params.date
    if (body.action?.params?.date) {
      dateParam = body.action.params.date.toLowerCase();
    }
    // 방식 2: action.params.날짜
    else if (body.action?.params?.날짜) {
      dateParam = body.action.params.날짜.toLowerCase();
    }
    // 방식 3: action.detailParams
    else if (body.action?.detailParams?.date) {
      dateParam = body.action.detailParams.date.value?.toLowerCase();
    }

    console.log('인식된 날짜 파라미터:', dateParam);

    let ymd;
    let dateLabel = '오늘';

    if (dateParam === '내일' || dateParam === 'tomorrow') {
      ymd = getYmd(1);
      dateLabel = '내일';
    } else if (dateParam === '어제' || dateParam === 'yesterday') {
      ymd = getYmd(-1);
      dateLabel = '어제';
    } else if (dateParam === '3일뒤' || dateParam === '3일후') {
      ymd = getYmd(3);
      dateLabel = '3일 뒤';
    } else if (dateParam === '일주일뒤' || dateParam === '일주일후') {
      ymd = getYmd(7);
      dateLabel = '일주일 뒤';
    } else {
      // YYYYMMDD 형식이면 직접 사용
      if (dateParam && /^\d{8}$/.test(dateParam)) {
        ymd = dateParam;
        dateLabel = formatDate(ymd);
      } else {
        ymd = getYmd(0);
        dateLabel = '오늘';
      }
    }

    const meals = mealData[ymd] || [];
    
    let text;
    if (meals.length > 0) {
      const mealText = meals
        .map(m => {
          const mealType = m.MMEAL_SC_NM || '식사';
          const dishes = m.DDISH_NM.replace(/<br\/>/g, '\n').trim();
          return `【${mealType}】\n${dishes}`;
        })
        .join('\n\n');
      text = `[${dateLabel} ${formatDate(ymd)}]\n\n${mealText}`;
    } else {
      text = `${dateLabel}의 급식 정보가 없습니다.`;
    }

    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text }
        }]
      }
    });
  } catch (e) {
    console.error('Meal 오류:', e.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text: '급식 정보를 불러올 수 없습니다.' }
        }]
      }
    });
  }
});

// 학사일정 조회
app.post('/event', (req, res) => {
  try {
    const body = req.body;
    console.log('Event 요청:', JSON.stringify(body).substring(0, 200));

    // 파라미터 추출 (여러 방식 지원)
    let eventKeyword = null;

    // 방식 1: action.params.eventKeyword
    if (body.action?.params?.eventKeyword) {
      eventKeyword = body.action.params.eventKeyword;
    }
    // 방식 2: action.params.행사명
    else if (body.action?.params?.행사명) {
      eventKeyword = body.action.params.행사명;
    }
    // 방식 3: action.detailParams
    else if (body.action?.detailParams?.eventKeyword) {
      eventKeyword = body.action.detailParams.eventKeyword.value;
    }
    else if (body.action?.detailParams?.행사명) {
      eventKeyword = body.action.detailParams.행사명.value;
    }

    console.log('인식된 행사명:', eventKeyword);

    if (!eventKeyword || (typeof eventKeyword === 'string' && eventKeyword.trim() === '')) {
      res.json({
        version: '2.0',
        template: {
          outputs: [{
            simpleText: { 
              text: '행사명을 말씀해주세요.\n예) 졸업식, 체육대회, 입학식, 수학여행, 학예회' 
            }
          }]
        }
      });
      return;
    }

    // 행사 검색 (정확도 높은 매칭)
    const keyword = eventKeyword.toString().toLowerCase().trim();
    const matched = eventData.filter(e => {
      const eventName = (e.EVENT_NM || '').toLowerCase();
      return eventName.includes(keyword) || keyword.includes(eventName);
    });

    console.log(`검색 결과: ${matched.length}개`);

    let text;
    if (matched.length > 0) {
      text = matched
        .map(e => {
          const date = e.EVENT_STRTDATE;
          const formattedDate = formatDate(date);
          return `${e.EVENT_NM}: ${formattedDate}`;
        })
        .join('\n');
    } else {
      text = `'${eventKeyword}' 관련 학사일정이 없습니다.`;
    }

    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text }
        }]
      }
    });
  } catch (e) {
    console.error('Event 오류:', e.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [{
          simpleText: { text: '학사일정을 불러올 수 없습니다.' }
        }]
      }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`포트 ${PORT}에서 실행 중`);
  await preloadData();
  
  // 30분마다 데이터 갱신
  setInterval(preloadData, 30 * 60 * 1000);
});
