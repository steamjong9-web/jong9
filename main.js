const express = require('express');
const app = express();

app.use(express.json());

// 2025년 11월 급식 (예시, 전체 원본 필요시 추가)
const mealSchedule = {
  '20251103': { breakfast: '찹쌀팥밥, 한우미역국, 고추장돼지불고기, 한식잡채, 삼색나물, 배추김치', lunch: '찹쌀증편', dinner: '' },
  '20251104': { breakfast: '찰현미밥, 쇠고기무국, 큐브안심스테이크, 오이양파무침, 배추김치, 봄동시저샐러드, 귤', lunch: '', dinner: '' },
  '20251105': { breakfast: '찹쌀밥, 국밥(돼지/순대), 오징어김치전, 부추양파겉절이, 섞박지, 달달식혜', lunch: '모듬야채스틱/쌈장', dinner: '' },
  // … 11월 전체 날짜 추가 가능
};

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

// 급식
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
      template: { outputs:[{ simpleText: { text:"급식 정보 제공 중 오류 발생" } }] }
    });
  }
});

// 행사: 모든 파라미터 경로 robust하게 지원 + 부분일치
app.post('/event', (req, res) => {
  try {
    // 파라미터 받기 (detailParams까지 모두 지원)
    let eventKeyword = '';
    const params = req.body.action?.params || {};
    eventKeyword = (params.eventKeyword || params.행사명 || '').trim();

    // detailParams 엔티티 방식도 지원
    if ((!eventKeyword || eventKeyword==='') && req.body.action?.detailParams) {
      eventKeyword = (
        req.body.action.detailParams?.eventKeyword?.origin || 
        req.body.action.detailParams?.행사명?.origin || 
        req.body.action.detailParams?.eventKeyword?.value ||
        req.body.action.detailParams?.행사명?.value || ''
      ).trim();
    }

    // 아무것도 없으면 안내 메시지
    if (!eventKeyword) {
      const eventList = schoolEvents.map(e=>e.name).join(', ');
      res.json({
        version: '2.0',
        template: { outputs:[{ simpleText: { text: `다음 중 궁금한 행사를 말씀해주세요.\n${eventList}` } }] }
      });
      return;
    }

    // 부분일치로 보정
    const keywordNorm = eventKeyword.replace(/\s/g,'').toLowerCase();
    const matched = schoolEvents.filter(e => 
      e.name.replace(/\s/g,'').toLowerCase().includes(keywordNorm)
    );

    let text;
    if (matched.length > 0) {
      text = matched.map(e => `${e.name}: ${formatDate(e.date)}`).join('\n');
    } else {
      const eventList = schoolEvents.map(e=>e.name).join(', ');
      text = `'${eventKeyword}' 관련 학사일정이 없습니다.\n\n다음 중 선택하세요:\n${eventList}`;
    }
    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText: { text } }] }
    });
  } catch (e) {
    res.json({
      version: '2.0',
      template: { outputs:[{ simpleText: { text:"학사일정 조회 중 오류 발생" } }] }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`서버 시작: 포트 ${PORT}`));
