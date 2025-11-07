const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('OK'));

app.post('/skill', async (req, res) => {
  const date = req.body.action?.params?.date || '20251111';
  const ATPT_OFCDC_SC_CODE = 'S10';
  const SD_SCHUL_CODE = '9091064';
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server started on', PORT));
