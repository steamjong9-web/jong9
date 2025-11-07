const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/skill', async (req, res) => {
  const date = req.body.action?.params?.date || '20251111'; // 예시 날짜
  const ATPT_OFCDC_SC_CODE = 'S10'; // 경남교육청
  const SD_SCHUL_CODE = '9091064';  // 구산중학교
  const NEIS_KEY = '여기에_본인_NEIS_API_KEY_입력';

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
  } catch {
    res.json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: '오류가 발생했습니다.' } }]
      }
    });
  }
});

app.listen(3000, () => console.log('Server started'));
