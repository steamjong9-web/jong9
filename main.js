const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// 날짜 계산 함수: 오늘/내일/어제/특정일 다 지원
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}${mm}${dd}`;
}

app.get('/', (req, res) => res.send('OK'));

// 급식 스킬 엔드포인트
app.post('/skill', async (req, res) => {
  let date;
  const userInput = req.body.action?.params?.date;

  if (userInput === '오늘' || !userInput) {
    date = getYmd(0);
  } else if (userInput === '내일') {
    date = getYmd(1);
  } else if (userInput === '어제') {
    date = getYmd(-1);
  } else if (/^\d{8}$/.test(userInput)) {
    // YYYYMMDD 형식일 때
    date = userInput;
  } else {
    date = getYmd(0);
  }

  // 학교 코드/교육청 코드/환경변수 API키!
  const ATPT_OFCDC_SC_CODE = 'S10';    // 경상남도교육청
  const SD_SCHUL_CODE = '9091064';     // 구산중학교(예시, 실제 코드를 맞게 사용)
  const NEIS_KEY = process.env.NEIS_KEY;

  try {
    const result = await axios.get('https://open.neis.go.kr/hub/mealServiceDietInfo', {
      params: {
        KEY: NEIS_KEY,
        Type: 'json',
        ATPT_OFCDC_SC_CODE,
        SD_SCHUL_CODE,
        MLSV_YMD: date
      }
    });
    const rows = result.data.mealServiceDietInfo?.[1]?.row || [];
    const info = rows.map(r => `${r.MMEAL_SC_NM}: ${r.DDISH_NM.replace(/<br\/>/g, '\n')}`).join('\n\n');
    res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: info || '급식 정보가 없습니다.' } }]
      }
    });
  } catch (e) {
    res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: '오류가 발생했습니다.' } }]
      }
    });
  }
});

// Render/Cloudtype 환경에서는 반드시 아래처럼!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));
