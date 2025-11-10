const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 날짜 포맷팅 함수 (YYYYMMDD)
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// 기본 라우트
app.get('/', (req, res) => {
  res.send('구산중 챗봇 서버 정상 작동 중');
});

// 급식 정보 조회
app.post('/meal', async (req, res) => {
  try {
    console.log('급식 요청 들어옴:', req.body);
    
    // 파라미터 추출
    const params = req.body.action?.params || {};
    const dateParam = params.date || '오늘';
    
    let ymd;
    if (dateParam === '내일') ymd = getYmd(1);
    else if (dateParam === '어제') ymd = getYmd(-1);
    else ymd = getYmd(0);
    
    console.log('조회 날짜:', ymd);

    const NEIS_KEY = 'e318646576d84d90b4d146e47a11d1b7';
    const EDU = 'S10';
    const SCHOOL = '9091064';

    // NEIS API 호출
    const response = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE: EDU,
        SD_SCHUL_CODE: SCHOOL,
        MLSV_YMD: ymd
      },
      timeout: 4000
    });

    console.log('NEIS 응답:', JSON.stringify(response.data).substring(0, 200));

    // 데이터 파싱
    const mealData = response.data?.mealServiceDietInfo;
    let text = '급식 정보가 없습니다.';

    if (mealData && mealData[1] && Array.isArray(mealData[1].row)) {
      const meals = mealData[1].row;
      const mealText = meals
        .map(meal => {
          const mealType = meal.MMEAL_SC_NM || '식사';
          const dishes = meal.DDISH_NM ? meal.DDISH_NM.replace(/<br\/>/g, '\n') : '없음';
          return `【${mealType}】\n${dishes}`;
        })
        .join('\n\n');
      
      text = mealText || '급식 정보가 없습니다.';
    }

    // 카카오 봇 응답 형식
    res.json({
      version: '2.0',
      template: {
        outputs: [
          {
            simpleText: {
              text: text
            }
          }
        ]
      }
    });

  } catch (error) {
    console.error('급식 조회 오류:', error.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [
          {
            simpleText: {
              text: '급식 정보를 불러올 수 없습니다.\n잠시 후 다시 시도해주세요.'
            }
          }
        ]
      }
    });
  }
});

// 학사일정 조회
app.post('/event', async (req, res) => {
  try {
    console.log('일정 요청 들어옴:', req.body);

    const params = req.body.action?.params || {};
    const eventKeyword = params.eventKeyword || params.행사명 || '';

    if (!eventKeyword || eventKeyword.trim() === '') {
      res.json({
        version: '2.0',
        template: {
          outputs: [
            {
              simpleText: {
                text: '행사명을 말씀해주세요.\n예) 졸업식, 체육대회, 입학식, 수학여행'
              }
            }
          ]
        }
      });
      return;
    }

    const NEIS_KEY = 'e318646576d84d90b4d146e47a11d1b7';
    const EDU = 'S10';
    const SCHOOL = '9091064';

    // 날짜 범위 설정 (오늘부터 약 8개월)
    const from = getYmd(0);
    const to = getYmd(240);

    console.log('일정 조회 범위:', from, '-', to);

    // NEIS API 호출
    const response = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE: EDU,
        SD_SCHUL_CODE: SCHOOL,
        AA_FROM_YMD: from,
        AA_TO_YMD: to
      },
      timeout: 4000
    });

    console.log('학사일정 응답:', JSON.stringify(response.data).substring(0, 200));

    // 데이터 파싱
    const scheduleData = response.data?.SchoolSchedule;
    let text = `'${eventKeyword}' 관련 학사일정이 없습니다.`;

    if (scheduleData && scheduleData[1] && Array.isArray(scheduleData[1].row)) {
      const events = scheduleData[1].row;
      const matched = events.filter(e => 
        (e.EVENT_NM || '').toLowerCase().includes(eventKeyword.toLowerCase())
      );

      if (matched.length > 0) {
        const eventText = matched
          .map(e => `${e.EVENT_NM}: ${e.EVENT_STRTDATE}`)
          .join('\n');
        text = eventText;
      }
    }

    // 카카오 봇 응답 형식
    res.json({
      version: '2.0',
      template: {
        outputs: [
          {
            simpleText: {
              text: text
            }
          }
        ]
      }
    });

  } catch (error) {
    console.error('학사일정 조회 오류:', error.message);
    res.json({
      version: '2.0',
      template: {
        outputs: [
          {
            simpleText: {
              text: '학사일정을 불러올 수 없습니다.\n잠시 후 다시 시도해주세요.'
            }
          }
        ]
      }
    });
  }
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버 시작: 포트 ${PORT}`);
  console.log(`로컬 주소: http://localhost:${PORT}`);
});
