const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// 날짜 계산 함수
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}${mm}${dd}`;
}

app.get('/', (req, res) => res.send('OK'));

app.post('/skill', async (req, res) => {
  // 오픈빌더에서 들어오는 발화 파라미터 처리
  let date;
  const userInput = req.body.action?.params?.date;

  if (userInput === '오늘' || !userInput) {
    date = getYmd(0);
  } else if (userInput === '내일') {
    date = getYmd(1);
  } else if (/^\d{8}$/.test(userInput)) {
    // 'YYYYMMDD' 형식이면 그대로 사용
    date = userInput;
  } else {
    // 기타는 오늘 날짜로 처리
    date = getYmd(0);
  }

  const ATPT_OFCDC_SC_CODE = 'S10';    // 시도교육청코드
  const SD_SCHUL_CODE = '9091064';     // 표준학교코드
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

// Render나 Cloudtype에서는 반드시 아래 형태!
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));
