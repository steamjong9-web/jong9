const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}${mm}${dd}`;
}

app.get('/', (req, res) => res.send('OK'));

async function getEventInfoFromApi(keyword, NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE) {
  const fromDate = getYmd(0);
  const toDate = getYmd(180);

  try {
    const res = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE,
        SD_SCHUL_CODE,
        AA_FROM_YMD: fromDate,
        AA_TO_YMD: toDate,
      }
    });

    const events = res.data?.SchoolSchedule?.[1]?.row || [];
    const matched = events.filter(e => e.EVENT_NM && e.EVENT_NM.includes(keyword));
    if (matched.length > 0) {
      return matched.map(e => `${e.EVENT_NM} : ${e.EVENT_STRTDATE}`).join('\n');
    }
    return `${keyword} 관련 학사일정이 없습니다.`;
  } catch (e) {
    return '학사일정 정보를 불러오는 중 오류가 발생했습니다.';
  }
}

app.post('/skill', async (req, res) => {
  const dateParam = req.body.action?.params?.date || '오늘';
  let date;
  if (dateParam === '오늘') date = getYmd(0);
  else if (dateParam === '내일') date = getYmd(1);
  else if (dateParam === '어제') date = getYmd(-1);
  else if (/^\d{8}$/.test(dateParam)) date = dateParam;
  else date = getYmd(0);

  const eventKeyword = req.body.action?.params?.행사명 || ''; // 오픈빌더에서 행사명 엔티티로 전달

  const NEIS_KEY = process.env.NEIS_KEY;
  const ATPT_OFCDC_SC_CODE = 'S10'; // 예: 경남교육청
  const SD_SCHUL_CODE = '9091064';  // 예: 구산중학교

  try {
    // 급식정보 호출
    const mealRes = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE,
        SD_SCHUL_CODE,
        MLSV_YMD: date
      }
    });
    const mealRows = mealRes.data.mealServiceDietInfo?.[1]?.row || [];
    const mealInfo = mealRows.length > 0
      ? mealRows.map(r => `${r.MMEAL_SC_NM}: ${r.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n')
      : '급식 정보가 없습니다.';

    // 행사명 있을 때 학사일정 안내
    let eventInfo = '';
    if (eventKeyword.trim() !== '') {
      eventInfo = await getEventInfoFromApi(eventKeyword, NEIS_KEY, ATPT_OFCDC_SC_CODE, SD_SCHUL_CODE);
    }

    let responseText = mealInfo;
    if (eventInfo) {
      responseText += `\n\n[행사 안내]\n${eventInfo}`;
    }

    res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: responseText } }]
      }
    });
  } catch (e) {
    res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: '정보를 불러오는 중 오류가 발생했습니다.' } }]
      }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('서버 시작:', PORT));
