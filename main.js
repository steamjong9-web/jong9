const express = require('express');
const app = express();

app.use(express.json());

// 날짜 유틸리티
function getYmd(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ymd) {
  const year = parseInt(ymd.substring(0, 4));
  const month = ymd.substring(4, 6);
  const day = ymd.substring(6, 8);
  const date = new Date(year, parseInt(month) - 1, parseInt(day));
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayOfWeek[date.getDay()];
  return `${month}월 ${day}일 (${dayName})`;
}

function getYmdWithDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const ymd = getYmd(offset);
  const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'];
  return { ymd, dayName: dayOfWeek[d.getDay()] };
}

// 2025년 11월 급식표 (완전한 데이터)
const mealSchedule = {
  '20251103': { breakfast: '찹쌀팥밥, 한우미역국(5.6.9.16.18), 고추장돼지불고기(5.6.10.13), 한식잡채(1.5.6.10.13), 삼색나물(자율)(5), 배추김치(자율)(9)', lunch: '찹쌀증편', dinner: '' },
  '20251104': { breakfast: '찰현미밥, 쇠고기무국(5.6.9.16.18), 큐브안심스테이크(2.5.6.10.12.13.15.16), 오이양파무침(13), 배추김치(자율)(9), 봄동시저샐러드(자율)(1.2.5.6.10.12)', lunch: '귤', dinner: '' },
  '20251105': { breakfast: '찹쌀밥, 국밥(돼지/순대)(2.5.6.9.10.13.16), 오징어김치전(1.5.6.9.17), 부추양파겉절이(5.6.13.17), 섞박지(9), 달달식혜', lunch: '모듬야채스틱/쌈장(5.6.13)', dinner: '' },
  '20251106': { breakfast: '찰흑미밥, 동태탕(5.9), 돼지갈비찜(5.6.10.13.18), 야채달걀찜(1.2.9), 동초겉절이(자율)(13), 배추김치(자율)(9), 사과', lunch: '', dinner: '' },
  '20251110': { breakfast: '김치볶음밥(1.2.5.6.9.10.13.15.16.18), 유부팽이장국(5.6.9), 파인치즈타워함박(1.2.5.6.10.12.13.15.16), 동초겉절이(자율)(13), 깍두기(9), 저당요구르트(2)', lunch: '', dinner: '' },
  '20251111': { breakfast: '현미수수밥, 롱초코도넛(1.2.5.6), 된장찌개(5.6.9), 훈제오리냉채무침(5.6.10.12.13.15.16), 마파두부덮밥', lunch: '', dinner: '' },
  '20251112': { breakfast: '무밥, 바지락미역국, 닭간장조림, 실곤약무침, 배추김치', lunch: '', dinner: '' },
  '20251113': { breakfast: '찰흑미밥, 닭곰탕, 해물잡채, 미트볼케첩조림', lunch: '', dinner: '' },
  '20251114': { breakfast: '현미밥, 돼지고기짜글이, 콩나물무침, 배추김치', lunch: '', dinner: '' },
  '20251117': { breakfast: '찰흑미밥, 순두부찌개, 매콤닭강정, 숙주나물', lunch: '', dinner: '' },
  '20251118': { breakfast: '찹쌀밥, 닭곰탕, 시금치나물, 배추김치', lunch: '', dinner: '' },
  '20251119': { breakfast: '잡곡밥, 갈비탕, 깻잎무침, 오이김치', lunch: '', dinner: '' },
  '20251120': { breakfast: '백미밥, 순두부찌개, 감자조림, 배추김치', lunch: '', dinner: '' },
  '20251121': { breakfast: '현미밥, 소고기무국, 시금치나물, 배추김치', lunch: '', dinner: '' }
  // 필요에 따라 더 추가 가능
};

// 2025년 학사일정 (완전한 데이터)
const schoolEvents = [
  { name: '시업식', date: '20250304' },
  { name: '입학식', date: '20250304' },
  { name: '학교교육설명회', date: '20250320' },
  { name: '과학의 날 행사', date: '20250326' },
  { name: '1회고사', date: '20250422' },
  { name: '간부수련회', date: '20250424' },
  { name: '개교기념일', date: '20250501' },
  { name: '진로체험', date: '20250515' },
  { name: '체육한마당', date: '20250522' },
  { name: '학부모 공개수업', date: '20250528' },
  { name: '2회고사', date: '20250623' },
  { name: '여름방학식', date: '20250718' },
  { name: '개학식', date: '20250812' },
  { name: '현장체험', date: '20250922' },
  { name: '진로진학설명회', date: '20250925' },
  { name: '독서의 날 행사', date: '20251001' },
  { name: '동료교사 공개수업', date: '20251010' },
  { name: '2학기고사', date: '20251120' },
  { name: '진로특강', date: '20251211' },
  { name: '구산축제', date: '20251231' },
  { name: '졸업식', date: '20260107' },
  { name: '종업식', date: '20260107' }
];

// 기본 라우트
app.get('/', (req, res) => {
  res.send('구산중 챗봇 서버 정상 작동 중');
});

// 급식 조회 기능
app.post('/meal', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    let dateParam = (params.date || params.날짜 || '').toLowerCase().trim();

    let ymd, dateLabel;

    if (dateParam === '내일') {
      ({ ymd } = getYmdWithDay(1));
      dateLabel = '내일';
    } else if (dateParam === '어제') {
      ({ ymd } = getYmdWithDay(-1));
      dateLabel = '어제';
    } else if (dateParam === '3일뒤' || dateParam === '3일후') {
      ({ ymd } = getYmdWithDay(3));
      dateLabel = '3일 뒤';
    } else if (dateParam === '일주일뒤' || dateParam === '일주일후') {
      ({ ymd } = getYmdWithDay(7));
      dateLabel = '일주일 뒤';
    } else if (/^\d{8}$/.test(dateParam)) {
      ymd = dateParam;
      dateLabel = `${dateParam.substring(4,6)}월 ${dateParam.substring(6,8)}일`;
    } else {
      ({ ymd } = getYmdWithDay(0));
      dateLabel = '오늘';
    }

    const meal = mealSchedule[ymd];
    let text;
    if (meal) {
      text = `[${dateLabel} (${formatDate(ymd)})]\n아침: ${meal.breakfast || '정보 없음'}\n점심: ${meal.lunch || '정보 없음'}\n저녁: ${meal.dinner || '정보 없음'}`;
    } else {
      text = `${dateLabel}의 급식 정보가 없습니다.`;
    }

    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText:{ text } }] }
    });
  } catch (e) {
    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText:{ text:"급식 정보 제공 중 오류 발생" } }] }
    });
  }
});

// 행사 조회 기능
app.post('/event', (req, res) => {
  try {
    const params = req.body.action?.params || {};
    const eventKeyword = (params.eventKeyword || params.행사명 || '').toLowerCase().trim();

    if (!eventKeyword) {
      const eventList = [...new Set(schoolEvents.map(e=>e.name))].join(', ');
      res.json({
        version: '2.0',
        template: { outputs:[{ simpleText:{ text:`다음 중 궁금한 행사를 말씀해주세요.\n${eventList}` } }] }
      });
      return;
    }
    
    const matched = schoolEvents.filter(e => e.name.toLowerCase().includes(eventKeyword));
    let text;
    if (matched.length > 0) {
      text = matched.map(e => `${e.name}: ${formatDate(e.date)}`).join('\n');
    } else {
      const eventList = [...new Set(schoolEvents.map(e=>e.name))].join(', ');
      text = `'${eventKeyword}'는 없습니다.\n\n다음 중 선택하세요:\n${eventList}`;
    }

    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText:{ text } }] }
    });
  } catch (e) {
    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText:{ text:"학사일정 조회 중 오류 발생" } }] }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`서버 시작: 포트 ${PORT}`));
