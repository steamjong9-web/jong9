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

app.post('/skill', async (req, res) => {
  const params = req.body.action?.params || {};
  const intent = params.intent || '';
  const dateParam = params.date || '오늘';
  const eventKeyword = params.eventKeyword || params.행사명 || '';

  let ymd;
  if (dateParam === '내일') ymd = getYmd(1);
  else if (dateParam === '어제') ymd = getYmd(-1);
  else if (/^\d{8}$/.test(dateParam)) ymd = dateParam;
  else ymd = getYmd(0);

  const NEIS_KEY = process.env.NEIS_KEY;
  const EDU = 'S10';
  const SCHOOL = '7531064';

  let text = '';

  if (intent === 'meal') {
    try {
      const r = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
        params: { KEY: NEIS_KEY, Type: 'json', ATPT_OFCDC_SC_CODE: EDU, SD_SCHUL_CODE: SCHOOL, MLSV_YMD: ymd }
      });
      const rows = r.data.mealServiceDietInfo?.[1]?.row || [];
      if (!rows.length) text = '급식 정보가 없습니다.';
      else text = rows.map(x => `${x.MMEAL_SC_NM}:\n${x.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n');
    } catch {
      text = '급식 정보를 불러오는 중 오류가 발생했습니다.';
    }
  } else if (intent === 'event') {
    try {
      const from = getYmd(0);
      const to = getYmd(240);
      const r = await axios.get('https://open.neis.go.kr/hub/SchoolSchedule', {
        params: { KEY: NEIS_KEY, Type: 'json', ATPT_OFCDC_SC_CODE: EDU, SD_SCHUL_CODE: SCHOOL, AA_FROM_YMD: from, AA_TO_YMD: to }
      });
      const rows = r.data?.SchoolSchedule?.[1]?.row || [];
      const matched = rows.filter(e => (e.EVENT_NM || '').toLowerCase().includes((eventKeyword || '').toLowerCase()));
      if (!matched.length) text = `${eventKeyword} 관련 학사일정이 없습니다.`;
      else text = matched.map(e => `${e.EVENT_NM}: ${e.EVENT_STRTDATE}`).join('\n');
    } catch {
      text = '학사일정을 불러오는 중 오류가 발생했습니다.';
    }
  } else {
    text = '급식 안내 또는 행사 안내를 선택해 주세요.';
  }

  res.json({ version: "2.0", template: { outputs: [{ simpleText: { text } }] } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('서버 시작:', PORT));
