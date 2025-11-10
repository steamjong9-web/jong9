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

app.get('/', (req, res) => res.send('구산중 챗봇 서버 정상 작동 중'));

app.post('/meal', async (req, res) => {
  const params = req.body.action?.params || {};
  const dateParam = params.date || '오늘';
  
  let ymd;
  if (dateParam === '내일') ymd = getYmd(1);
  else if (dateParam === '어제') ymd = getYmd(-1);
  else ymd = getYmd(0);

  const NEIS_KEY = process.env.NEIS_KEY;
  const EDU = 'S10';
  const SCHOOL = '9091064';

  try {
    const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: { KEY: NEIS_KEY, Type: 'json', ATPT_OFCDC_SC_CODE: EDU, SD_SCHUL_CODE: SCHOOL, MLSV_YMD: ymd },
      timeout: 3000
    });
    const rows = r.data.mealServiceDietInfo?.[1]?.row || [];
    const text = rows.length > 0
      ? rows.map(x => `${x.MMEAL_SC_NM}:\n${x.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n')
      : '급식 정보가 없습니다.';
    
    res.json({ version: "2.0", template: { outputs: [{ simpleText: { text } }] } });
  } catch (error) {
    console.error('급식 조회 오류:', error.message);
    res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: '급식 정보를 불러올 수 없습니다.' } }] } });
  }
});
app.post('/event', async (req, res) => {
  const params = req.body.action?.params || {};
  const eventKeyword = params.eventKeyword || params.행사명 || '';

  if (!eventKeyword) {
    res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: '행사명을 알려주세요. 예) 졸업식, 체육대회, 입학식' } }] } });
    return;
  }

  const NEIS_KEY = process.env.NEIS_KEY;
  const EDU = 'S10';
  const SCHOOL = '9091064';

  try {
    const from = getYmd(0);
    const to = getYmd(240);
    const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
      params: { KEY: NEIS_KEY, Type: 'json', ATPT_OFCDC_SC_CODE: EDU, SD_SCHUL_CODE: SCHOOL, AA_FROM_YMD: from, AA_TO_YMD: to }
    });
    const rows = r.data?.SchoolSchedule?.[1]?.row || [];
    const matched = rows.filter(e => (e.EVENT_NM || '').toLowerCase().includes(eventKeyword.toLowerCase()));
    
    const text = matched.length > 0
      ? matched.map(e => `${e.EVENT_NM}: ${e.EVENT_STRTDATE}`).join('\n')
      : `${eventKeyword} 관련 학사일정이 없습니다.`;
    
    res.json({ version: "2.0", template: { outputs: [{ simpleText: { text } }] } });
  } catch {
    res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: '학사일정을 불러올 수 없습니다.' } }] } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('서버 시작:', PORT));




